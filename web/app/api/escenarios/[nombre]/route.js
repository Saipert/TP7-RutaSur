export const dynamic = 'force-dynamic';

const ESCENARIOS = new Set([
  'feliz', 'ausente', 'direccion-incorrecta', 'rechazado', 'zona-inaccesible', 'demorado',
  'sin-ingreso', 'vencido', 'fallo-dia-limite', 'tercer-fallo', 'rafaga', 'invalido',
]);

/** Pasa el pedido al simulador: el navegador no habla con el directamente. */
export async function POST(_request, { params }) {
  const { nombre } = await params;
  if (!ESCENARIOS.has(nombre)) return Response.json({ error: 'Escenario desconocido' }, { status: 404 });

  try {
    const respuesta = await fetch(`${process.env.SIMULADOR_URL}/escenarios/${nombre}`, { method: 'POST' });
    return Response.json(await respuesta.json(), { status: respuesta.status });
  } catch {
    return Response.json({ error: 'No se pudo contactar al simulador' }, { status: 502 });
  }
}
