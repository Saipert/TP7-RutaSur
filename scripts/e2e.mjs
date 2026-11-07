// Recorre los criterios de aceptacion contra el entorno levantado. Uso: npm run test:e2e
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { Kafka, Partitioners, logLevel } from 'kafkajs';
import { MongoClient } from 'mongodb';
import { recuento } from './recuento.mjs';

const WEB = 'http://localhost:3000';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(descripcion, comprobar, limiteMs = 60000) {
  const inicio = Date.now();
  while (Date.now() - inicio < limiteMs) {
    const valor = await comprobar();
    if (valor) return valor;
    await sleep(300);
  }
  throw new Error(`Tiempo agotado esperando: ${descripcion}`);
}

const mongo = new MongoClient('mongodb://localhost:27017/rutasur?directConnection=true');
const kafka = new Kafka({ clientId: 'e2e', brokers: ['localhost:9092'], logLevel: logLevel.NOTHING });
const productor = kafka.producer({ createPartitioner: Partitioners.DefaultPartitioner });
const compose = (args) => execSync(`docker compose ${args}`, { stdio: 'pipe' });

let db;
const envio = (id) => db.collection('envios').findOne({ shipmentId: id });
const alertasDe = (id) => db.collection('alertas').find({ shipmentId: id }).toArray();

async function disparar(nombre) {
  const respuesta = await fetch(`${WEB}/api/escenarios/${nombre}`, { method: 'POST' });
  assert.equal(respuesta.status, 202);
  return (await respuesta.json()).shipmentId;
}

// El tercer fallo y el demorado tardan varios minutos reales por el reloj simulado.
const hastaEstado = (id, estado, extra = () => true) =>
  until(`${id} en ${estado}`, async () => {
    const e = await envio(id);
    return e?.estado === estado && extra(e) ? e : null;
  }, 300000);

const tests = [];
const test = (nombre, fn) => tests.push({ nombre, fn });

test('Ciclo de vida: aparece en torre de control y tracking con su estado', async () => {
  const id = await disparar('feliz');
  const e = await hastaEstado(id, 'ENTREGADO');
  assert.deepEqual(e.historial.map((h) => h.tipo), ['CREADO', 'INGRESADO_HUB', 'CLASIFICADO', 'EN_REPARTO', 'ENTREGADO']);

  const tracking = await (await fetch(`${WEB}/tracking/${id}`)).text();
  assert.match(tracking, /Entregado/);
  assert.ok(!tracking.includes(e.hubId), 'el tracking publico no muestra datos internos');

  const detalle = await (await fetch(`${WEB}/envios/${id}`)).text();
  assert.ok(detalle.includes(e.hubId));
  assert.equal((await fetch(`${WEB}/`)).status, 200);
  assert.equal((await fetch(`${WEB}/analitica`)).status, 200);
  assert.equal((await fetch(`${WEB}/tracking/NO-EXISTE`)).status, 404);
});

test('Duplicado: no agrega una entrada repetida al historial', async () => {
  const id = await disparar('feliz');
  const e = await hastaEstado(id, 'ENTREGADO');
  const ultimo = e.historial.at(-1);
  await productor.send({
    topic: 'envios.estados',
    messages: [{
      key: id,
      value: JSON.stringify({ eventId: ultimo.eventId, shipmentId: id, tipo: ultimo.tipo, ocurridoEn: ultimo.ocurridoEn, secuencia: ultimo.secuencia, hubId: e.hubId, zonaId: e.zonaId, repartidorId: e.repartidorId, version: 1, intento: ultimo.intento }),
    }],
  });
  await sleep(3000);
  assert.equal((await envio(id)).historial.length, e.historial.length);
});

test('Fuera de orden: no hace retroceder el estado', async () => {
  const id = await disparar('feliz');
  const e = await hastaEstado(id, 'ENTREGADO');
  await productor.send({
    topic: 'envios.estados',
    messages: [{
      key: id,
      value: JSON.stringify({ eventId: `tarde-${Date.now()}`, shipmentId: id, tipo: 'CLASIFICADO', ocurridoEn: e.historial[0].ocurridoEn, secuencia: 2, hubId: e.hubId, zonaId: e.zonaId, repartidorId: null, version: 1, intento: 1 }),
    }],
  });
  await sleep(3000);
  const despues = await envio(id);
  assert.equal(despues.estado, 'ENTREGADO');
  assert.equal(despues.historial.length, e.historial.length);
});

