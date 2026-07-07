import type { Metadata, Viewport } from 'next';
import './globals.css';
import BottomNav from '@/components/BottomNav';
import AppProviders from '@/components/AppProviders';
import { THEME_INIT_SCRIPT } from '@/lib/theme-script';

export const metadata: Metadata = {
  title: {
    default: 'RecipeBoard',
    template: '%s · RecipeBoard',
  },
  description:
    'Your personal recipe collection, randomized meal plans, and smart consolidated shopping lists.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'RecipeBoard',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAF7F2' },
    { media: '(prefers-color-scheme: dark)', color: '#1A1815' },
  ],
  width: 'device-width',
  initialScale: 1,
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
          <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 lg:px-8 lg:pb-12">
            {children}
          </main>
          <BottomNav />
        </AppProviders>
      </body>
    </html>
  );
}
