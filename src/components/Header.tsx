import Link from 'next/link';
import Logo from './Logo';

/** Slim top bar with Seymour's mascot and wordmark. */
export default function Header() {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center px-4 pt-8 lg:px-8 lg:pt-6">
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
            className="absolute bottom-full left-0 mb-1.5 -rotate-6 rounded-full bg-terracotta px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white shadow-sm transition-transform group-hover:-rotate-2"
          >
            feed me
            <span className="absolute -bottom-1 left-3 h-2 w-2 rotate-45 bg-terracotta" />
          </span>
          <span className="text-xl font-bold tracking-tight">Seymour</span>
        </span>
      </Link>
    </header>
  );
}
