import { Topics } from './config.js';
import { validarEvento } from './eventos.js';

const ESPERAS_MS = [1000, 2000, 4000];
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Procesa un mensaje: valida, reintenta los errores tecnicos y deriva a la DLQ. */
export async function procesarMensaje({ topic, crudo, manejar, aDlq, log, esperas = ESPERAS_MS, dormir = esperar }) {
  let evento;
  try {
    evento = JSON.parse(crudo);
  } catch {
    await aDlq('El mensaje no es JSON valido');
    return 'dlq';
  }

  const errores = validarEvento(topic, evento);
  if (errores.length > 0) {
    await aDlq(`No cumple el esquema: ${errores.join('; ')}`);
    return 'dlq';
  }

  for (let intento = 0; ; intento += 1) {
    try {
      await manejar(evento, topic);
      return 'ok';
    } catch (error) {
      if (intento >= esperas.length) {
        await aDlq(`Reintentos agotados: ${error.message}`);
        return 'dlq';
      }
      log(`Reintento ${intento + 1}: ${error.message}`);
      await dormir(esperas[intento]);
    }
  }
}

/**
 * Consumidor con commit manual: el offset se confirma despues de escribir, asi un fallo a mitad
 * de proceso reintenta el evento en lugar de perderlo.
 */
export async function iniciarConsumidor({ kafka, productor, grupo, topics, manejar, desdeInicio = true }) {
  const consumidor = kafka.consumer({ groupId: grupo, sessionTimeout: 15000, heartbeatInterval: 3000 });
  await consumidor.connect();
  await consumidor.subscribe({ topics, fromBeginning: desdeInicio });

  await consumidor.run({
    autoCommit: false,
    eachMessage: async ({ topic, partition, message }) => {
      const posicion = `grupo=${grupo} topic=${topic} particion=${partition} offset=${message.offset}`;
      const crudo = message.value?.toString() ?? '';
      const log = (texto) => console.log(`${texto} ${posicion}`);

      const resultado = await procesarMensaje({
        topic,
        crudo,
        log,
        manejar: async (evento) => {
          await manejar(evento, topic);
          log(`eventId=${evento.eventId} tipo=${evento.tipo}`);
        },
        aDlq: async (motivo) => {
          log(`A la DLQ: ${motivo}`);
          await productor.publicarCrudo(Topics.DLQ, message.key, crudo || null, {
            'x-motivo': motivo.slice(0, 500),
            'x-consumidor': grupo,
            'x-topic-origen': topic,
            'x-particion-origen': String(partition),
            'x-offset-origen': String(message.offset),
          });
        },
      });

      await consumidor.commitOffsets([
        { topic, partition, offset: (BigInt(message.offset) + 1n).toString() },
      ]);
      return resultado;
    },
  });
  return consumidor;
}

/** Cierre ordenado: al detener un servicio deja el grupo sin esperar el timeout de sesion. */
export function cerrarAlSalir(...cerrables) {
  const cerrar = async () => {
    await Promise.allSettled(cerrables.map((c) => c()));
    process.exit(0);
  };
  process.on('SIGTERM', cerrar);
  process.on('SIGINT', cerrar);
}

export function arrancar(principal) {
  principal().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
