import { notFound } from 'next/navigation';
import { RefrescoEnVivo } from '@/components/refresco-en-vivo';
import { trackingPublico } from '@/lib/consultas';
import { NOMBRE_ESTADO, NOMBRE_RESOLUCION, fechaHora } from '@/lib/formato';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Seguí tu envío · RutaSur' };

const PASOS = ['CREADO', 'INGRESADO_HUB', 'CLASIFICADO', 'EN_REPARTO', 'ENTREGADO'];

export default async function Tracking({ params }) {
  const { id } = await params;
  const shipmentId = decodeURIComponent(id);
  const envio = await trackingPublico(shipmentId);
  if (!envio) notFound();

  const alcanzado = envio.estado === 'ENTREGA_FALLIDA' ? PASOS.indexOf('EN_REPARTO') : PASOS.indexOf(envio.estado);

  return (
    <main>
      <section className="panel tracking">
        <div className="encabezado">
          <span className="tenue">Envío {shipmentId}</span>
          <RefrescoEnVivo shipmentId={shipmentId} />
        </div>
        <p className="grande">{NOMBRE_ESTADO[envio.estado]}</p>
        {envio.resolucion && envio.estado === 'ENTREGA_FALLIDA' && <p>{NOMBRE_RESOLUCION[envio.resolucion.tipo]}</p>}
        {envio.estado !== 'ENTREGADO' && envio.promesa?.venceEn && (
          <p>Fecha estimada: <strong>{fechaHora(envio.promesa.venceEn)}</strong></p>
        )}
        <ol className="pasos">
          {PASOS.map((paso, i) => (
            <li key={paso} className={i <= alcanzado ? 'hecho' : ''}>{NOMBRE_ESTADO[paso]}</li>
          ))}
        </ol>
      </section>
    </main>
  );
}
