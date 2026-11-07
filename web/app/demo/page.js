import { PanelDemo } from '@/components/panel-demo';

export const metadata = { title: 'Panel de demo · RutaSur' };

export default function Demo() {
  return (
    <main>
      <div>
        <h1>Panel de demo</h1>
        <p className="tenue">Dispara los escenarios del simulador. Los eventos siguen el mismo camino que el flujo continuo.</p>
      </div>
      <PanelDemo />
    </main>
  );
}
