import Link from 'next/link'
import { SITE_URL } from '../../lib/siteUrl'

export const metadata = {
  title: 'Cómo fotografiar ropa para Vinted · Plendu',
  description: 'Luz, fondo, ángulos y los detalles que hacen que una prenda se vea bien en Vinted sin retocar nada. Guía práctica con lo que de verdad importa.',
  alternates: { canonical: `${SITE_URL}/guias/como-fotografiar-ropa-vinted` },
  robots: { index: true, follow: true },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Cómo fotografiar ropa para Vinted',
  description: 'Luz, fondo, ángulos y los detalles que hacen que una prenda se vea bien en Vinted sin retocar nada.',
  datePublished: '2026-09-01',
  dateModified: '2026-09-01',
  inLanguage: 'es',
  author: { '@type': 'Organization', name: 'Plendu' },
}

export default function GuiaFotos() {
  return (
    <main className="legal-main" aria-label="Cómo fotografiar ropa para Vinted">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Link href="/guias" className="guide-back">← TODAS LAS GUÍAS</Link>

      <h1 className="legal-h1">Cómo fotografiar ropa para Vinted</h1>
      <p className="legal-meta">Guía práctica</p>

      <section className="legal-section">
        <p>
          En Vinted la foto vende antes que el texto. La gente pasa el dedo por
          decenas de anuncios en segundos y decide si para o sigue según lo que
          ve en la miniatura. No hace falta cámara buena ni estudio en casa,
          hace falta luz decente, un fondo que no distraiga y enseñar la prenda
          tal cual es.
        </p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">La luz importa más que la cámara</h2>
        <p>
          La luz natural de una ventana, sin sol directo, es la mejor luz que
          vas a conseguir gratis. El sol directo quema colores y crea sombras
          duras; el flash del móvil aplana la prenda y suele cambiar el tono
          real de la tela. Busca un momento del día con luz suave, colócate de
          cara a la ventana y deja que la luz caiga sobre la prenda de lado, no
          desde detrás de ti.
        </p>
        <p>
          Si el color en la foto no se parece al color real, dilo en la
          descripción. Un comprador que recibe algo «distinto a la foto» pide
          devolución, y eso te cuesta más tiempo que hacer una foto mejor desde
          el principio.
        </p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">Un fondo limpio, siempre el mismo</h2>
        <p>
          Una pared lisa, el suelo, una sábana blanca o una puerta sin
          decoración. Cualquiera vale mientras no compita con la prenda. Usar
          siempre el mismo fondo tiene una ventaja extra: tu perfil se ve como
          una tienda de verdad, no como armario vaciado de una vez, y eso
          genera confianza para comprar más de un artículo tuyo a la vez.
        </p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">Cómo colocar la prenda</h2>
        <p>
          Dos formas funcionan bien y no necesitan maniquí: colgada en una
          percha contra la pared, o en plano sobre una superficie lisa con las
          arrugas estiradas a mano. Lo que no funciona es fotografiar la prenda
          amontonada sobre la cama o tirada en el suelo: no se aprecia el corte
          ni el largo real, y en Vinted eso se traduce en menos clics.
        </p>
        <p>
          Plancha o pasa el vapor antes de fotografiar. Una arruga en la foto
          se lee como «prenda descuidada» aunque la prenda esté en perfecto
          estado.
        </p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">Qué fotos incluir</h2>
        <ul className="legal-list">
          <li><strong>Frontal completa</strong>: la que decide si alguien entra al anuncio. Prenda entera, encuadre recto, sin ángulos raros que la deformen.</li>
          <li><strong>Trasera</strong>: muchos compradores buscan corte o largo por detrás antes de preguntar nada.</li>
          <li><strong>Etiqueta</strong>: marca y talla en una sola foto legible. Es el dato que más preguntas evita.</li>
          <li><strong>Detalle de cualquier defecto</strong>: una mancha, un enganchón, un botón flojo. Enseñarlo de cerca no ahuyenta compradores, evita disputas y devoluciones después.</li>
        </ul>
        <p>
          Para calzado añade una foto de la suela: es lo primero que mira
          cualquiera que compra zapatillas de segunda mano, y su desgaste dice
          más del uso real que cualquier descripción.
        </p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">Errores que alejan compradores</h2>
        <ul className="legal-list">
          <li>Filtros o ajustes de color que hacen que la prenda no coincida con la realidad.</li>
          <li>Una sola foto para todo el anuncio, sin trasera ni etiqueta.</li>
          <li>Fotos verticales muy alejadas donde la prenda ocupa una esquina pequeña de la imagen.</li>
          <li>Fondo distinto en cada foto, que hace parecer el anuncio improvisado.</li>
        </ul>
      </section>

      <Link href="/" className="guide-cta">
        Sube tus fotos y genera la ficha con Plendu →
      </Link>
    </main>
  )
}
