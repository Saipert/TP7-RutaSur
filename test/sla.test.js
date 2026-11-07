import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crearReloj, decidirAlertas, evaluarReglas, incorporarEvento } from '../services/monitor-sla/reglas.js';

const H = 3600000;
const VENCE = Date.UTC(2026, 2, 5, 18, 0);
const envio = (estado, extra = {}) => ({
  shipmentId: 'S',
  ultimoEstado: estado,
  venceEn: new Date(VENCE).toISOString(),
  ocurridoEn: '2026-03-02T10:00:00.000Z',
  emitidas: [],
  ...extra,
});

test('Sin ingreso: menos de 10 h y no ingreso al hub', () => {
  assert.deepEqual(evaluarReglas(envio('CREADO'), VENCE - 11 * H), []);
  assert.deepEqual(evaluarReglas(envio('CREADO'), VENCE - 9 * H), ['SIN_INGRESO']);
  assert.deepEqual(evaluarReglas(envio('INGRESADO_HUB'), VENCE - 9 * H), []);
});

test('Sin salida: menos de 4 h y no esta en reparto', () => {
  assert.deepEqual(evaluarReglas(envio('CLASIFICADO'), VENCE - 3 * H), ['SIN_SALIDA']);
  assert.deepEqual(evaluarReglas(envio('INGRESADO_HUB'), VENCE - 3 * H), ['SIN_SALIDA']);
  assert.deepEqual(evaluarReglas(envio('EN_REPARTO'), VENCE - 3 * H), []);
});

test('Un envio sin ingreso a menos de 4 h cumple las dos reglas', () => {
  assert.deepEqual(evaluarReglas(envio('CREADO'), VENCE - 3 * H), ['SIN_INGRESO', 'SIN_SALIDA']);
});

test('Fallo en el dia limite: entrega fallida y la promesa vence hoy', () => {
  const hoy = envio('ENTREGA_FALLIDA', { ocurridoEn: '2026-03-05T10:00:00.000Z' });
  assert.deepEqual(evaluarReglas(hoy, VENCE - 8 * H), ['FALLO_DIA_LIMITE']);
  const antes = envio('ENTREGA_FALLIDA', { ocurridoEn: '2026-03-04T10:00:00.000Z' });
  assert.deepEqual(evaluarReglas(antes, VENCE - 30 * H), []);
});

test('Vencido: paso el vencimiento sin entrega', () => {
  assert.deepEqual(evaluarReglas(envio('EN_REPARTO'), VENCE + 1), ['VENCIDO']);
  assert.deepEqual(evaluarReglas(envio('ENTREGADO'), VENCE + 1), []);
});

test('Sin promesa conocida no se evalua', () => {
  assert.deepEqual(evaluarReglas({ ultimoEstado: 'CREADO' }, VENCE), []);
});

test('Una regla no vuelve a alertar sobre el mismo envio', () => {
  const yaEmitida = envio('CREADO', { emitidas: ['SIN_INGRESO'] });
  assert.deepEqual(decidirAlertas(yaEmitida, VENCE - 9 * H).abrir, []);
});

test('Al entregar se cierran las alertas emitidas, una sola vez', () => {
  const entregado = envio('ENTREGADO', { emitidas: ['SIN_INGRESO', 'SIN_SALIDA'] });
  assert.deepEqual(decidirAlertas(entregado, VENCE).cerrar, ['SIN_INGRESO', 'SIN_SALIDA']);
  const cerrado = { ...entregado, cerradas: ['SIN_INGRESO', 'SIN_SALIDA'] };
  assert.deepEqual(decidirAlertas(cerrado, VENCE).cerrar, []);
});

test('El estado interno no retrocede con un evento fuera de orden', () => {
  let e = incorporarEvento(undefined, { shipmentId: 'S', tipo: 'CLASIFICADO', secuencia: 3, ocurridoEn: 'x', hubId: 'H', zonaId: 'Z' });
  e = incorporarEvento(e, { shipmentId: 'S', tipo: 'INGRESADO_HUB', secuencia: 2, ocurridoEn: 'w', hubId: 'H', zonaId: 'Z' });
  assert.equal(e.ultimoEstado, 'CLASIFICADO');
});

test('La promesa puede llegar antes o despues del estado', () => {
  const promesa = { shipmentId: 'S', tipo: 'PROMESA', secuencia: 0, venceEn: 'v', hubId: 'H', zonaId: 'Z' };
  const creado = { shipmentId: 'S', tipo: 'CREADO', secuencia: 1, ocurridoEn: 'o', hubId: 'H', zonaId: 'Z' };
  const a = incorporarEvento(incorporarEvento(undefined, promesa), creado);
  const b = incorporarEvento(incorporarEvento(undefined, creado), promesa);
  assert.equal(a.ultimoEstado, b.ultimoEstado);
  assert.equal(a.venceEn, b.venceEn);
});

test('El reloj usa el tiempo de los eventos, no retrocede y extrapola sin eventos', () => {
  let real = 1000;
  const reloj = crearReloj(120, 0, () => real);
  assert.equal(reloj.ahora(), 0);
  reloj.avanzar('2026-03-02T10:00:00.000Z');
  const t0 = Date.parse('2026-03-02T10:00:00.000Z');
  assert.equal(reloj.ahora(), t0);
  reloj.avanzar('2026-03-02T09:00:00.000Z');
  assert.equal(reloj.ahora(), t0);
  real += 30000;
  assert.equal(reloj.ahora(), t0 + H);
});
