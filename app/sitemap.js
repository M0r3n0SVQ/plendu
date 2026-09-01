const GUIAS = [
  'como-fotografiar-ropa-vinted',
  'como-poner-precio-ropa-segunda-mano',
  'que-medidas-poner-en-vinted',
]

export default function sitemap() {
  return [
    {
      url: 'https://plendu.app',
      lastModified: new Date('2026-03-01'),
      changeFrequency: 'monthly',
      priority: 1,
    },
    {
      url: 'https://plendu.app/privacidad',
      lastModified: new Date('2026-03-01'),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: 'https://plendu.app/guias',
      lastModified: new Date('2026-09-01'),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    ...GUIAS.map((slug) => ({
      url: `https://plendu.app/guias/${slug}`,
      lastModified: new Date('2026-09-01'),
      changeFrequency: 'yearly',
      priority: 0.6,
    })),
  ]
}