test('Malformado: termina en la DLQ con su motivo y el flujo sigue', async () => {
  const consumidor = kafka.consumer({ groupId: `e2e-dlq-${Date.now()}` });
  await consumidor.connect();
  await consumidor.subscribe({ topic: 'envios.estados.dlq', fromBeginning: true });
  const muertos = [];
  await consumidor.run({
    eachMessage: async ({ message }) => {
      muertos.push({
        clave: message.key?.toString(),
        motivo: message.headers['x-motivo']?.toString(),
        consumidor: message.headers['x-consumidor']?.toString(),
      });
    },
  });
  const id = await disparar('invalido');
  const encontrado = await until('el mensaje en la DLQ', () => muertos.find((m) => m.clave === id));
  assert.match(encontrado.motivo, /esquema/);
  await until('todos los consumidores derivan', () => {
    const grupos = new Set(muertos.filter((m) => m.clave === id).map((m) => m.consumidor));
    return ['proyector', 'notificaciones', 'reprogramacion', 'monitor-sla', 'analitica'].every((g) => grupos.has(g));
  });
  await consumidor.disconnect();
  await hastaEstado(await disparar('feliz'), 'ENTREGADO');
});

test('Entrega fallida: una notificacion y una reprogramacion por evento', async () => {
  const id = await disparar('ausente');
  const e = await hastaEstado(id, 'ENTREGADO', (x) => x.reprogramaciones?.length >= 1);
  assert.equal(e.reprogramaciones.length, 1);
  assert.equal(e.reprogramaciones[0].tipo, 'REPROGRAMADO');
  assert.ok(e.reprogramaciones[0].proximoIntentoEn);
  const avisos = await until('el aviso', async () => {
    const n = await db.collection('notificaciones').find({ shipmentId: id }).toArray();
    return n.length ? n : null;
  });
  assert.equal(avisos.length, 1);
});

for (const [nombre, tipo] of [['direccion-incorrecta', 'RETENIDO'], ['zona-inaccesible', 'RETENIDO'], ['rechazado', 'DEVOLUCION']]) {
  test(`Regla de ${nombre}: ${tipo}`, async () => {
    const id = await disparar(nombre);
    const e = await hastaEstado(id, 'ENTREGA_FALLIDA', (x) => x.resolucion);
    assert.equal(e.resolucion.tipo, tipo);
  });
}

test('Tercer fallo: marca el envio para devolucion', async () => {
  const id = await disparar('tercer-fallo');
  const e = await hastaEstado(id, 'ENTREGA_FALLIDA', (x) => x.resolucion?.tipo === 'DEVOLUCION');
  assert.equal(e.intentos, 3);
  assert.deepEqual(e.reprogramaciones.map((r) => r.tipo), ['REPROGRAMADO', 'REPROGRAMADO', 'DEVOLUCION']);
});

test('Detener un servicio no afecta a los otros dos', async () => {
  compose('stop notificaciones');
  try {
    const id = await disparar('rechazado');
    const e = await hastaEstado(id, 'ENTREGA_FALLIDA', (x) => x.resolucion);
    assert.equal(e.resolucion.tipo, 'DEVOLUCION');
    assert.equal(await db.collection('notificaciones').countDocuments({ shipmentId: id }), 0);
    compose('start notificaciones');
    await until('el aviso pendiente al volver', () => db.collection('notificaciones').findOne({ shipmentId: id }));
    await sleep(2000);
    assert.equal(await db.collection('notificaciones').countDocuments({ shipmentId: id }), 1);
  } finally {
    compose('start notificaciones');
  }
});

const REGLAS = [
  ['sin-ingreso', 'SIN_INGRESO', 'MEDIA'],
  ['demorado', 'SIN_SALIDA', 'ALTA'],
  ['fallo-dia-limite', 'FALLO_DIA_LIMITE', 'ALTA'],
  ['vencido', 'VENCIDO', 'CRITICA'],
];
for (const [escenario, regla, prioridad] of REGLAS) {
  test(`SLA: ${regla} genera su alerta con prioridad ${prioridad}`, async () => {
    const id = await disparar(escenario);
    const alerta = await until(`alerta ${regla}`, async () => (await alertasDe(id)).find((a) => a.regla === regla), 90000);
    assert.equal(alerta.prioridad, prioridad);
    await sleep(3000);
    assert.equal((await alertasDe(id)).filter((a) => a.regla === regla).length, 1);
  });
}

test('SLA: la alerta se cierra cuando el envio se entrega', async () => {
  const id = await disparar('demorado');
  await until('alerta abierta', async () => (await alertasDe(id)).find((a) => a.regla === 'SIN_SALIDA'), 90000);
  await hastaEstado(id, 'ENTREGADO', () => true);
  await until('alerta cerrada', async () => (await alertasDe(id)).find((a) => a.regla === 'SIN_SALIDA' && a.estado === 'CERRADA'), 90000);
});

