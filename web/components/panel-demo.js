'use client';

import Link from 'next/link';
import { useState } from 'react';

const BOTONES = [
  { nombre: 'feliz', titulo: 'Envío feliz', texto: 'Recorre todos los estados sin incidentes.' },
  { nombre: 'ausente', titulo: 'Ausente', texto: 'Falla y se reprograma: tres reacciones al mismo evento.' },
  { nombre: 'demorado', titulo: 'Demorado', texto: 'Queda en el hub hasta generar una alerta alta.' },
  { nombre: 'tercer-fallo', titulo: 'Tercer fallo', texto: 'Agota sus intentos y pasa a devolución.' },
  { nombre: 'rafaga', titulo: 'Ráfaga', texto: '500 envíos en pocos segundos.' },
  { nombre: 'invalido', titulo: 'Evento inválido', texto: 'Inyecta un evento malformado: va a la DLQ.' },
  { nombre: 'direccion-incorrecta', titulo: 'Dirección incorrecta', texto: 'Queda retenido hasta una corrección.' },
  { nombre: 'rechazado', titulo: 'Rechazado', texto: 'Se marca para devolución.' },
  { nombre: 'sin-ingreso', titulo: 'Sin ingreso', texto: 'Alerta media: no llega al hub.' },
  { nombre: 'fallo-dia-limite', titulo: 'Fallo en el día límite', texto: 'Alerta alta: falla el día del vencimiento.' },
  { nombre: 'vencido', titulo: 'Vencido', texto: 'Alerta crítica: pasa el vencimiento.' },
];

export function PanelDemo() {
  const [resultados, setResultados] = useState([]);

  const disparar = async (nombre) => {
    let resultado;
    try {
      const respuesta = await fetch(`/api/escenarios/${nombre}`, { method: 'POST' });
      resultado = await respuesta.json();
    } catch {
      resultado = { error: 'No se pudo contactar al simulador' };
    }
    setResultados((lista) => [{ id: Date.now(), nombre, ...resultado }, ...lista].slice(0, 8));
  };

  return (
    <>
      <div className="grilla-escenarios">
        {BOTONES.map(({ nombre, titulo, texto }) => (
          <button key={nombre} type="button" className="escenario" onClick={() => disparar(nombre)}>
            <strong>{titulo}</strong>
            <span>{texto}</span>
          </button>
        ))}
      </div>
      <section aria-live="polite">
        <h2>Últimos disparados</h2>
        {resultados.length === 0 && <p className="tenue">Todavía no disparaste ningún escenario.</p>}
        <ul className="lista">
          {resultados.map((r) => (
            <li key={r.id}>
              {r.error ? r.error : r.nombre === 'rafaga' ? `Ráfaga de ${r.envios} envíos (${r.prefijo})` : r.nombre === 'invalido' ? `Evento inválido publicado (${r.shipmentId})` : (
                <>
                  {r.nombre}: <Link href={`/envios/${r.shipmentId}`}>detalle</Link> · <Link href={`/tracking/${r.shipmentId}`}>tracking</Link> · {r.shipmentId}
                </>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
