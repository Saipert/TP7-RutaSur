/**
 * Cuarto indicador: tiempo entre INGRESADO_HUB y EN_REPARTO del primer intento. Recibe el instante
 * de ingreso ya conocido y devuelve lo que corresponde guardar. Los eventos de un envio pueden
 * llegar en cualquier orden.
 */
export function medirTiempoEnHub(registro, evento) {
  const actual = registro ?? {};
  if (evento.tipo === 'INGRESADO_HUB') actual.ingreso = evento.ocurridoEn;
  else if (evento.tipo === 'EN_REPARTO' && evento.intento === 1) actual.salida = evento.ocurridoEn;
  else return { registro: actual, minutos: null };

  if (actual.ingreso && actual.salida) {
    return { registro: actual, minutos: (new Date(actual.salida) - new Date(actual.ingreso)) / 60000 };
  }
  return { registro: actual, minutos: null };
}
