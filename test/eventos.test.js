import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Topics } from '../shared/config.js';
import { procesarMensaje } from '../shared/consumidor.js';
import { idDerivado, validarEvento } from '../shared/eventos.js';

const estado = (extra = {}) => ({
  eventId: 'e1',
  shipmentId: 'S1',
  tipo: 'CREADO',
  ocurridoEn: '2026-03-02T10:00:00.000Z',
  secuencia: 1,
  hubId: 'H',
  zonaId: 'Z',
  repartidorId: null,
  version: 1,
  intento: 1,
  ...extra,
});

test('Acepta un evento valido', () => {
  assert.deepEqual(validarEvento(Topics.ESTADOS, estado()), []);
});

for (const [nombre, evento] of Object.entries({
  'estado inexistente': estado({ tipo: 'OTRO' }),
  'sin eventId': estado({ eventId: undefined }),
  'secuencia negativa': estado({ secuencia: -1 }),
  'version futura': estado({ version: 2 }),
  'fallo sin motivo': estado({ tipo: 'ENTREGA_FALLIDA' }),
  'motivo inexistente': estado({ tipo: 'ENTREGA_FALLIDA', motivo: 'X' }),
  'no es objeto': 'hola',
})) {
  test(`Rechaza: ${nombre}`, () => {
    assert.ok(validarEvento(Topics.ESTADOS, evento).length > 0);
  });
}

test('idDerivado es determinista', () => {
  assert.equal(idDerivado('a', 'b'), idDerivado('a', 'b'));
  assert.notEqual(idDerivado('a', 'b'), idDerivado('a', 'c'));
});

const base = { topic: Topics.ESTADOS, log: () => {}, esperas: [0, 0, 0], dormir: async () => {} };

test('Un mensaje malformado va a la DLQ con su motivo y no llega al manejador', async () => {
  const motivos = [];
  let llamado = false;
  const r = await procesarMensaje({ ...base, crudo: '{nope', manejar: async () => { llamado = true; }, aDlq: async (m) => motivos.push(m) });
  assert.equal(r, 'dlq');
  assert.equal(llamado, false);
  assert.match(motivos[0], /JSON/);
});

test('Un evento fuera de esquema va a la DLQ con su motivo', async () => {
  const motivos = [];
  const r = await procesarMensaje({ ...base, crudo: JSON.stringify({ tipo: 'X' }), manejar: async () => {}, aDlq: async (m) => motivos.push(m) });
  assert.equal(r, 'dlq');
  assert.match(motivos[0], /esquema/);
});

test('Un error tecnico se reintenta 3 veces y luego va a la DLQ', async () => {
  let llamadas = 0;
  const motivos = [];
  const r = await procesarMensaje({
    ...base,
    crudo: JSON.stringify(estado()),
    manejar: async () => { llamadas += 1; throw new Error('base caida'); },
    aDlq: async (m) => motivos.push(m),
  });
  assert.equal(r, 'dlq');
  assert.equal(llamadas, 4);
  assert.match(motivos[0], /base caida/);
});

test('Un error pasajero se recupera sin ir a la DLQ', async () => {
  let llamadas = 0;
  const r = await procesarMensaje({
    ...base,
    crudo: JSON.stringify(estado()),
    manejar: async () => { llamadas += 1; if (llamadas === 1) throw new Error('x'); },
    aDlq: async () => assert.fail('no debe ir a la DLQ'),
  });
  assert.equal(r, 'ok');
});
