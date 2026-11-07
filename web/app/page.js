import Link from 'next/link';
import { RefrescoEnVivo } from '@/components/refresco-en-vivo';
import { alertasAbiertas, contadoresPorEstado, ultimosEnvios } from '@/lib/consultas';
import { ESTADOS, NOMBRE_ESTADO, NOMBRE_REGLA, fechaHora } from '@/lib/formato';

export const dynamic = 'force-dynamic';

export default async function TorreDeControl() {
  const [contadores, alertas, envios] = await Promise.all([
    contadoresPorEstado(),
    alertasAbiertas(),
    ultimosEnvios(),
  ]);

  return (
    <main>
      <div className="encabezado">
        <h1>Torre de control</h1>
        <RefrescoEnVivo />
      </div>

      <section className="contadores" aria-label="Envíos por estado">
        {ESTADOS.map((estado) => (
          <div className="contador" key={estado}>
            <b>{contadores[estado] ?? 0}</b>
            <span>{NOMBRE_ESTADO[estado]}</span>
          </div>
        ))}
      </section>

      <div className="dos">
        <section className="panel">
          <h2>Alertas abiertas</h2>
          {alertas.length === 0 ? (
            <p className="tenue">No hay alertas abiertas.</p>
          ) : (
            <table>
              <thead><tr><th>Prioridad</th><th>Regla</th><th>Envío</th><th>Zona</th><th>Desde</th></tr></thead>
              <tbody>
                {alertas.map((a) => (
                  <tr key={a._id}>
                    <td><span className={`prioridad ${a.prioridad}`}>{a.prioridad}</span></td>
                    <td>{NOMBRE_REGLA[a.regla] ?? a.regla}</td>
                    <td><Link href={`/envios/${a.shipmentId}`}>{a.shipmentId}</Link></td>
                    <td>{a.zonaId}</td>
                    <td>{fechaHora(a.abiertaEn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="panel">
          <h2>Últimos eventos</h2>
          {envios.length === 0 ? (
            <p className="tenue">Todavía no llegaron eventos.</p>
          ) : (
            <table>
              <thead><tr><th>Envío</th><th>Estado</th><th>Zona</th><th>Cuándo</th></tr></thead>
              <tbody>
                {envios.map((e) => (
                  <tr key={e.shipmentId}>
                    <td><Link href={`/envios/${e.shipmentId}`}>{e.shipmentId}</Link></td>
                    <td>{NOMBRE_ESTADO[e.estado]}</td>
                    <td>{e.zonaId}</td>
                    <td>{fechaHora(e.actualizadoEn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </main>
  );
}
