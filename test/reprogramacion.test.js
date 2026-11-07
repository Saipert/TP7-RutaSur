import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decidirReprogramacion, franjaDe, siguienteDiaHabil } from '../shared/reglas-reprogramacion.js';

const MANANA_LUNES = '2026-03-02T10:00:00.000Z';
const TARDE_VIERNES = '2026-03-06T16:00:00.000Z';

test('AUSENTE: nuevo intento al dia habil siguiente, en la franja opuesta', () => {
  const decision = decidirReprogramacion({ motivo: 'AUSENTE', intento: 1, ocurridoEn: MANANA_LUNES });
  assert.equal(decision.tipo, 'REPROGRAMADO');
  assert.equal(decision.franja, 'TARDE');
  assert.equal(decision.proximoIntento, 2);
  assert.equal(decision.proximoIntentoEn.slice(0, 10), '2026-03-03');
  assert.equal(franjaDe(decision.proximoIntentoEn), 'TARDE');
});

test('AUSENTE un viernes pasa al lunes y cambia a la manana', () => {
  const decision = decidirReprogramacion({ motivo: 'AUSENTE', intento: 2, ocurridoEn: TARDE_VIERNES });
  assert.equal(decision.proximoIntentoEn.slice(0, 10), '2026-03-09');
  assert.equal(decision.franja, 'MANANA');
});

test('DIRECCION_INCORRECTA queda retenido', () => {
  assert.equal(decidirReprogramacion({ motivo: 'DIRECCION_INCORRECTA', intento: 1, ocurridoEn: MANANA_LUNES }).tipo, 'RETENIDO');
});

test('ZONA_INACCESIBLE queda retenido', () => {
  assert.equal(decidirReprogramacion({ motivo: 'ZONA_INACCESIBLE', intento: 1, ocurridoEn: MANANA_LUNES }).tipo, 'RETENIDO');
});

test('RECHAZADO va a devolucion', () => {
  assert.equal(decidirReprogramacion({ motivo: 'RECHAZADO', intento: 1, ocurridoEn: MANANA_LUNES }).tipo, 'DEVOLUCION');
});

test('El tercer fallo va a devolucion cualquiera sea el motivo', () => {
  for (const motivo of ['AUSENTE', 'DIRECCION_INCORRECTA', 'RECHAZADO', 'ZONA_INACCESIBLE']) {
    assert.equal(decidirReprogramacion({ motivo, intento: 3, ocurridoEn: MANANA_LUNES }).tipo, 'DEVOLUCION');
  }
});

test('siguienteDiaHabil salta el fin de semana', () => {
  assert.equal(siguienteDiaHabil('2026-03-07T10:00:00Z').toISOString().slice(0, 10), '2026-03-09');
});
