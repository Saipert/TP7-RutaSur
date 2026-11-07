import { Topics } from '../../shared/config.js';
import { arrancar, cerrarAlSalir, iniciarConsumidor } from '../../shared/consumidor.js';
import { dimensionesDe, idDerivado } from '../../shared/eventos.js';
import { crearKafka, crearProductor } from '../../shared/kafka.js';
import { aplicarUnaVez, conectarMongo } from '../../shared/mongo.js';
import { decidirReprogramacion } from '../../shared/reglas-reprogramacion.js';

const GRUPO = 'reprogramacion';

async function principal() {
  const conexion = await conectarMongo();
  const kafka = crearKafka(GRUPO);
  const productor = await crearProductor(kafka);

  const consumidor = await iniciarConsumidor({
    kafka,
    productor,
    grupo: GRUPO,
    topics: [Topics.ESTADOS],
    manejar: async (evento) => {
      if (evento.tipo !== 'ENTREGA_FALLIDA') return;
      await aplicarUnaVez(conexion, GRUPO, evento.eventId, async () => {
        const decision = decidirReprogramacion(evento);
        await productor.publicar(Topics.REPROGRAMACIONES, {
          eventId: idDerivado(GRUPO, evento.eventId),
          tipo: decision.tipo,
          motivo: evento.motivo,
          intento: evento.intento,
          ...(decision.proximoIntentoEn
            ? { proximoIntentoEn: decision.proximoIntentoEn, franja: decision.franja }
            : {}),
          ...dimensionesDe(evento),
        });
      });
    },
  });

  cerrarAlSalir(() => consumidor.disconnect(), () => productor.cerrar(), () => conexion.client.close());
}

arrancar(principal);
