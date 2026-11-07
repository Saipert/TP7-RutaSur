import { MongoClient } from 'mongodb';
import { requerirEnv } from './config.js';

const TTL_PROCESADOS_S = 7 * 24 * 60 * 60;

export async function conectarMongo() {
  const client = new MongoClient(requerirEnv('MONGO_URI'));
  await client.connect();
  const db = client.db();
  await db.collection('eventos_procesados').createIndex({ consumidor: 1, eventId: 1 }, { unique: true });
  await db.collection('eventos_procesados').createIndex({ procesadoEn: 1 }, { expireAfterSeconds: TTL_PROCESADOS_S });
  return { client, db };
}

const esDuplicado = (error) => error?.code === 11000 && String(error.message).includes('eventos_procesados');

/**
 * Aplica el efecto una sola vez por consumidor y eventId: el registro de idempotencia y el
 * efecto se confirman en la misma transaccion. Devuelve false si el evento era un duplicado.
 */
export async function aplicarUnaVez({ client, db }, consumidor, eventId, efecto) {
  const procesados = db.collection('eventos_procesados');
  if (await procesados.findOne({ consumidor, eventId })) return false;

  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      await procesados.insertOne({ consumidor, eventId, procesadoEn: new Date() }, { session });
      await efecto(session);
    });
    return true;
  } catch (error) {
    if (esDuplicado(error)) return false;
    throw error;
  } finally {
    await session.endSession();
  }
}
