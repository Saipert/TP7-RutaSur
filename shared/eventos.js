import { createHash } from 'node:crypto';
import { Ajv } from 'ajv';
import { Topics } from './config.js';

export const VERSION_ESQUEMA = 1;

export const ESTADOS = ['CREADO', 'INGRESADO_HUB', 'CLASIFICADO', 'EN_REPARTO', 'ENTREGADO', 'ENTREGA_FALLIDA'];
export const MOTIVOS = ['AUSENTE', 'DIRECCION_INCORRECTA', 'RECHAZADO', 'ZONA_INACCESIBLE'];
export const PRIORIDADES = ['MEDIA', 'ALTA', 'CRITICA'];

/**
 * Identificador determinista para los eventos derivados. Si un servicio se cae entre publicar
 * y confirmar, vuelve a publicar el mismo eventId y el consumidor lo descarta.
 */
export function idDerivado(...partes) {
  const hash = createHash('sha256').update(partes.join('|')).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

const comunes = {
  eventId: { type: 'string', minLength: 1 },
  shipmentId: { type: 'string', minLength: 1 },
  tipo: { type: 'string', minLength: 1 },
  ocurridoEn: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}T' },
  secuencia: { type: 'integer', minimum: 0 },
  hubId: { type: 'string', minLength: 1 },
  zonaId: { type: 'string', minLength: 1 },
  repartidorId: { type: ['string', 'null'] },
  version: { const: VERSION_ESQUEMA },
};
const obligatorios = ['eventId', 'shipmentId', 'tipo', 'ocurridoEn', 'secuencia', 'hubId', 'zonaId', 'version'];

const esquemaDe = (propiedades, extras = [], adicional = {}) => ({
  type: 'object',
  properties: { ...comunes, ...propiedades },
  required: [...obligatorios, ...extras],
  ...adicional,
});

const ajv = new Ajv({ allErrors: true });

const validadores = {
  [Topics.ESTADOS]: ajv.compile(
    esquemaDe(
      {
        tipo: { enum: ESTADOS },
        motivo: { enum: MOTIVOS },
        intento: { type: 'integer', minimum: 1 },
        promesaVenceEn: { type: 'string' },
      },
      ['intento'],
      {
        if: { properties: { tipo: { const: 'ENTREGA_FALLIDA' } } },
        then: { required: ['motivo'] },
      },
    ),
  ),
  [Topics.PROMESAS]: ajv.compile(
    esquemaDe({ tipo: { const: 'PROMESA' }, venceEn: { type: 'string' } }, ['venceEn']),
  ),
  [Topics.REPROGRAMACIONES]: ajv.compile(
    esquemaDe(
      {
        tipo: { enum: ['REPROGRAMADO', 'RETENIDO', 'DEVOLUCION'] },
        motivo: { enum: MOTIVOS },
        intento: { type: 'integer', minimum: 1 },
      },
      ['motivo', 'intento'],
    ),
  ),
  [Topics.ALERTAS]: ajv.compile(
    esquemaDe(
      {
        tipo: { enum: ['ALERTA_ABIERTA', 'ALERTA_CERRADA'] },
        alertaId: { type: 'string' },
        regla: { type: 'string' },
        prioridad: { enum: PRIORIDADES },
      },
      ['alertaId', 'regla', 'prioridad'],
    ),
  ),
  [Topics.NOTIFICACIONES]: ajv.compile(
    esquemaDe({ tipo: { const: 'NOTIFICACION' }, canal: { type: 'string' }, mensaje: { type: 'string' } }, ['mensaje']),
  ),
};

/** Valida un mensaje contra el esquema de su topic. Devuelve la lista de errores. */
export function validarEvento(topic, valor) {
  const validar = validadores[topic];
  if (!validar) return [`Topic sin esquema: ${topic}`];
  if (validar(valor)) return [];
  return validar.errors.map((e) => `${e.instancePath || 'evento'} ${e.message}`);
}

/** Campos comunes de un evento derivado a partir del evento que lo origina. */
export const dimensionesDe = ({ shipmentId, ocurridoEn, secuencia, hubId, zonaId, repartidorId }) => ({
  shipmentId,
  ocurridoEn,
  secuencia,
  hubId,
  zonaId,
  repartidorId: repartidorId ?? null,
  version: VERSION_ESQUEMA,
});
