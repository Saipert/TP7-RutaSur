import Link from 'next/link';

export default function NoEncontrado() {
  return (
    <main>
      <section className="panel">
        <h1>No encontramos ese envío</h1>
        <p>Revisá el código o volvé a la <Link href="/">torre de control</Link>.</p>
      </section>
    </main>
  );
}
