'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useShoppingStore } from '@/lib/stores';
import {
  HomeIcon,
  RecipesIcon,
  PlanIcon,
  ShoppingIcon,
  SettingsIcon,
  type IconComponent,
} from './icons';

const TABS: Array<{ href: string; label: string; Icon: IconComponent }> = [
  { href: '/', label: 'Home', Icon: HomeIcon },
  { href: '/recipes', label: 'Recipes', Icon: RecipesIcon },
  { href: '/plan', label: 'Plan', Icon: PlanIcon },
  { href: '/shopping-list', label: 'Shopping', Icon: ShoppingIcon },
  { href: '/settings', label: 'Settings', Icon: SettingsIcon },
];

export default function BottomNav() {
  const pathname = usePathname();
  const remaining = useShoppingStore((s) => s.items.filter((i) => !i.checked).length);

  return (
    <nav
      aria-label="Primary"
      // pb var extends the translucent bar down through the home-indicator
      // inset so the tab labels aren't jammed against the physical edge; reset
      // to 0 for the desktop floating pill, which already floats above bottom-4.
      className="fixed inset-x-0 bottom-0 z-40 border-t border-charcoal/10 bg-surface/80 pb-[var(--safe-bottom)] backdrop-blur-md lg:inset-x-auto lg:left-1/2 lg:bottom-4 lg:w-auto lg:-translate-x-1/2 lg:rounded-full lg:border lg:pb-0 lg:shadow-card"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around lg:max-w-none lg:gap-1 lg:px-2">
        {TABS.map((tab) => {
          const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
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
                <span className="relative">
                  <tab.Icon className="h-6 w-6 lg:h-5 lg:w-5" />
                  {tab.href === '/shopping-list' && remaining > 0 && (
                    <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-terracotta px-1 text-[10px] font-bold leading-none text-white">
                      {remaining > 99 ? '99+' : remaining}
                    </span>
                  )}
                </span>
                {tab.label}
                {tab.href === '/shopping-list' && remaining > 0 && (
                  <span className="sr-only">, {remaining} items remaining</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
