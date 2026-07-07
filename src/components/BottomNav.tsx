'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Home', icon: '🏠' },
  { href: '/recipes', label: 'Recipes', icon: '📖' },
  { href: '/plan', label: 'Plan', icon: '🗓️' },
  { href: '/shopping-list', label: 'Shopping', icon: '🛒' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
] as const;

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-charcoal/10 bg-white/80 backdrop-blur-md lg:inset-x-auto lg:left-1/2 lg:bottom-4 lg:w-auto lg:-translate-x-1/2 lg:rounded-full lg:border lg:shadow-card"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around lg:gap-1 lg:px-2">
        {TABS.map((tab) => {
          const active =
            tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-w-16 flex-col items-center gap-0.5 px-3 py-2.5 text-xs font-medium transition-colors lg:flex-row lg:gap-1.5 lg:rounded-full lg:px-4 lg:text-sm ${
                  active
                    ? 'text-terracotta lg:bg-terracotta/10'
                    : 'text-charcoal/60 hover:text-charcoal'
                }`}
              >
                <span aria-hidden className="text-lg lg:text-base">
                  {tab.icon}
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
