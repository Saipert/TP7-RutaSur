import { respuestaSse } from '@/lib/flujo-cambios';
import { obtenerDb } from '@/lib/mongo';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const shipmentId = new URL(request.url).searchParams.get('shipmentId');

  return respuestaSse(request, async () => {
    const db = await obtenerDb();
    const coincidencia = shipmentId
      ? [{ $match: { $or: [{ 'fullDocument.shipmentId': shipmentId }, { 'documentKey._id': { $exists: false } }] } }]
      : [];
    return [
      db.collection('envios').watch(coincidencia, { fullDocument: 'updateLookup' }),
      db.collection('alertas').watch(coincidencia, { fullDocument: 'updateLookup' }),
      db.collection('notificaciones').watch(coincidencia, { fullDocument: 'updateLookup' }),
    ];
  });
}
