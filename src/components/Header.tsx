import Link from 'next/link';
import Logo from './Logo';

/**
 * Slim top bar with Seymour's mascot and wordmark.
 *
 * `no-print` because a printed recipe shouldn't spend its first inch on a
 * wordmark. The print rules can't simply hide every `<header>` — the recipe's
 * own title lives in one.
 */
export default function Header() {
  return (
    <header className="no-print mx-auto flex w-full max-w-6xl items-center px-4 pt-[calc(2rem_+_var(--safe-top))] lg:px-8 lg:pt-6">
      <Link
        href="/"
        aria-label="Seymour home"
        className="group inline-flex items-center gap-2.5 rounded-full pr-3"
      >
        <Logo className="h-9 w-9 transition-transform group-hover:-rotate-6" />
        <span className="relative inline-block">
          {/* "feed me" speech bubble — a nod to the hungry plant */}
          <span
            aria-hidden
            className="absolute bottom-full left-0 mb-1.5 -rotate-6 rounded-full bg-zest px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-zest-ink shadow-sm transition-transform group-hover:-rotate-2"
          >
            feed me
            <span className="absolute -bottom-1 left-3 h-2 w-2 rotate-45 bg-zest" />
          </span>
          {/* The wordmark is the one place the display face gets to be fully
              wonky — it's a name, not an interface label. */}
          <span className="font-display text-2xl font-semibold tracking-tight [font-variation-settings:'SOFT'_80,'WONK'_1]">
            Seymour
          </span>
        </span>
      </Link>
    </header>
  );
}
