export const ESTADOS = ['CREADO', 'INGRESADO_HUB', 'CLASIFICADO', 'EN_REPARTO', 'ENTREGADO', 'ENTREGA_FALLIDA'];

export const NOMBRE_ESTADO = {
  CREADO: 'Creado',
  INGRESADO_HUB: 'En el hub',
  CLASIFICADO: 'Clasificado',
  EN_REPARTO: 'En reparto',
  ENTREGADO: 'Entregado',
  ENTREGA_FALLIDA: 'Entrega fallida',
};

export const NOMBRE_RESOLUCION = {
  REPROGRAMADO: 'Reprogramado',
  RETENIDO: 'Retenido hasta corregir los datos',
  DEVOLUCION: 'Devolución al comercio',
};

export const NOMBRE_REGLA = {
  SIN_INGRESO: 'Sin ingreso',
  SIN_SALIDA: 'Sin salida',
  FALLO_DIA_LIMITE: 'Fallo en el día límite',
  VENCIDO: 'Vencido',
};

/** Fechas del reloj simulado, siempre en UTC para que el servidor y el navegador coincidan. */
export function fechaHora(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC',
  }).format(new Date(iso));
}

export const porcentaje = (valor) => (valor === null || valor === undefined ? 'Sin datos' : `${(valor * 100).toFixed(1).replace('.', ',')}%`);
