import Link from 'next/link';
import './globals.css';

export const metadata = { title: 'RutaSur', description: 'Seguimiento de envíos en tiempo real' };

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <header className="barra">
          <nav>
            <strong>RutaSur</strong>
            <Link href="/">Torre de control</Link>
            <Link href="/analitica">Analítica</Link>
            <Link href="/demo">Panel de demo</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
