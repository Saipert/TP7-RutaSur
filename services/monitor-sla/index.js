import { ACELERACION, Topics } from '../../shared/config.js';
import { arrancar, cerrarAlSalir, iniciarConsumidor } from '../../shared/consumidor.js';
import { VERSION_ESQUEMA, idDerivado } from '../../shared/eventos.js';
import { crearKafka, crearProductor } from '../../shared/kafka.js';
import { conectarMongo } from '../../shared/mongo.js';
import { REGLAS, crearReloj, decidirAlertas, incorporarEvento } from './reglas.js';

const GRUPO = 'monitor-sla';
const MINUTO_SIMULADO_MS = 60 * 1000;
const REVISION_REAL_MS = Math.max(200, MINUTO_SIMULADO_MS / ACELERACION);

async function principal() {
  const { client, db } = await conectarMongo();
  const respaldo = db.collection('monitor_estado');

  // Estado en memoria con respaldo en MongoDB: un reinicio no pierde ni repite alertas.
  const envios = new Map();
  for (const envio of await respaldo.find({ tipoDoc: 'envio' }).toArray()) envios.set(envio.shipmentId, envio);
  const relojGuardado = await respaldo.findOne({ _id: 'reloj' });
  const reloj = crearReloj(ACELERACION, relojGuardado?.simulado ?? 0);
  console.log(`Monitor iniciado con ${envios.size} envíos abiertos`);

  const kafka = crearKafka(GRUPO);
  const productor = await crearProductor(kafka);

  const guardar = (envio) =>
    respaldo.updateOne(
      { _id: envio.shipmentId },
      { $set: { ...envio, tipoDoc: 'envio' } },
      { upsert: true },
    );

  const alertaDe = (envio, regla, tipo, ocurridoEn) => ({
    eventId: idDerivado(GRUPO, envio.shipmentId, regla, tipo),
    alertaId: `${envio.shipmentId}:${regla}`,
    shipmentId: envio.shipmentId,
    tipo,
    regla,
    prioridad: REGLAS[regla].prioridad,
    causa: REGLAS[regla].causa,
    ocurridoEn: new Date(ocurridoEn).toISOString(),
    secuencia: envio.secuencia < 0 ? 0 : envio.secuencia,
    hubId: envio.hubId,
    zonaId: envio.zonaId,
    repartidorId: envio.repartidorId ?? null,
    version: VERSION_ESQUEMA,
  });

  async function evaluar(envio, ahora) {
    const { abrir, cerrar } = decidirAlertas(envio, ahora);
    let actual = envio;

    // Primero se publica y despues se guarda. Una caida en el medio repite el mismo eventId.
    for (const regla of abrir) {
      await productor.publicar(Topics.ALERTAS, alertaDe(actual, regla, 'ALERTA_ABIERTA', ahora));
      actual = { ...actual, emitidas: [...actual.emitidas, regla] };
    }
    for (const regla of cerrar) {
      await productor.publicar(Topics.ALERTAS, alertaDe(actual, regla, 'ALERTA_CERRADA', ahora));
      actual = { ...actual, cerradas: [...(actual.cerradas ?? []), regla] };
    }
    if (actual !== envio) {
      envios.set(actual.shipmentId, actual);
      await guardar(actual);
    }
    return actual;
  }

  const consumidor = await iniciarConsumidor({
    kafka,
    productor,
    grupo: GRUPO,
    topics: [Topics.ESTADOS, Topics.PROMESAS],
    manejar: async (evento) => {
      reloj.avanzar(evento.ocurridoEn);
      const envio = incorporarEvento(envios.get(evento.shipmentId), evento);
      envios.set(evento.shipmentId, envio);
      await guardar(envio);
      await evaluar(envio, reloj.ahora());
      await respaldo.updateOne({ _id: 'reloj' }, { $set: { simulado: reloj.ahora() } }, { upsert: true });
    },
  });

  // Evaluacion por tiempo: la alerta la dispara la ausencia de un evento, no su llegada.
  let ultimoMinuto = 0;
  let evaluando = false;
  const revision = setInterval(async () => {
    const ahora = reloj.ahora();
    if (evaluando || ahora === 0 || ahora - ultimoMinuto < MINUTO_SIMULADO_MS) return;
    evaluando = true;
    ultimoMinuto = ahora;
    try {
      for (const envio of envios.values()) {
        if (envio.ultimoEstado !== 'ENTREGADO') await evaluar(envio, ahora);
      }
      await respaldo.updateOne({ _id: 'reloj' }, { $set: { simulado: ahora } }, { upsert: true });
    } catch (error) {
      console.error('Falló la revisión periódica', error);
    } finally {
      evaluando = false;
    }
  }, REVISION_REAL_MS);

  cerrarAlSalir(
    async () => clearInterval(revision),
    () => consumidor.disconnect(),
    () => productor.cerrar(),
    () => client.close(),
  );
}

arrancar(principal);
