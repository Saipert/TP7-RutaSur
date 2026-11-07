import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Topics } from '../shared/config.js';
import { validarEvento } from '../shared/eventos.js';
import {
  INICIO_SIMULADO, ZONAS, conAnomalias, crearRng, elegirMotivo, planDeEnvio,
} from '../services/simulador/generador.js';

const generar = (semilla, n = 200) => {
  const rng = crearRng(semilla);
  const salida = [];
  for (let i = 0; i < n; i += 1) {
    const plan = planDeEnvio({ shipmentId: `S-${i}`, creadoEn: INICIO_SIMULADO + i * 60000, rng });
    salida.push(...conAnomalias(plan, rng));
  }
  return salida;
};

test('La misma semilla repite exactamente la misma corrida', () => {
  assert.deepEqual(generar(42), generar(42));
  assert.notDeepEqual(generar(42), generar(43));
});

test('Todos los eventos del plan cumplen su esquema', () => {
  for (const paso of generar(7)) {
    if (!paso.crudo) assert.deepEqual(validarEvento(paso.topic, paso.evento), [], JSON.stringify(paso.evento));
  }
});

test('Un envio recorre el ciclo en orden y sus secuencias crecen', () => {
  const plan = planDeEnvio({ shipmentId: 'S', creadoEn: INICIO_SIMULADO, rng: crearRng(1), guion: { fallos: [], zona: ZONAS[0], demoraHubHoras: 0 } });
  const estados = plan.filter((p) => p.topic === Topics.ESTADOS).map((p) => p.evento);
  assert.deepEqual(estados.map((e) => e.tipo), ['CREADO', 'INGRESADO_HUB', 'CLASIFICADO', 'EN_REPARTO', 'ENTREGADO']);
  assert.deepEqual(estados.map((e) => e.secuencia), [1, 2, 3, 4, 5]);
});

test('El guion de tercer fallo agota los intentos', () => {
  const plan = planDeEnvio({ shipmentId: 'S', creadoEn: INICIO_SIMULADO, rng: crearRng(1), guion: { fallos: ['AUSENTE', 'AUSENTE', 'AUSENTE'], zona: ZONAS[0], horasPorPaso: 0.2, demoraHubHoras: 0 } });
  const fallos = plan.filter((p) => p.evento?.tipo === 'ENTREGA_FALLIDA');
  assert.deepEqual(fallos.map((p) => p.evento.intento), [1, 2, 3]);
  assert.ok(!plan.some((p) => p.evento?.tipo === 'ENTREGADO'));
});

test('Una direccion incorrecta no vuelve a salir a reparto', () => {
  const plan = planDeEnvio({ shipmentId: 'S', creadoEn: INICIO_SIMULADO, rng: crearRng(1), guion: { fallos: ['DIRECCION_INCORRECTA'], zona: ZONAS[0], horasPorPaso: 0.2, demoraHubHoras: 0 } });
  assert.equal(plan.filter((p) => p.evento?.tipo === 'EN_REPARTO').length, 1);
});

test('La distribucion de motivos respeta 60/20/15/5', () => {
  const rng = crearRng(9);
  const cuenta = {};
  const total = 100000;
  for (let i = 0; i < total; i += 1) {
    const motivo = elegirMotivo(rng());
    cuenta[motivo] = (cuenta[motivo] ?? 0) + 1;
  }
  assert.ok(Math.abs(cuenta.AUSENTE / total - 0.6) < 0.01);
  assert.ok(Math.abs(cuenta.DIRECCION_INCORRECTA / total - 0.2) < 0.01);
  assert.ok(Math.abs(cuenta.RECHAZADO / total - 0.15) < 0.01);
  assert.ok(Math.abs(cuenta.ZONA_INACCESIBLE / total - 0.05) < 0.01);
});

test('Las tasas de fallo por zona van de 5% a 30%', () => {
  const tasas = ZONAS.map((z) => z.tasaFallo);
  assert.equal(Math.min(...tasas), 0.05);
  assert.equal(Math.max(...tasas), 0.3);
});

test('El flujo incluye duplicados, eventos fuera de orden y malformados', () => {
  const pasos = generar(11, 1000);
  assert.ok(pasos.some((p) => p.crudo), 'malformados');
  const ids = pasos.filter((p) => p.evento).map((p) => p.evento.eventId);
  assert.ok(new Set(ids).size < ids.length, 'duplicados');
  const ultima = new Map();
  let fueraDeOrden = false;
  for (const p of pasos) {
    if (p.topic !== Topics.ESTADOS || !p.evento) continue;
    if (p.evento.secuencia < (ultima.get(p.evento.shipmentId) ?? 0)) fueraDeOrden = true;
    ultima.set(p.evento.shipmentId, Math.max(p.evento.secuencia, ultima.get(p.evento.shipmentId) ?? 0));
  }
  assert.ok(fueraDeOrden, 'fuera de orden');
});
