import { HORA_MS } from './config.js';

export const MAX_INTENTOS = 3;

export const franjaDe = (fecha) => (new Date(fecha).getUTCHours() < 14 ? 'MANANA' : 'TARDE');
const franjaOpuesta = (franja) => (franja === 'MANANA' ? 'TARDE' : 'MANANA');

export function siguienteDiaHabil(fecha) {
  const d = new Date(fecha);
  do {
    d.setUTCDate(d.getUTCDate() + 1);
  } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d;
}

/**
 * Decide que pasa despues de una entrega fallida. El tercer fallo manda sobre el motivo.
 * ZONA_INACCESIBLE no tiene regla propia en la especificacion: como no se resuelve repitiendo
 * el intento, se trata igual que una direccion incorrecta y queda retenido.
 */
export function decidirReprogramacion({ motivo, intento, ocurridoEn }) {
  if (intento >= MAX_INTENTOS) return { tipo: 'DEVOLUCION' };
  if (motivo === 'RECHAZADO') return { tipo: 'DEVOLUCION' };
  if (motivo === 'DIRECCION_INCORRECTA' || motivo === 'ZONA_INACCESIBLE') return { tipo: 'RETENIDO' };

  const franja = franjaOpuesta(franjaDe(ocurridoEn));
  const dia = siguienteDiaHabil(ocurridoEn);
  dia.setUTCHours(franja === 'MANANA' ? 10 : 16, 0, 0, 0);
  return { tipo: 'REPROGRAMADO', franja, proximoIntento: intento + 1, proximoIntentoEn: dia.toISOString() };
}

export const horasEntre = (desde, hasta) => (new Date(hasta) - new Date(desde)) / HORA_MS;
