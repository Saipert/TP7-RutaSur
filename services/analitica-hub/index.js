import { Topics } from '../../shared/config.js';
import { arrancar, cerrarAlSalir, iniciarConsumidor } from '../../shared/consumidor.js';
import { crearKafka, crearProductor } from '../../shared/kafka.js';
import { aplicarUnaVez, conectarMongo } from '../../shared/mongo.js';
import { medirTiempoEnHub } from './tiempos.js';

const GRUPO = 'analitica-tiempo-hub';

/**
 * Servicio del reprocesamiento: un grupo nuevo lee envios.estados desde el inicio y completa el
 * historico sin tocar a los demas servicios.
 */
async function principal() {
  const conexion = await conectarMongo();
  const registros = conexion.db.collection('tiempo_hub_envios');
  const agregados = conexion.db.collection('metricas_tiempo_hub');

  const kafka = crearKafka(GRUPO);
  const productor = await crearProductor(kafka);

  const consumidor = await iniciarConsumidor({
    kafka,
    productor,
    grupo: GRUPO,
    topics: [Topics.ESTADOS],
    manejar: async (evento) => {
      if (evento.tipo !== 'INGRESADO_HUB' && evento.tipo !== 'EN_REPARTO') return;
      await aplicarUnaVez(conexion, GRUPO, evento.eventId, async (session) => {
        const previo = await registros.findOne({ _id: evento.shipmentId }, { session });
        if (previo?.medido) return;
        const { registro, minutos } = medirTiempoEnHub(previo, evento);
        await registros.updateOne(
          { _id: evento.shipmentId },
          { $set: { ingreso: registro.ingreso ?? null, salida: registro.salida ?? null, medido: minutos !== null } },
          { upsert: true, session },
        );
        if (minutos !== null) {
          await agregados.updateOne(
            { _id: evento.hubId },
            { $inc: { envios: 1, minutosTotales: minutos } },
            { upsert: true, session },
          );
        }
      });
    },
  });

  cerrarAlSalir(() => consumidor.disconnect(), () => productor.cerrar(), () => conexion.client.close());
}

arrancar(principal);
