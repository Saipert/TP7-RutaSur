import { Topics } from '../../shared/config.js';
import { arrancar, cerrarAlSalir, iniciarConsumidor } from '../../shared/consumidor.js';
import { crearKafka, crearProductor } from '../../shared/kafka.js';
import { aplicarUnaVez, conectarMongo } from '../../shared/mongo.js';
import { deltaDeMetricas } from './metricas.js';

const GRUPO = 'analitica';

async function principal() {
  const conexion = await conectarMongo();
  const metricas = conexion.db.collection('metricas_diarias');
  await metricas.createIndex({ fecha: 1, zonaId: 1, franja: 1 }, { unique: true });

  const kafka = crearKafka(GRUPO);
  const productor = await crearProductor(kafka);

  const consumidor = await iniciarConsumidor({
    kafka,
    productor,
    grupo: GRUPO,
    topics: [Topics.ESTADOS],
    manejar: async (evento) => {
      const delta = deltaDeMetricas(evento);
      if (!delta) return;
      await aplicarUnaVez(conexion, GRUPO, evento.eventId, async (session) => {
        // Incrementos atomicos: el tablero no recalcula sobre millones de documentos.
        await metricas.updateOne(
          delta.clave,
          { $inc: delta.inc, $set: { hubId: delta.hubId } },
          { upsert: true, session },
        );
      });
    },
  });

  cerrarAlSalir(() => consumidor.disconnect(), () => productor.cerrar(), () => conexion.client.close());
}

arrancar(principal);
