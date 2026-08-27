import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Private, per-user surfaces are never crawlable.
      disallow: [
        '/api/', '/admin', '/dashboard', '/profile', '/applications',
        '/saved', '/notifications', '/assistant', '/onboarding',
        '/skills', '/readiness', '/recommended', '/alerts', '/near-misses',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
