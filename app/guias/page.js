import Link from 'next/link'

export const metadata = {
  title: 'Guías para vender en Vinted · Plendu',
  description: 'Trucos prácticos para fotografiar, tasar y describir ropa de segunda mano en Vinted, escritos por gente que vende de verdad.',
  alternates: { canonical: 'https://plendu.app/guias' },
  robots: { index: true, follow: true },
}

const GUIAS = [
  {
    slug: 'como-fotografiar-ropa-vinted',
    title: 'Cómo fotografiar ropa para Vinted',
    desc: 'Luz, fondo, ángulos y los detalles que hacen que una prenda se vea bien sin retocar nada.',
  },
  {
    slug: 'como-poner-precio-ropa-segunda-mano',
    title: 'Cómo poner precio a la ropa de segunda mano',
    desc: 'Qué mirar antes de poner un número: estado, marca, temporada y cómo funciona la negociación en Vinted.',
  },
  {
    slug: 'que-medidas-poner-en-vinted',
    title: 'Qué medidas poner en un anuncio de Vinted',
    desc: 'Por qué la talla de la etiqueta no basta y cómo medir una prenda en plano en menos de un minuto.',
  },
]

export default function Guias() {
  return (
    <main className="legal-main" aria-label="Guías para vender en Vinted">
      <h1 className="legal-h1">Guías para vender en Vinted</h1>
      <p className="legal-meta">Trucos de gente que vende ropa de segunda mano de verdad</p>

      <div className="guide-list">
        {GUIAS.map((g) => (
          <Link key={g.slug} href={`/guias/${g.slug}`} className="guide-card">
            <p className="guide-card-title">{g.title}</p>
            <p className="guide-card-desc">{g.desc}</p>
          </Link>
        ))}
      </div>
    </main>
  )
}
