import { Kafka, Partitioners, logLevel } from 'kafkajs';
import { requerirEnv } from './config.js';

export function crearKafka(clientId) {
  return new Kafka({
    clientId,
    brokers: requerirEnv('KAFKA_BROKERS').split(','),
    logLevel: logLevel.WARN,
    retry: { retries: 15, initialRetryTime: 500 },
  });
}

export async function crearProductor(kafka) {
  const productor = kafka.producer({
    createPartitioner: Partitioners.DefaultPartitioner,
    allowAutoTopicCreation: false,
  });
  await productor.connect();
  return {
    /** Publica con shipmentId como clave: garantiza el orden de los eventos de un paquete. */
    publicar: (topic, evento, headers) =>
      productor.send({
        topic,
        messages: [{ key: evento.shipmentId, value: JSON.stringify(evento), headers }],
      }),
    publicarCrudo: (topic, key, value, headers) =>
      productor.send({ topic, messages: [{ key, value, headers }] }),
    cerrar: () => productor.disconnect(),
  };
}
