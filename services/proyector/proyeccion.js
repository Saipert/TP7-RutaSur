/**
 * Calcula el cambio que un evento de estado produce en el documento del envio.
 * Regla de orden: un evento con secuencia menor o igual a la aplicada se descarta.
 */
export function aplicarEstado(envio, evento) {
  const ultima = envio?.ultimaSecuencia ?? 0;
  if (evento.secuencia <= ultima) return null;

  const entrada = {
    eventId: evento.eventId,
    tipo: evento.tipo,
    ocurridoEn: evento.ocurridoEn,
    secuencia: evento.secuencia,
    intento: evento.intento,
    ...(evento.motivo ? { motivo: evento.motivo } : {}),
  };

  return {
    set: {
      estado: evento.tipo,
      ultimaSecuencia: evento.secuencia,
      intentos: evento.intento,
      hubId: evento.hubId,
      zonaId: evento.zonaId,
      repartidorId: evento.repartidorId ?? envio?.repartidorId ?? null,
      actualizadoEn: evento.ocurridoEn,
      ...(evento.tipo === 'ENTREGA_FALLIDA' ? { ultimoMotivo: evento.motivo } : {}),
    },
    entrada,
  };
}

export const RESOLUCIONES = { RETENIDO: 'RETENIDO', DEVOLUCION: 'DEVOLUCION', REPROGRAMADO: 'REPROGRAMADO' };
