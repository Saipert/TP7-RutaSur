import { HORA_MS, Topics } from '../../shared/config.js';
import { VERSION_ESQUEMA, idDerivado } from '../../shared/eventos.js';
import { decidirReprogramacion } from '../../shared/reglas-reprogramacion.js';

export const INICIO_SIMULADO = Date.UTC(2026, 2, 2, 9, 0, 0); // Lunes 2 de marzo de 2026, 09:00.
const PROMESA_HORAS = 18;

export const ZONAS = [
  { zonaId: 'Z1', hubId: 'HUB-NORTE', tasaFallo: 0.05 },
  { zonaId: 'Z2', hubId: 'HUB-NORTE', tasaFallo: 0.1 },
  { zonaId: 'Z3', hubId: 'HUB-CENTRO', tasaFallo: 0.15 },
  { zonaId: 'Z4', hubId: 'HUB-CENTRO', tasaFallo: 0.2 },
  { zonaId: 'Z5', hubId: 'HUB-SUR', tasaFallo: 0.25 },
  { zonaId: 'Z6', hubId: 'HUB-SUR', tasaFallo: 0.3 },
];

export const PARAMETROS = {
  probDemoraHub: 0.1,
  probDuplicado: 0.02,
  probFueraDeOrden: 0.02,
  probMalformado: 0.01,
};

/** Generador con semilla (mulberry32): la misma semilla repite exactamente la misma corrida. */
export function crearRng(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function elegirMotivo(azar) {
  if (azar < 0.6) return 'AUSENTE';
  if (azar < 0.8) return 'DIRECCION_INCORRECTA';
  if (azar < 0.95) return 'RECHAZADO';
  return 'ZONA_INACCESIBLE';
}

const iso = (ms) => new Date(ms).toISOString();

/**
 * Arma el plan de un envio: la lista de mensajes con el instante simulado en que se publican.
 * `guion` fija el resultado de los escenarios de la demo; sin guion, lo decide el azar.
 */
export function planDeEnvio({ shipmentId, creadoEn, rng, guion = {}, parametros = PARAMETROS }) {
  const zona = guion.zona ?? ZONAS[Math.floor(rng() * ZONAS.length)];
  const repartidorId = `R${String(Math.floor(rng() * 120) + 1).padStart(3, '0')}`;
  const venceEn = creadoEn + (guion.promesaHoras ?? PROMESA_HORAS) * HORA_MS;
  const demora = guion.demoraHubHoras ?? (rng() < parametros.probDemoraHub ? 9 + rng() : 0);
  const plan = [];
  let secuencia = 0;

  const estado = (tipo, ms, extra = {}) => {
    secuencia += 1;
    plan.push({
      en: ms,
      topic: Topics.ESTADOS,
      evento: {
        eventId: idDerivado(shipmentId, 'estado', secuencia),
        shipmentId,
        tipo,
        ocurridoEn: iso(ms),
        secuencia,
        hubId: zona.hubId,
        zonaId: zona.zonaId,
        repartidorId: ['CREADO', 'INGRESADO_HUB'].includes(tipo) ? null : repartidorId,
        version: VERSION_ESQUEMA,
        intento: extra.intento ?? 1,
        ...extra,
      },
    });
  };

  plan.push({
    en: creadoEn,
    topic: Topics.PROMESAS,
    evento: {
      eventId: idDerivado(shipmentId, 'promesa'),
      shipmentId,
      tipo: 'PROMESA',
      ocurridoEn: iso(creadoEn),
      secuencia: 0,
      hubId: zona.hubId,
      zonaId: zona.zonaId,
      repartidorId: null,
      version: VERSION_ESQUEMA,
      venceEn: iso(venceEn),
    },
  });

  const esc = guion.horasPorPaso ?? 1;
  let t = creadoEn;
  estado('CREADO', t);

  if (guion.detenerAntesDeHub) return plan;

  t += (1 + demora) * HORA_MS * esc;
  estado('INGRESADO_HUB', t);
  t += HORA_MS * esc;
  estado('CLASIFICADO', t);
  t += HORA_MS * esc;

  for (let intento = 1; ; intento += 1) {
    estado('EN_REPARTO', t, { intento });
    t += HORA_MS * 2 * esc;

    const fallos = guion.fallos;
    const falla = fallos ? intento <= fallos.length : rng() < zona.tasaFallo;
    if (!falla) {
      estado('ENTREGADO', t, { intento, promesaVenceEn: iso(venceEn) });
      return plan;
    }

    const motivo = fallos ? fallos[intento - 1] : elegirMotivo(rng());
    estado('ENTREGA_FALLIDA', t, { intento, motivo });

    const decision = decidirReprogramacion({ motivo, intento, ocurridoEn: iso(t) });
    if (decision.tipo !== 'REPROGRAMADO') return plan;

    // En los escenarios se acorta la espera real; el evento conserva su fecha reprogramada.
    t = guion.horasPorPaso ? t + HORA_MS * esc : new Date(decision.proximoIntentoEn).getTime();
  }
}

/** Agrega las anomalias del flujo continuo, para probar la idempotencia, el orden y la DLQ. */
export function conAnomalias(plan, rng, parametros = PARAMETROS) {
  const salida = [];
  for (let i = 0; i < plan.length; i += 1) {
    const paso = plan[i];
    const siguiente = plan[i + 1];
    const anteDeReparto = ['CREADO', 'INGRESADO_HUB'].includes(paso.evento.tipo);

    if (anteDeReparto && siguiente?.topic === Topics.ESTADOS && rng() < parametros.probFueraDeOrden) {
      // El paso siguiente sale antes: el evento mas viejo llega tarde.
      salida.push({ ...siguiente, en: paso.en }, { ...paso, en: paso.en + 1 });
      i += 1;
      continue;
    }

    salida.push(paso);

    if (rng() < parametros.probDuplicado) salida.push({ ...paso, en: paso.en + 1 });
    if (rng() < parametros.probMalformado) {
      salida.push({
        en: paso.en + 2,
        topic: Topics.ESTADOS,
        crudo: JSON.stringify({ shipmentId: paso.evento.shipmentId, tipo: 'ESTADO_INEXISTENTE' }),
        clave: paso.evento.shipmentId,
      });
    }
  }
  return salida;
}
