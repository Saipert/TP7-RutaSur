import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deltaDeMetricas } from '../services/analitica/metricas.js';
import { medirTiempoEnHub } from '../services/analitica-hub/tiempos.js';
import { aplicarEstado } from '../services/proyector/proyeccion.js';

const ev = (tipo, secuencia, extra = {}) => ({
  eventId: `e${secuencia}`, shipmentId: 'S', tipo, secuencia, intento: 1, hubId: 'H', zonaId: 'Z',
  ocurridoEn: '2026-03-02T10:00:00.000Z', repartidorId: null, ...extra,
});

test('Aplica un evento nuevo al estado', () => {
  const c = aplicarEstado(null, ev('CREADO', 1));
  assert.equal(c.set.estado, 'CREADO');
  assert.equal(c.set.ultimaSecuencia, 1);
});

test('Un evento fuera de orden no hace retroceder el estado', () => {
  assert.equal(aplicarEstado({ ultimaSecuencia: 3 }, ev('INGRESADO_HUB', 2)), null);
});

test('Una secuencia repetida se descarta', () => {
  assert.equal(aplicarEstado({ ultimaSecuencia: 3 }, ev('CLASIFICADO', 3)), null);
});

test('El fallo guarda el motivo', () => {
  assert.equal(aplicarEstado({ ultimaSecuencia: 4 }, ev('ENTREGA_FALLIDA', 5, { motivo: 'AUSENTE' })).set.ultimoMotivo, 'AUSENTE');
});

test('Entrega en primer intento y en plazo', () => {
  const { inc, clave } = deltaDeMetricas(ev('ENTREGADO', 5, { promesaVenceEn: '2026-03-03T00:00:00.000Z' }));
  assert.deepEqual(inc, { primerosIntentos: 1, entregas: 1, entregasPrimerIntento: 1, entregasEnPlazo: 1 });
  assert.deepEqual(clave, { fecha: '2026-03-02', zonaId: 'Z', franja: 'MANANA' });
});

test('Entrega tardia en el segundo intento', () => {
  const { inc } = deltaDeMetricas(ev('ENTREGADO', 7, { intento: 2, promesaVenceEn: '2026-03-01T00:00:00.000Z' }));
  assert.deepEqual(inc, { entregas: 1 });
});

test('Un fallo suma por motivo', () => {
  const { inc } = deltaDeMetricas(ev('ENTREGA_FALLIDA', 5, { motivo: 'RECHAZADO' }));
  assert.deepEqual(inc, { primerosIntentos: 1, fallos: 1, 'motivos.RECHAZADO': 1 });
});

test('Los demas estados no aportan metricas', () => {
  assert.equal(deltaDeMetricas(ev('EN_REPARTO', 4)), null);
});

test('Tiempo en hub en cualquier orden', () => {
  const ingreso = ev('INGRESADO_HUB', 2, { ocurridoEn: '2026-03-02T10:00:00.000Z' });
  const salida = ev('EN_REPARTO', 4, { ocurridoEn: '2026-03-02T12:30:00.000Z' });
  assert.equal(medirTiempoEnHub(medirTiempoEnHub(null, ingreso).registro, salida).minutos, 150);
  assert.equal(medirTiempoEnHub(medirTiempoEnHub(null, salida).registro, ingreso).minutos, 150);
});
