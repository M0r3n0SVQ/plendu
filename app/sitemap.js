import { SITE_URL } from './lib/siteUrl'

const GUIAS = [
  'como-fotografiar-ropa-vinted',
  'como-poner-precio-ropa-segunda-mano',
  'que-medidas-poner-en-vinted',
]

export default function sitemap() {
  return [
    {
      url: SITE_URL,
      lastModified: new Date('2026-03-01'),
      changeFrequency: 'monthly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/privacidad`,
      lastModified: new Date('2026-03-01'),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/guias`,
      lastModified: new Date('2026-09-01'),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    ...GUIAS.map((slug) => ({
      url: `${SITE_URL}/guias/${slug}`,
      lastModified: new Date('2026-09-01'),
      changeFrequency: 'yearly',
      priority: 0.6,
    })),
  ]
}
