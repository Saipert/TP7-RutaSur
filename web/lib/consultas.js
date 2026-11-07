import { obtenerDb } from './mongo.js';

const PESO_PRIORIDAD = { CRITICA: 0, ALTA: 1, MEDIA: 2 };

export async function contadoresPorEstado() {
  const db = await obtenerDb();
  const filas = await db
    .collection('envios')
    .aggregate([{ $match: { estado: { $exists: true } } }, { $group: { _id: '$estado', total: { $sum: 1 } } }])
    .toArray();
  return Object.fromEntries(filas.map((f) => [f._id, f.total]));
}

export async function alertasAbiertas(limite = 30) {
  const db = await obtenerDb();
  const alertas = await db
    .collection('alertas')
    .find({ estado: 'ABIERTA' })
    .sort({ abiertaEn: -1 })
    .limit(500)
    .toArray();
  return alertas
    .sort((a, b) => PESO_PRIORIDAD[a.prioridad] - PESO_PRIORIDAD[b.prioridad])
    .slice(0, limite);
}

export async function ultimosEnvios(limite = 15) {
  const db = await obtenerDb();
  return db
    .collection('envios')
    .find({ estado: { $exists: true } })
    .sort({ actualizadoEn: -1 })
    .limit(limite)
    .toArray();
}

export async function detalleEnvio(shipmentId) {
  const db = await obtenerDb();
  const [envio, alertas, notificaciones] = await Promise.all([
    db.collection('envios').findOne({ shipmentId }),
    db.collection('alertas').find({ shipmentId }).sort({ abiertaEn: 1 }).toArray(),
    db.collection('notificaciones').find({ shipmentId }).sort({ ocurridoEn: 1 }).toArray(),
  ]);
  return { envio, alertas, notificaciones };
}

/** Solo los datos que puede ver el destinatario: nada de hubs, repartidores ni alertas. */
export async function trackingPublico(shipmentId) {
  const db = await obtenerDb();
  const envio = await db.collection('envios').findOne(
    { shipmentId },
    { projection: { _id: 0, shipmentId: 1, estado: 1, promesa: 1, resolucion: 1, actualizadoEn: 1 } },
  );
  return envio?.estado ? envio : null;
}

const pct = (parte, total) => (total > 0 ? parte / total : null);

export async function indicadores({ zonaId, hubId, fecha } = {}) {
  const db = await obtenerDb();
  const filtro = {};
  if (zonaId) filtro.zonaId = zonaId;
  if (hubId) filtro.hubId = hubId;
  if (fecha) filtro.fecha = fecha;

  const filas = await db.collection('metricas_diarias').find(filtro).toArray();

  const agrupar = (claves, acumular) => {
    const mapa = new Map();
    for (const fila of filas) {
      const clave = claves.map((c) => fila[c]).join(' · ');
      mapa.set(clave, acumular(mapa.get(clave), fila));
    }
    return [...mapa].sort(([a], [b]) => a.localeCompare(b));
  };

  const primerIntento = agrupar(['zonaId', 'franja', 'fecha'], (acc = { intentos: 0, entregas: 0 }, f) => ({
    intentos: acc.intentos + (f.primerosIntentos ?? 0),
    entregas: acc.entregas + (f.entregasPrimerIntento ?? 0),
  })).map(([clave, v]) => ({ clave, ...v, tasa: pct(v.entregas, v.intentos) }));

  const motivos = agrupar(['zonaId'], (acc = {}, f) => {
    const salida = { ...acc };
    for (const [motivo, total] of Object.entries(f.motivos ?? {})) salida[motivo] = (salida[motivo] ?? 0) + total;
    return salida;
  }).map(([clave, v]) => ({ clave, motivos: v, total: Object.values(v).reduce((s, n) => s + n, 0) }));

  const sla = agrupar(['hubId', 'fecha'], (acc = { entregas: 0, enPlazo: 0 }, f) => ({
    entregas: acc.entregas + (f.entregas ?? 0),
    enPlazo: acc.enPlazo + (f.entregasEnPlazo ?? 0),
  })).map(([clave, v]) => ({ clave, ...v, tasa: pct(v.enPlazo, v.entregas) }));

  const tiempos = await db.collection('metricas_tiempo_hub').find().sort({ _id: 1 }).toArray();

  return {
    primerIntento,
    motivos,
    sla,
    tiemposHub: tiempos.map((t) => ({ hubId: t._id, envios: t.envios, minutos: t.minutosTotales / t.envios })),
  };
}

export async function opcionesDeFiltro() {
  const db = await obtenerDb();
  const metricas = db.collection('metricas_diarias');
  const [zonas, hubs, fechas] = await Promise.all([
    metricas.distinct('zonaId'),
    metricas.distinct('hubId'),
    metricas.distinct('fecha'),
  ]);
  return { zonas: zonas.sort(), hubs: hubs.sort(), fechas: fechas.sort() };
}
