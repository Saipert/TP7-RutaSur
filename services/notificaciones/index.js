import { Topics } from '../../shared/config.js';
import { arrancar, cerrarAlSalir, iniciarConsumidor } from '../../shared/consumidor.js';
import { dimensionesDe, idDerivado } from '../../shared/eventos.js';
import { crearKafka, crearProductor } from '../../shared/kafka.js';
import { aplicarUnaVez, conectarMongo } from '../../shared/mongo.js';
import { mensajeDeAlerta, mensajeDeFallo } from './mensajes.js';

const GRUPO = 'notificaciones';

/** Solo se registra el aviso: no se envian correos ni SMS reales. */
export function notificacionPara(topic, evento) {
  if (topic === Topics.ESTADOS && evento.tipo === 'ENTREGA_FALLIDA') {
    return { causa: 'ENTREGA_FALLIDA', mensaje: mensajeDeFallo(evento) };
  }
  if (topic === Topics.ALERTAS && evento.tipo === 'ALERTA_ABIERTA' && evento.prioridad !== 'MEDIA') {
    return { causa: 'ALERTA_SLA', mensaje: mensajeDeAlerta(evento) };
  }
  return null;
}

async function principal() {
  const conexion = await conectarMongo();
  const kafka = crearKafka(GRUPO);
  const productor = await crearProductor(kafka);

  const consumidor = await iniciarConsumidor({
    kafka,
    productor,
    grupo: GRUPO,
    topics: [Topics.ESTADOS, Topics.ALERTAS],
    manejar: async (evento, topic) => {
      const aviso = notificacionPara(topic, evento);
      await aplicarUnaVez(conexion, GRUPO, evento.eventId, async () => {
        if (!aviso) return;
        // El eventId es determinista: si esto se repite tras una caida, el proyector lo descarta.
        await productor.publicar(Topics.NOTIFICACIONES, {
          eventId: idDerivado(GRUPO, evento.eventId),
          tipo: 'NOTIFICACION',
          canal: 'SMS',
          ...aviso,
          ...dimensionesDe(evento),
        });
      });
    },
  });

  cerrarAlSalir(() => consumidor.disconnect(), () => productor.cerrar(), () => conexion.client.close());
}

arrancar(principal);
