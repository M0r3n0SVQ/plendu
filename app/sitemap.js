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
  ]
}
