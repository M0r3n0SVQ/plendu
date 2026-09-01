import Link from 'next/link'

export const metadata = {
  title: 'Cómo poner precio a la ropa de segunda mano · Plendu',
  description: 'Qué mirar antes de poner un número en Vinted: estado, marca, temporada y cómo funciona la negociación. Sin fórmulas mágicas, con criterio real.',
  alternates: { canonical: 'https://plendu.app/guias/como-poner-precio-ropa-segunda-mano' },
  robots: { index: true, follow: true },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Cómo poner precio a la ropa de segunda mano',
  description: 'Qué mirar antes de poner un número en Vinted: estado, marca, temporada y cómo funciona la negociación.',
  datePublished: '2026-09-01',
  dateModified: '2026-09-01',
  inLanguage: 'es',
  author: { '@type': 'Organization', name: 'Plendu' },
}

export default function GuiaPrecio() {
  return (
    <main className="legal-main" aria-label="Cómo poner precio a la ropa de segunda mano">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Link href="/guias" className="guide-back">← TODAS LAS GUÍAS</Link>

      <h1 className="legal-h1">Cómo poner precio a la ropa de segunda mano</h1>
      <p className="legal-meta">Guía práctica</p>

      <section className="legal-section">
        <p>
          No hay una fórmula que acierte siempre, pero sí hay señales que
          reducen mucho el margen de error. Poner un precio demasiado alto
          significa que el anuncio se queda semanas sin ni una visita; ponerlo
          demasiado bajo significa regalar dinero que la prenda sí valía.
        </p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">Mira lo que se ha vendido de verdad, no lo que está en venta</h2>
        <p>
          Los anuncios activos de Vinted con un precio parecido al que tú
          tenías en mente no dicen nada sobre si ese precio funciona: puede
          llevar meses ahí sin venderse. La señal fiable es buscar artículos
          iguales o muy parecidos que ya se hayan vendido. Si no encuentras
          ninguno vendido, baja un poco tu expectativa: es la prueba de que el
          precio que tenías en mente probablemente estaba por encima de lo que
          la gente paga.
        </p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">El estado pesa más que el precio original</h2>
        <p>
          Una prenda de 80€ con la etiqueta puesta vale más que la misma
          prenda usada diez veces, por buena que esté. Como referencia rápida:
        </p>
        <ul className="legal-list">
          <li><strong>Nuevo con etiquetas</strong> — entre el 50% y el 70% del precio original, según cuánto tiempo lleve sin venderse en tienda.</li>
          <li><strong>Nuevo sin etiquetas / muy bueno</strong> — entre el 30% y el 50%.</li>
          <li><strong>Bueno, con señales de uso normal</strong> — entre el 15% y el 30%.</li>
          <li><strong>Satisfactorio, con algún defecto visible</strong> — por debajo del 15%, y siempre mencionando el defecto en el anuncio.</li>
        </ul>
        <p>
          Son rangos orientativos, no una tabla fija: una marca muy buscada
          puede sostener un porcentaje más alto incluso con uso.
        </p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">La marca y la temporada mueven el precio</h2>
        <p>
          Una marca reconocida y buscada aguanta un precio más alto porque hay
          más gente dispuesta a pagarlo, y se vende más rápido aunque cueste
          más. Una prenda sin marca o de una marca poco conocida se mueve casi
          solo por precio: si está muy ajustado, vende; si no, se queda quieta.
        </p>
        <p>
          La temporada también importa. Un abrigo publicado en julio va a
          tardar en venderse compres el precio que compres; el mismo abrigo en
          octubre se mueve mucho más rápido. Si necesitas vender ya y fuera de
          temporada, bájalo un poco más de lo que harías en el momento
          adecuado.
        </p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">Deja margen para la oferta</h2>
        <p>
          En Vinted es normal que te hagan una oferta por debajo del precio
          publicado, sobre todo si llevas el artículo publicado unos días.
          Poner el precio un 10-15% por encima de tu mínimo real te da margen
          para aceptar una oferta sin sentir que has malvendido, y sigue
          pareciendo un precio razonable a quien mira el anuncio por primera
          vez.
        </p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">Vender en lote también es una forma de fijar precio</h2>
        <p>
          Si tienes varias prendas parecidas que no consiguen venderse por
          separado, bajar el precio de cada una al venderlas juntas suele
          mover más stock que insistir en el precio individual. Para el
          comprador, el envío conjunto ya es un ahorro; no hace falta que cada
          prenda suelta compita con el resto de tu armario.
        </p>
      </section>

      <Link href="/" className="guide-cta">
        Genera tu ficha con precio estimado en Plendu →
      </Link>
    </main>
  )
}
