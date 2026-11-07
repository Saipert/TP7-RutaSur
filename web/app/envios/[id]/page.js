import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RefrescoEnVivo } from '@/components/refresco-en-vivo';
import { detalleEnvio } from '@/lib/consultas';
import { NOMBRE_ESTADO, NOMBRE_REGLA, NOMBRE_RESOLUCION, fechaHora } from '@/lib/formato';

export const dynamic = 'force-dynamic';

const claseEvento = (tipo) => (tipo === 'ENTREGA_FALLIDA' ? 'fallo' : tipo === 'ENTREGADO' ? 'ok' : '');

export default async function DetalleEnvio({ params }) {
  const { id } = await params;
  const shipmentId = decodeURIComponent(id);
  const { envio, alertas, notificaciones } = await detalleEnvio(shipmentId);
  if (!envio) notFound();

  return (
    <main>
      <div className="encabezado">
        <h1>Envío {shipmentId}</h1>
        <RefrescoEnVivo shipmentId={shipmentId} />
      </div>

      <section className="panel">
        <dl className="datos">
          <div><dt>Estado</dt><dd>{NOMBRE_ESTADO[envio.estado] ?? 'Sin estado'}</dd></div>
          <div><dt>Intentos</dt><dd>{envio.intentos ?? 0}</dd></div>
          <div><dt>Promesa</dt><dd>{fechaHora(envio.promesa?.venceEn)}</dd></div>
          <div><dt>Hub / zona</dt><dd>{envio.hubId} / {envio.zonaId}</dd></div>
          <div><dt>Repartidor</dt><dd>{envio.repartidorId ?? '—'}</dd></div>
          <div>
            <dt>Resolución</dt>
            <dd>{envio.resolucion ? NOMBRE_RESOLUCION[envio.resolucion.tipo] : '—'}</dd>
          </div>
          {envio.resolucion?.proximoIntentoEn && (
            <div><dt>Próximo intento</dt><dd>{fechaHora(envio.resolucion.proximoIntentoEn)} · {envio.resolucion.franja === 'MANANA' ? 'mañana' : 'tarde'}</dd></div>
          )}
        </dl>
        <p><Link href={`/tracking/${shipmentId}`}>Ver el tracking público</Link></p>
      </section>

      <div className="dos">
        <section className="panel">
          <h2>Línea de tiempo</h2>
          <ol className="linea-tiempo">
            {(envio.historial ?? []).map((h) => (
              <li key={h.eventId} className={claseEvento(h.tipo)}>
                {NOMBRE_ESTADO[h.tipo]}{h.motivo ? ` · ${h.motivo}` : ''}
                <small>{fechaHora(h.ocurridoEn)} · intento {h.intento} · secuencia {h.secuencia}</small>
              </li>
            ))}
          </ol>
        </section>

        <div style={{ display: 'grid', gap: '1.25rem', alignContent: 'start' }}>
          <section className="panel">
            <h2>Alertas</h2>
            {alertas.length === 0 ? <p className="tenue">Sin alertas.</p> : (
              <ul className="lista">
                {alertas.map((a) => (
                  <li key={a._id}>
                    <span className={`prioridad ${a.prioridad}`}>{a.prioridad}</span>{' '}
                    {NOMBRE_REGLA[a.regla] ?? a.regla} · {a.estado === 'ABIERTA' ? 'abierta' : 'cerrada'}
                    <div className="tenue">{a.causa}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="panel">
            <h2>Notificaciones</h2>
            {notificaciones.length === 0 ? <p className="tenue">Sin notificaciones.</p> : (
              <ul className="lista">
                {notificaciones.map((n) => <li key={n._id}>{n.mensaje}</li>)}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