test('SLA: tras reiniciar el monitor no se pierden ni se repiten alertas', async () => {
  const id = await disparar('sin-ingreso');
  await until('alerta previa', async () => (await alertasDe(id)).length > 0, 90000);
  compose('restart monitor-sla');
  const vencer = await disparar('vencido');
  await until('alerta nueva tras reiniciar', async () => (await alertasDe(vencer)).find((a) => a.regla === 'VENCIDO'), 90000);
  await sleep(5000);
  const reglas = (await alertasDe(id)).map((a) => a.regla);
  assert.equal(new Set(reglas).size, reglas.length);
  const estado = await db.collection('monitor_estado').findOne({ _id: id });
  assert.ok(estado.emitidas.includes('SIN_INGRESO'));
});

test('Latencia: un evento se ve en la vista en menos de 2 segundos', async () => {
  const consumidor = kafka.consumer({ groupId: `e2e-lat-${Date.now()}` });
  const id = `LAT-${Date.now()}`;
  const stream = db.collection('envios').watch([{ $match: { 'fullDocument.shipmentId': id } }], { fullDocument: 'updateLookup' });
  const visto = new Promise((resolve) => stream.once('change', () => resolve(Date.now())));
  await sleep(300);
  const inicio = Date.now();
  await productor.send({
    topic: 'envios.estados',
    messages: [{
      key: id,
      value: JSON.stringify({ eventId: id, shipmentId: id, tipo: 'CREADO', ocurridoEn: new Date().toISOString(), secuencia: 1, hubId: 'HUB-NORTE', zonaId: 'Z1', repartidorId: null, version: 1, intento: 1 }),
    }],
  });
  const fin = await visto;
  await stream.close();
  await consumidor.disconnect();
  console.log(`      latencia evento a change stream: ${fin - inicio} ms`);
  assert.ok(fin - inicio < 2000);
});

test('Analitica: los indicadores coinciden con un recuento sobre el log', async () => {
  await sleep(5000);
  const { diferencias, eventos } = await recuento();
  assert.ok(eventos > 0);
  // Mientras corre el flujo pueden faltar los ultimos eventos: se admite solo un desfase hacia Kafka.
  assert.deepEqual(diferencias.filter((d) => !d.mongo && !d.kafka), []);
});

test('Cuarto indicador: se completa con el historico sin reiniciar nada', async () => {
  compose('--profile cuarto-indicador up -d analitica-hub');
  const agregados = await until('el historico', async () => {
    const filas = await db.collection('metricas_tiempo_hub').find().toArray();
    return filas.some((f) => f.envios > 3) ? filas : null;
  }, 60000);
  assert.ok(agregados.every((f) => f.minutosTotales > 0));
  const pagina = await (await fetch(`${WEB}/analitica`)).text();
  assert.match(pagina, /HUB-/);
});

test('Reconstruccion: borrar envios y reprocesar deja la coleccion igual', async () => {
  compose('stop simulador');
  await sleep(8000);
  const foto = async () => {
    const docs = await db.collection('envios').find({}, { projection: { _id: 0 } }).sort({ shipmentId: 1 }).toArray();
    return docs;
  };
  const antes = await foto();
  compose('stop proyector');
  const proceso = execSync(
    'docker compose run -d --no-deps -e REPROYECTAR=true proyector',
    { stdio: 'pipe' },
  ).toString().trim();
  const id = proceso.split('\n').pop();
  try {
    // Espera a que la coleccion se vacie y vuelva a tener todos los documentos, sin cambios.
    await until('el borrado', async () => (await db.collection('envios').countDocuments()) < antes.length, 30000);
    await until('la reconstruccion', async () => (await db.collection('envios').countDocuments()) >= antes.length, 240000);
    await sleep(15000);
    const despues = await foto();
    assert.equal(despues.length, antes.length);
    assert.deepEqual(despues, antes);
  } finally {
    execSync(`docker rm -f ${id}`, { stdio: 'pipe' });
    compose('start proyector simulador');
  }
});

await mongo.connect();
db = mongo.db();
await productor.connect();

let fallos = 0;
for (const { nombre, fn } of tests) {
  try {
    await fn();
    console.log(`ok    ${nombre}`);
  } catch (error) {
    fallos += 1;
    console.error(`FALLO ${nombre}\n      ${error.message.slice(0, 500)}`);
  }
}

await productor.disconnect();
await mongo.close();
console.log(`\n${tests.length - fallos}/${tests.length} pruebas correctas`);
process.exit(fallos ? 1 : 0);
