import { MongoClient } from 'mongodb';

const estado = globalThis;

/** Next.js solo lee de MongoDB: nunca consume Kafka en forma directa. */
export async function obtenerDb() {
  if (!process.env.MONGO_URI) throw new Error('Falta la variable MONGO_URI');
  estado.rutasurCliente ??= new MongoClient(process.env.MONGO_URI).connect();
  return (await estado.rutasurCliente).db();
}
