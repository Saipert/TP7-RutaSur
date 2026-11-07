import { createServer } from 'node:http';
import { ACELERACION, Topics } from '../../shared/config.js';
import { arrancar, cerrarAlSalir } from '../../shared/consumidor.js';
import { crearKafka, crearProductor } from '../../shared/kafka.js';
import { INICIO_SIMULADO, ZONAS, conAnomalias, crearRng, planDeEnvio } from './generador.js';

const SEMILLA = Number(process.env.SEMILLA ?? 20260302);
const ENVIOS_POR_MINUTO = Number(process.env.ENVIOS_POR_MINUTO ?? 20);
const FLUJO_CONTINUO = process.env.FLUJO_CONTINUO !== 'false';
const PUERTO = Number(process.env.PORT ?? 4000);
const RAFAGA = 500;

// Cada flujo tiene su propio generador: los escenarios no alteran la corrida con semilla fija.
const rngFlujo = crearRng(SEMILLA);
const rngEscenarios = crearRng(SEMILLA ^ 0x5bd1e995);

const inicioReal = Date.now();
const relojSimulado = () => INICIO_SIMULADO + (Date.now() - inicioReal) * ACELERACION;

const pendientes = [];
let contadorFlujo = 0;
let contadorEscenarios = 0;

function agendar(pasos) {
  pendientes.push(...pasos);
  pendientes.sort((a, b) => a.en - b.en);
}

async function publicarVencidos(productor) {
  const ahora = relojSimulado();
  while (pendientes.length > 0 && pendientes[0].en <= ahora) {
    const paso = pendientes.shift();
    if (paso.crudo) await productor.publicarCrudo(paso.topic, paso.clave, paso.crudo);
    else await productor.publicar(paso.topic, paso.evento);
  }
}

function crearEnvioDelFlujo() {
  contadorFlujo += 1;
  const shipmentId = `RS-${String(contadorFlujo).padStart(6, '0')}`;
  agendar(conAnomalias(planDeEnvio({ shipmentId, creadoEn: relojSimulado(), rng: rngFlujo }), rngFlujo));
}

const ESCENARIOS = {
  feliz: { guion: { fallos: [], horasPorPaso: 0.2, demoraHubHoras: 0 } },
  ausente: { guion: { fallos: ['AUSENTE'], horasPorPaso: 0.2, demoraHubHoras: 0 } },
  'direccion-incorrecta': { guion: { fallos: ['DIRECCION_INCORRECTA'], horasPorPaso: 0.2, demoraHubHoras: 0 } },
  rechazado: { guion: { fallos: ['RECHAZADO'], horasPorPaso: 0.2, demoraHubHoras: 0 } },
  'zona-inaccesible': { guion: { fallos: ['ZONA_INACCESIBLE'], horasPorPaso: 0.2, demoraHubHoras: 0 } },
  'tercer-fallo': { guion: { fallos: ['AUSENTE', 'AUSENTE', 'AUSENTE'], horasPorPaso: 0.2, demoraHubHoras: 0 } },
  // Queda en el hub con la promesa cerca: dispara "Sin salida" (Alta) y despues se entrega.
  demorado: { guion: { fallos: [], promesaHoras: 4.5, demoraHubHoras: 0, horasPorPaso: 1.2 } },
  // Regla "Sin ingreso": nunca llega al hub y faltan menos de 10 horas.
  'sin-ingreso': { guion: { promesaHoras: 9.5, detenerAntesDeHub: true } },
  // Regla "Vencido": no se entrega antes del vencimiento.
  vencido: { guion: { promesaHoras: 0.5, detenerAntesDeHub: true } },
  // Regla "Fallo en el dia limite": falla con la promesa venciendo el mismo dia.
  'fallo-dia-limite': { guion: { fallos: ['DIRECCION_INCORRECTA'], promesaHoras: 2, horasPorPaso: 0.1, demoraHubHoras: 0 } },
};

function dispararEscenario(nombre) {
  const escenario = ESCENARIOS[nombre];
  if (!escenario) return null;
  contadorEscenarios += 1;
  const shipmentId = `ESC-${nombre}-${contadorEscenarios}`;
  const zona = ZONAS[contadorEscenarios % ZONAS.length];
  agendar(planDeEnvio({
    shipmentId,
    creadoEn: relojSimulado(),
    rng: rngEscenarios,
    guion: { zona, ...escenario.guion },
  }));
  return { escenario: nombre, shipmentId };
}

function dispararRafaga() {
  const ahora = relojSimulado();
  contadorEscenarios += 1;
  const prefijo = `RAF-${contadorEscenarios}`;
  for (let i = 1; i <= RAFAGA; i += 1) {
    const shipmentId = `${prefijo}-${String(i).padStart(3, '0')}`;
    agendar(planDeEnvio({ shipmentId, creadoEn: ahora, rng: rngEscenarios }));
  }
  return { escenario: 'rafaga', envios: RAFAGA, prefijo };
}

const responder = (res, codigo, cuerpo) => {
  res.writeHead(codigo, { 'content-type': 'application/json' });
  res.end(JSON.stringify(cuerpo));
};

function crearServidor(productor) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');

      if (req.method === 'GET' && url.pathname === '/estado') {
        return responder(res, 200, {
          relojSimulado: new Date(relojSimulado()).toISOString(),
          pendientes: pendientes.length,
          enviosDelFlujo: contadorFlujo,
          semilla: SEMILLA,
        });
      }

      const [, base, nombre] = url.pathname.split('/');
      if (req.method !== 'POST' || base !== 'escenarios' || !nombre) {
        return responder(res, 404, { error: 'Ruta inexistente' });
      }

      if (nombre === 'invalido') {
        const shipmentId = `INV-${Date.now()}`;
        await productor.publicarCrudo(
          Topics.ESTADOS,
          shipmentId,
          JSON.stringify({ shipmentId, tipo: 'ESTADO_INEXISTENTE' }),
        );
        return responder(res, 202, { escenario: nombre, shipmentId });
      }

      const resultado = nombre === 'rafaga' ? dispararRafaga() : dispararEscenario(nombre);
      if (!resultado) return responder(res, 404, { error: `Escenario desconocido: ${nombre}` });
      return responder(res, 202, resultado);
    } catch (error) {
      console.error(error);
      return responder(res, 500, { error: error.message });
    }
  });
}

async function principal() {
  const productor = await crearProductor(crearKafka('simulador'));

  let publicando = false;
  const bucle = setInterval(async () => {
    if (publicando) return;
    publicando = true;
    try {
      await publicarVencidos(productor);
    } catch (error) {
      console.error('No se pudo publicar', error);
    } finally {
      publicando = false;
    }
  }, 100);

  const flujo = FLUJO_CONTINUO ? setInterval(crearEnvioDelFlujo, 60000 / ENVIOS_POR_MINUTO) : null;
  if (FLUJO_CONTINUO) crearEnvioDelFlujo();

  const servidor = crearServidor(productor).listen(PUERTO, () => {
    console.log(`Simulador en el puerto ${PUERTO}. Semilla ${SEMILLA}, flujo continuo: ${FLUJO_CONTINUO}`);
  });

  cerrarAlSalir(async () => {
    clearInterval(bucle);
    clearInterval(flujo);
    servidor.close();
    await productor.cerrar();
  });
}

arrancar(principal);
