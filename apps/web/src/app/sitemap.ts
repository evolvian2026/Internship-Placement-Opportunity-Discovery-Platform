import type { MetadataRoute } from 'next';
import { api } from '@/lib/api';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

/** Regenerated periodically rather than at build time, so new postings appear. */
export const revalidate = 900;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    const data = await api.seo.sitemap(1);
    return data.urls.map((url) => ({
      url: `${SITE_URL}${url.loc}`,
      lastModified: url.lastmod ? new Date(url.lastmod) : undefined,
    }));
  } catch {
    // A sitemap that fails to build must not take the site down.
    return [{ url: SITE_URL, lastModified: new Date() }];
  }
}
