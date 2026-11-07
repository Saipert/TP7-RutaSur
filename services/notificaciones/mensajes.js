const TEXTO_MOTIVO = {
  AUSENTE: 'no había nadie para recibirlo',
  DIRECCION_INCORRECTA: 'la dirección es incorrecta',
  RECHAZADO: 'el paquete fue rechazado',
  ZONA_INACCESIBLE: 'no se pudo acceder a la zona',
};

export function mensajeDeFallo({ shipmentId, motivo }) {
  return `No pudimos entregar tu envío ${shipmentId} porque ${TEXTO_MOTIVO[motivo]}. Podés reprogramarlo desde el tracking.`;
}

export function mensajeDeAlerta({ shipmentId }) {
  return `Tu envío ${shipmentId} podría demorarse. Estamos trabajando para cumplir la fecha prometida.`;
}
