import type { Metadata, Viewport } from 'next';
import './globals.css';
import BottomNav from '@/components/BottomNav';
import Header from '@/components/Header';
import AppProviders from '@/components/AppProviders';
import { THEME_INIT_SCRIPT } from '@/lib/theme-script';

export const metadata: Metadata = {
  title: {
    default: 'Seymour',
    template: '%s · Seymour',
  },
  description:
    'Feed Seymour your recipes: a personal collection, randomized meal plans, and smart consolidated shopping lists.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Seymour',
  },
  icons: {
    // Browser tab: a zoomed-in crop of Seymour's face — the full potted
    // plant is an illegible speck at 16–32px, but the toothy head reads.
    icon: '/favicon.svg',
    // Home-screen icon: must be a PNG — iOS silently ignores an SVG
    // apple-touch-icon and falls back to a page screenshot.
    apple: '/apple-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAF7F2' },
    { media: '(prefers-color-scheme: dark)', color: '#1A1815' },
  ],
  width: 'device-width',
  initialScale: 1,
  // Extend the page into the notch / home-indicator area so it fills the
  // screen edge-to-edge as an installed PWA — and, crucially, so the
  // env(safe-area-inset-*) values (used by the header and bottom nav) are
  // populated instead of collapsing to 0.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the theme init script may add .dark to <html>
    // before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh font-sans">
        <AppProviders>
          <Header />
          {/* Bottom padding clears the fixed nav *and* the home-indicator
              inset the nav now sits above, so the last of the content is never
              hidden behind it. */}
          <main className="mx-auto w-full max-w-6xl px-4 pb-[calc(7rem_+_var(--safe-bottom))] pt-4 lg:px-8 lg:pb-12">
            {children}
          </main>
          <BottomNav />
        </AppProviders>
      </body>
    </html>
  );
}
