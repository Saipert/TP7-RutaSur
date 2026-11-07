import { Topics } from '../../shared/config.js';
import { arrancar, cerrarAlSalir, iniciarConsumidor } from '../../shared/consumidor.js';
import { crearKafka, crearProductor } from '../../shared/kafka.js';
import { aplicarUnaVez, conectarMongo } from '../../shared/mongo.js';
import { aplicarEstado } from './proyeccion.js';

const CONSUMIDOR = 'proyector';

async function crearIndices(db) {
  await db.collection('envios').createIndex({ shipmentId: 1 }, { unique: true });
  await db.collection('envios').createIndex({ estado: 1, zonaId: 1 });
  await db.collection('envios').createIndex({ 'promesa.venceEn': 1 });
  await db.collection('envios').createIndex({ actualizadoEn: -1 });
  await db.collection('alertas').createIndex({ estado: 1, prioridad: 1 });
  await db.collection('alertas').createIndex({ shipmentId: 1 });
  await db.collection('notificaciones').createIndex({ shipmentId: 1 });
}

/** Las vistas se pueden borrar y reconstruir: la fuente de verdad es el log de Kafka. */
async function borrarVistas(db) {
  await Promise.all(['envios', 'alertas', 'notificaciones'].map((c) => db.collection(c).deleteMany({})));
  await db.collection('eventos_procesados').deleteMany({ consumidor: CONSUMIDOR });
}

function crearManejadores(db) {
  const envios = db.collection('envios');
  const alertas = db.collection('alertas');
  const notificaciones = db.collection('notificaciones');

  return {
    async [Topics.ESTADOS](evento, session) {
      const actual = await envios.findOne({ shipmentId: evento.shipmentId }, { session });
      const cambio = aplicarEstado(actual, evento);
      if (!cambio) return;
      await envios.updateOne(
        { shipmentId: evento.shipmentId },
        {
          $set: cambio.set,
          $push: { historial: { $each: [cambio.entrada], $sort: { secuencia: 1 } } },
        },
        { upsert: true, session },
      );
    },

    async [Topics.PROMESAS](evento, session) {
      await envios.updateOne(
        { shipmentId: evento.shipmentId },
        { $set: { promesa: { venceEn: evento.venceEn }, hubId: evento.hubId, zonaId: evento.zonaId } },
        { upsert: true, session },
      );
    },

    async [Topics.REPROGRAMACIONES](evento, session) {
      await envios.updateOne(
        { shipmentId: evento.shipmentId },
        {
          $set: {
            resolucion: {
              tipo: evento.tipo,
              motivo: evento.motivo,
              intento: evento.intento,
              proximoIntentoEn: evento.proximoIntentoEn ?? null,
              franja: evento.franja ?? null,
            },
          },
          $push: {
            reprogramaciones: {
              $each: [{ tipo: evento.tipo, motivo: evento.motivo, intento: evento.intento, ocurridoEn: evento.ocurridoEn, proximoIntentoEn: evento.proximoIntentoEn ?? null }],
              $sort: { intento: 1 },
            },
          },
        },
        { upsert: true, session },
      );
    },

    async [Topics.ALERTAS](evento, session) {
      const base = {
        shipmentId: evento.shipmentId,
        regla: evento.regla,
        prioridad: evento.prioridad,
        causa: evento.causa,
        hubId: evento.hubId,
        zonaId: evento.zonaId,
      };
      await alertas.updateOne(
        { _id: evento.alertaId },
        evento.tipo === 'ALERTA_ABIERTA'
          ? { $set: base, $setOnInsert: { estado: 'ABIERTA' }, $min: { abiertaEn: evento.ocurridoEn } }
          : { $set: { ...base, estado: 'CERRADA', cerradaEn: evento.ocurridoEn } },
        { upsert: true, session },
      );
    },

    async [Topics.NOTIFICACIONES](evento, session) {
      await notificaciones.updateOne(
        { _id: evento.eventId },
        {
          $set: {
            shipmentId: evento.shipmentId,
            canal: evento.canal,
            mensaje: evento.mensaje,
            causa: evento.causa,
            ocurridoEn: evento.ocurridoEn,
          },
        },
        { upsert: true, session },
      );
    },
  };
}

async function principal() {
  const conexion = await conectarMongo();
  const { db } = conexion;
  const reproyectar = process.env.REPROYECTAR === 'true';
  // Un grupo nuevo vuelve a leer todo el log desde el inicio.
  const grupo = reproyectar ? `${CONSUMIDOR}-${Date.now()}` : CONSUMIDOR;

  if (reproyectar) {
    await borrarVistas(db);
    console.log(`Reconstruyendo las vistas con el grupo ${grupo}`);
  }
  await crearIndices(db);

  const manejadores = crearManejadores(db);
  const kafka = crearKafka(CONSUMIDOR);
  const productor = await crearProductor(kafka);
  const consumidor = await iniciarConsumidor({
    kafka,
    productor,
    grupo,
    topics: Object.keys(manejadores),
    manejar: (evento, topic) =>
      aplicarUnaVez(conexion, CONSUMIDOR, evento.eventId, (session) => manejadores[topic](evento, session)),
  });

  cerrarAlSalir(() => consumidor.disconnect(), () => productor.cerrar(), () => conexion.client.close());
}

arrancar(principal);
