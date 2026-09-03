import type { MetadataRoute } from 'next'
import { SEO_TOOLS } from '@/lib/seoTools'

// App-router sitemap (replaces the static public/sitemap.xml, which could not
// scale to the programmatic tool pages). force-static keeps it compatible
// with the Tauri static export (TAURI_BUILD=1).
export const dynamic = 'force-static'

const BASE = 'https://www.commandeditor.com'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, changeFrequency: 'weekly', priority: 1.0, lastModified: now },
    { url: `${BASE}/tools/`, changeFrequency: 'weekly', priority: 0.9, lastModified: now },
    { url: `${BASE}/compare/`, changeFrequency: 'monthly', priority: 0.8, lastModified: now },
    { url: `${BASE}/compare/ilovepdf/`, changeFrequency: 'monthly', priority: 0.8, lastModified: now },
    { url: `${BASE}/compare/smallpdf/`, changeFrequency: 'monthly', priority: 0.8, lastModified: now },
    { url: `${BASE}/compare/adobe/`, changeFrequency: 'monthly', priority: 0.8, lastModified: now },
    { url: `${BASE}/compare/pdf24/`, changeFrequency: 'monthly', priority: 0.8, lastModified: now },
    { url: `${BASE}/factur-x/`, changeFrequency: 'monthly', priority: 0.9, lastModified: now },
    { url: `${BASE}/no-upload/`, changeFrequency: 'yearly', priority: 0.7, lastModified: now },
    { url: `${BASE}/security/`, changeFrequency: 'monthly', priority: 0.7, lastModified: now },
    { url: `${BASE}/ai/`, changeFrequency: 'monthly', priority: 0.8, lastModified: now },
    { url: `${BASE}/privacy/`, changeFrequency: 'yearly', priority: 0.3, lastModified: now },
    { url: `${BASE}/terms/`, changeFrequency: 'yearly', priority: 0.3, lastModified: now },
  ]
  const toolPages: MetadataRoute.Sitemap = SEO_TOOLS.map(t => ({
    url: `${BASE}/tools/${t.id}/`,
    changeFrequency: 'monthly',
    priority: 0.85,
    lastModified: now,
  }))
  return [...staticPages, ...toolPages]
}
