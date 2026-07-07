import Link from 'next/link';
import Logo from './Logo';

/** Slim top bar with Seymour's mascot and wordmark. */
export default function Header() {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center px-4 pt-5 lg:px-8">
      <Link
        href="/"
        aria-label="Seymour home"
        className="group inline-flex items-center gap-2.5 rounded-full py-1 pr-3"
      >
        <Logo className="h-9 w-9 transition-transform group-hover:-rotate-6" />
        <span className="text-xl font-bold tracking-tight">Seymour</span>
      </Link>
    </header>
  );
}
