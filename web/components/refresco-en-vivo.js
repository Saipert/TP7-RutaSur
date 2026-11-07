'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

const INTERVALO_MIN_MS = 700;

/** Escucha los cambios por SSE y vuelve a pedir los datos renderizados en el servidor. */
export function RefrescoEnVivo({ shipmentId }) {
  const router = useRouter();
  const [conectado, setConectado] = useState(false);
  const pendiente = useRef(null);

  useEffect(() => {
    const url = shipmentId ? `/api/stream?shipmentId=${encodeURIComponent(shipmentId)}` : '/api/stream';
    const fuente = new EventSource(url);
    fuente.onopen = () => setConectado(true);
    fuente.onerror = () => setConectado(false);
    fuente.onmessage = () => {
      if (pendiente.current) return;
      pendiente.current = setTimeout(() => {
        pendiente.current = null;
        router.refresh();
      }, INTERVALO_MIN_MS);
    };
    return () => {
      fuente.close();
      clearTimeout(pendiente.current);
    };
  }, [router, shipmentId]);

  return <span className={conectado ? 'vivo on' : 'vivo'}>{conectado ? 'En vivo' : 'Conectando'}</span>;
}
