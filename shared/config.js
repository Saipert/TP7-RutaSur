export function requerirEnv(nombre, origen = process.env) {
  const valor = origen[nombre];
  if (!valor?.trim()) throw new Error(`Falta la variable de entorno ${nombre}`);
  return valor;
}

export const Topics = Object.freeze({
  ESTADOS: 'envios.estados',
  PROMESAS: 'envios.promesas',
  REPROGRAMACIONES: 'envios.reprogramaciones',
  ALERTAS: 'alertas.sla',
  NOTIFICACIONES: 'notificaciones.enviadas',
  DLQ: 'envios.estados.dlq',
});

/** Factor de aceleracion: 1 hora simulada = 30 segundos reales. */
export const ACELERACION = Number(process.env.ACELERACION ?? 120);

export const HORA_MS = 60 * 60 * 1000;
