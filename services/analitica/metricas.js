import { franjaDe } from '../../shared/reglas-reprogramacion.js';

/** Convierte un evento en los incrementos de metricas_diarias. Null si no aporta a un indicador. */
export function deltaDeMetricas(evento) {
  if (evento.tipo !== 'ENTREGADO' && evento.tipo !== 'ENTREGA_FALLIDA') return null;

  const clave = {
    fecha: evento.ocurridoEn.slice(0, 10),
    zonaId: evento.zonaId,
    franja: franjaDe(evento.ocurridoEn),
  };
  const inc = {};

  if (evento.intento === 1) inc.primerosIntentos = 1;

  if (evento.tipo === 'ENTREGADO') {
    inc.entregas = 1;
    if (evento.intento === 1) inc.entregasPrimerIntento = 1;
    if (evento.promesaVenceEn && evento.ocurridoEn <= evento.promesaVenceEn) inc.entregasEnPlazo = 1;
  } else {
    inc.fallos = 1;
    inc[`motivos.${evento.motivo}`] = 1;
  }

  return { clave, hubId: evento.hubId, inc };
}
