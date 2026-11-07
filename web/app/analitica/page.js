import { indicadores, opcionesDeFiltro } from '@/lib/consultas';
import { porcentaje } from '@/lib/formato';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Analítica · RutaSur' };

function Barra({ valor }) {
  return <div className="barra-pct" aria-hidden="true"><i style={{ width: `${(valor ?? 0) * 100}%` }} /></div>;
}

function Selector({ nombre, etiqueta, opciones, valor }) {
  return (
    <label>
      {etiqueta}
      <select name={nombre} defaultValue={valor ?? ''}>
        <option value="">Todos</option>
        {opciones.map((o) => <option key={o}>{o}</option>)}
      </select>
    </label>
  );
}

const MOTIVOS = ['AUSENTE', 'DIRECCION_INCORRECTA', 'RECHAZADO', 'ZONA_INACCESIBLE'];

export default async function Analitica({ searchParams }) {
  const { zonaId, hubId, fecha } = await searchParams;
  const [datos, opciones] = await Promise.all([indicadores({ zonaId, hubId, fecha }), opcionesDeFiltro()]);

  return (
    <main>
      <h1>Analítica</h1>

      <form className="panel filtros">
        <Selector nombre="zonaId" etiqueta="Zona" opciones={opciones.zonas} valor={zonaId} />
        <Selector nombre="hubId" etiqueta="Hub" opciones={opciones.hubs} valor={hubId} />
        <Selector nombre="fecha" etiqueta="Fecha" opciones={opciones.fechas} valor={fecha} />
        <button className="primario" type="submit">Filtrar</button>
      </form>

      <section className="panel">
        <h2>Tasa de entrega en primer intento: ¿dónde y cuándo fallamos más?</h2>
        {datos.primerIntento.length === 0 ? <p className="tenue">Sin datos para este filtro.</p> : (
          <table>
            <thead><tr><th>Zona · franja · día</th><th>Primeros intentos</th><th>Entregas</th><th>Tasa</th><th></th></tr></thead>
            <tbody>
              {datos.primerIntento.map((f) => (
                <tr key={f.clave}><td>{f.clave}</td><td>{f.intentos}</td><td>{f.entregas}</td><td>{porcentaje(f.tasa)}</td><td><Barra valor={f.tasa} /></td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="dos">
        <section className="panel">
          <h2>Motivos de fallo: ¿por qué fallamos?</h2>
          {datos.motivos.length === 0 ? <p className="tenue">Sin datos para este filtro.</p> : (
            <table>
              <thead><tr><th>Zona</th>{MOTIVOS.map((m) => <th key={m}>{m.replace('_', ' ')}</th>)}</tr></thead>
              <tbody>
                {datos.motivos.map((f) => (
                  <tr key={f.clave}><td>{f.clave}</td>{MOTIVOS.map((m) => <td key={m}>{f.motivos[m] ?? 0}</td>)}</tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="panel">
          <h2>Cumplimiento de SLA: ¿qué hub llega tarde?</h2>
          {datos.sla.length === 0 ? <p className="tenue">Sin datos para este filtro.</p> : (
            <table>
              <thead><tr><th>Hub · día</th><th>Entregas</th><th>En plazo</th><th>Cumplimiento</th></tr></thead>
              <tbody>
                {datos.sla.map((f) => (
                  <tr key={f.clave}><td>{f.clave}</td><td>{f.entregas}</td><td>{f.enPlazo}</td><td>{porcentaje(f.tasa)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="panel">
        <h2>Tiempo medio entre el ingreso al hub y la salida a reparto</h2>
        {datos.tiemposHub.length === 0 ? (
          <p className="tenue">Este indicador todavía no está activo. Se completa con datos históricos al levantar el perfil cuarto-indicador.</p>
        ) : (
          <table>
            <thead><tr><th>Hub</th><th>Envíos</th><th>Tiempo medio simulado</th></tr></thead>
            <tbody>
              {datos.tiemposHub.map((f) => (
                <tr key={f.hubId}><td>{f.hubId}</td><td>{f.envios}</td><td>{(f.minutos / 60).toFixed(1).replace('.', ',')} h</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
