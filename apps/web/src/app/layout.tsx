import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/components/AuthProvider';
import { AppShell } from '@/components/AppShell';
import { THEME_SCRIPT } from '@/components/ThemeToggle';
import './globals.css';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Opportunity Discovery — Off-Campus Internships, Jobs, Government & PSU',
    template: '%s | Opportunity Discovery',
  },
  description:
    'Discover off-campus internships, fresher jobs, government and PSU opportunities matched to your education, skills and eligibility — with deadlines and official application links.',
  keywords: [
    'off campus drive', 'internships', 'fresher jobs', 'government jobs', 'PSU recruitment',
    'placement', 'graduate trainee', 'apprenticeship', 'walk-in interview',
  ],
  openGraph: {
    type: 'website',
    siteName: 'Opportunity Discovery',
    url: SITE_URL,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
    { media: '(prefers-color-scheme: dark)', color: '#020617' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the stored theme before first paint, avoiding a flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="font-sans">
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
