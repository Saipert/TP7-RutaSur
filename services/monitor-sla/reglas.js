import { HORA_MS } from '../../shared/config.js';

export const REGLAS = {
  SIN_INGRESO: { prioridad: 'MEDIA', causa: 'Faltan menos de 10 h y no ingresó al hub' },
  SIN_SALIDA: { prioridad: 'ALTA', causa: 'Faltan menos de 4 h y no está en reparto' },
  FALLO_DIA_LIMITE: { prioridad: 'ALTA', causa: 'Entrega fallida el día en que vence la promesa' },
  VENCIDO: { prioridad: 'CRITICA', causa: 'Pasó el vencimiento sin entrega' },
};

const ANTES_DEL_HUB = new Set(['CREADO']);
const SIN_SALIR = new Set(['CREADO', 'INGRESADO_HUB', 'CLASIFICADO']);

const mismoDia = (a, b) => new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);

/** Devuelve las reglas que se cumplen para un envio en el instante simulado `ahora`. */
export function evaluarReglas(envio, ahora) {
  const { ultimoEstado, venceEn, ocurridoEn } = envio;
  if (!venceEn || !ultimoEstado || ultimoEstado === 'ENTREGADO') return [];

  const vence = new Date(venceEn).getTime();
  const faltaMs = vence - ahora;
  const reglas = [];

  if (faltaMs < 0) return ['VENCIDO'];
  if (faltaMs < 10 * HORA_MS && ANTES_DEL_HUB.has(ultimoEstado)) reglas.push('SIN_INGRESO');
  if (faltaMs < 4 * HORA_MS && SIN_SALIR.has(ultimoEstado)) reglas.push('SIN_SALIDA');
  if (ultimoEstado === 'ENTREGA_FALLIDA' && mismoDia(ocurridoEn, vence)) reglas.push('FALLO_DIA_LIMITE');
  return reglas;
}

/** Actualiza el estado interno de un envio con un evento. El orden lo da la secuencia. */
export function incorporarEvento(envio, evento) {
  const actual = envio ?? { shipmentId: evento.shipmentId, emitidas: [], secuencia: -1 };
  if (evento.tipo === 'PROMESA') {
    return { ...actual, venceEn: evento.venceEn, hubId: evento.hubId, zonaId: evento.zonaId };
  }
  if (evento.secuencia <= actual.secuencia) return actual;
  return {
    ...actual,
    ultimoEstado: evento.tipo,
    secuencia: evento.secuencia,
    ocurridoEn: evento.ocurridoEn,
    hubId: evento.hubId,
    zonaId: evento.zonaId,
    repartidorId: evento.repartidorId ?? null,
  };
}

/** Reglas nuevas para abrir, sin repetir las ya emitidas, y alertas a cerrar si se entrego. */
export function decidirAlertas(envio, ahora) {
  if (envio.ultimoEstado === 'ENTREGADO') {
    const emitidas = envio.emitidas.filter((regla) => !(envio.cerradas ?? []).includes(regla));
    return { abrir: [], cerrar: emitidas };
  }
  return {
    abrir: evaluarReglas(envio, ahora).filter((regla) => !envio.emitidas.includes(regla)),
    cerrar: [],
  };
}

/**
 * Reloj simulado: avanza con el tiempo que viaja en los eventos, nunca retrocede y, si no llega
 * ningun evento, sigue al ritmo del factor de aceleracion para detectar la ausencia de eventos.
 */
export function crearReloj(aceleracion, inicial = 0, ahoraReal = Date.now) {
  let simulado = inicial;
  let realAncla = ahoraReal();
  return {
    avanzar(ocurridoEn) {
      const instante = new Date(ocurridoEn).getTime();
      if (instante > simulado) {
        simulado = instante;
        realAncla = ahoraReal();
      }
    },
    ahora() {
      return simulado === 0 ? 0 : simulado + (ahoraReal() - realAncla) * aceleracion;
    },
  };
}
