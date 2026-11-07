// Compara metricas_diarias con un recuento hecho directamente sobre el log de Kafka.
import { Kafka, logLevel } from 'kafkajs';
import { MongoClient } from 'mongodb';
import { deltaDeMetricas } from '../services/analitica/metricas.js';

export async function recuento({ brokers = ['localhost:9092'], uri = 'mongodb://localhost:27017/rutasur?directConnection=true' } = {}) {
  const kafka = new Kafka({ clientId: 'recuento', brokers, logLevel: logLevel.NOTHING });
  const admin = kafka.admin();
  await admin.connect();
  const offsets = await admin.fetchTopicOffsets('envios.estados');
  await admin.disconnect();
  const finales = new Map(offsets.map((o) => [o.partition, BigInt(o.high)]));

  const consumidor = kafka.consumer({ groupId: `recuento-${Date.now()}` });
  await consumidor.connect();
  await consumidor.subscribe({ topic: 'envios.estados', fromBeginning: true });

  const vistos = new Set();
  const esperado = new Map();

  await new Promise((resolve) => {
    const pendientes = new Set([...finales].filter(([, fin]) => fin > 0n).map(([p]) => p));
    if (pendientes.size === 0) resolve();
    consumidor.run({
      eachMessage: async ({ partition, message }) => {
        try {
          const evento = JSON.parse(message.value.toString());
          if (evento.eventId && !vistos.has(evento.eventId)) {
            vistos.add(evento.eventId);
            const delta = evento.secuencia !== undefined && evento.version === 1 ? deltaDeMetricas(evento) : null;
            if (delta) {
              const clave = `${delta.clave.fecha}|${delta.clave.zonaId}|${delta.clave.franja}`;
              const acum = esperado.get(clave) ?? {};
              for (const [campo, n] of Object.entries(delta.inc)) acum[campo] = (acum[campo] ?? 0) + n;
              esperado.set(clave, acum);
            }
          }
        } catch {
          // Los mensajes malformados no cuentan, igual que en el servicio.
        }
        if (BigInt(message.offset) + 1n >= finales.get(partition)) {
          pendientes.delete(partition);
          if (pendientes.size === 0) resolve();
        }
      },
    });
  });
  await consumidor.disconnect();

  const mongo = new MongoClient(uri);
  await mongo.connect();
  const filas = await mongo.db().collection('metricas_diarias').find().toArray();
  await mongo.close();

  const plano = (f) => {
    const salida = {};
    for (const [k, v] of Object.entries(f)) {
      if (k === 'motivos') for (const [m, n] of Object.entries(v)) salida[`motivos.${m}`] = n;
      else if (!['_id', 'fecha', 'zonaId', 'franja', 'hubId'].includes(k)) salida[k] = v;
    }
    return salida;
  };
  const orden = (o) => JSON.stringify(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

  const reales = new Map(filas.map((f) => [`${f.fecha}|${f.zonaId}|${f.franja}`, plano(f)]));
  const diferencias = [];
  for (const clave of new Set([...esperado.keys(), ...reales.keys()])) {
    if (orden(esperado.get(clave) ?? {}) !== orden(reales.get(clave) ?? {})) {
      diferencias.push({ clave, kafka: esperado.get(clave), mongo: reales.get(clave) });
    }
  }
  return { filas: esperado.size, eventos: vistos.size, diferencias };
}

if (process.argv[1]?.endsWith('recuento.mjs')) {
  const resultado = await recuento();
  console.log(`Eventos: ${resultado.eventos}. Filas: ${resultado.filas}. Diferencias: ${resultado.diferencias.length}`);
  if (resultado.diferencias.length) console.log(JSON.stringify(resultado.diferencias.slice(0, 5), null, 2));
  process.exit(resultado.diferencias.length ? 1 : 0);
}
