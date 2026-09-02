import Link from 'next/link'
import { SITE_URL } from '../../lib/siteUrl'

export const metadata = {
  title: 'Qué medidas poner en un anuncio de Vinted · Plendu',
  description: 'Por qué la talla de la etiqueta no basta y cómo medir una prenda en plano en menos de un minuto, sin cinta métrica especial.',
  alternates: { canonical: `${SITE_URL}/guias/que-medidas-poner-en-vinted` },
  robots: { index: true, follow: true },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Qué medidas poner en un anuncio de Vinted',
  description: 'Por qué la talla de la etiqueta no basta y cómo medir una prenda en plano en menos de un minuto.',
  datePublished: '2026-09-01',
  dateModified: '2026-09-01',
  inLanguage: 'es',
  author: { '@type': 'Organization', name: 'Plendu' },
}

export default function GuiaMedidas() {
  return (
    <main className="legal-main" aria-label="Qué medidas poner en un anuncio de Vinted">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Link href="/guias" className="guide-back">← TODAS LAS GUÍAS</Link>

      <h1 className="legal-h1">Qué medidas poner en un anuncio de Vinted</h1>
      <p className="legal-meta">Guía práctica</p>

      <section className="legal-section">
        <p>
          Una M de una marca no es la M de otra, y una M de hace diez años
          tampoco es la M de ahora. Poner las medidas reales de la prenda,
          tomadas en plano, es lo que de verdad le dice al comprador si le va
          a valer, y es la diferencia entre una venta sin preguntas y una
          devolución por talla.
        </p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">Lo único que necesitas es una cinta métrica</h2>
        <p>
          Nada de aparatos especiales. Extiende la prenda sobre una superficie
          plana, alísala bien para que no queden arrugas ni dobleces que
          falseen la medida, y mide siempre con la prenda cerrada tal como se
          llevaría puesta (cremalleras subidas, botones abrochados).
        </p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">Camisetas, camisas y jerséis</h2>
        <ul className="legal-list">
          <li><strong>Pecho</strong> — de axila a axila, en línea recta por debajo de las mangas. Si quieres dar el contorno completo, multiplica por dos.</li>
          <li><strong>Largo</strong> — desde el punto más alto del hombro hasta el borde inferior.</li>
          <li><strong>Hombros</strong> — de una costura de hombro a la otra, por la parte de atrás.</li>
          <li><strong>Manga</strong> — desde la costura del hombro hasta el final del puño.</li>
        </ul>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">Pantalones y faldas</h2>
        <ul className="legal-list">
          <li><strong>Cintura</strong> — de lado a lado por la parte más estrecha, sin estirar la tela.</li>
          <li><strong>Cadera</strong> — de lado a lado por la parte más ancha, normalmente unos 20 cm por debajo de la cintura.</li>
          <li><strong>Largo</strong> — desde la cinturilla hasta el bajo, por el lateral.</li>
          <li><strong>Entrepierna (solo pantalones)</strong> — desde la unión de las perneras hasta el final de la pernera.</li>
        </ul>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">Vestidos y abrigos</h2>
        <p>
          Combina pecho y hombros como en la parte de arriba con el largo total
          desde el hombro hasta el bajo. En abrigos y chaquetas añade también
          el ancho de la manga en el puño: es lo primero que pregunta quien
          busca poder ponerse un jersey grueso debajo.
        </p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">Por qué merece la pena el minuto extra</h2>
        <p>
          Un comprador que duda entre dos anuncios casi idénticos elige el que
          tiene medidas, porque reduce el riesgo de acertar con algo que no
          puede probarse antes de comprar. Y del lado del vendedor, cada
          devolución por talla equivocada cuesta tiempo, portes y a veces la
          valoración del comprador. Un dato tomado una vez con la cinta
          métrica evita las dos cosas.
        </p>
      </section>

      <Link href="/" className="guide-cta">
        Genera tu ficha con Plendu, incluyendo las medidas →
      </Link>
    </main>
  )
}
