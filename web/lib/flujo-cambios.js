const HEARTBEAT_MS = 15000;

/** Convierte los change streams de MongoDB en Server-Sent Events: flujo de un solo sentido. */
export function respuestaSse(request, abrirStreams) {
  const encoder = new TextEncoder();
  let limpiar = () => {};

  const cuerpo = new ReadableStream({
    async start(controller) {
      const enviar = (texto) => {
        try {
          controller.enqueue(encoder.encode(texto));
        } catch {
          limpiar();
        }
      };
      enviar('retry: 2000\n\n');

      const streams = await abrirStreams();
      const latido = setInterval(() => enviar(': latido\n\n'), HEARTBEAT_MS);

      limpiar = () => {
        clearInterval(latido);
        for (const stream of streams) stream.close().catch(() => {});
      };

      for (const stream of streams) {
        stream.on('change', () => enviar('data: cambio\n\n'));
        stream.on('error', () => {
          limpiar();
          try { controller.close(); } catch {}
        });
      }
      request.signal.addEventListener('abort', () => {
        limpiar();
        try { controller.close(); } catch {}
      });
    },
    cancel() {
      limpiar();
    },
  });

  return new Response(cuerpo, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
