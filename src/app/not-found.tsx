import Link from 'next/link';
import Logo from '@/components/Logo';

export default function NotFound() {
  return (
    <div className="py-24 text-center">
      {/* The joke is that something ate the page, so the thing that eats
          pages ought to be the one standing here. This was a dinner plate. */}
      <Logo className="animate-float mx-auto h-24 w-24" />
      <h1 className="mt-4 text-3xl font-bold">Nothing on this plate</h1>
      <p className="mx-auto mt-2 max-w-sm text-charcoal/70">
        There&apos;s no page here. I may have eaten it. I genuinely can&apos;t remember.
      </p>
      <Link href="/" className="btn-primary mt-6">
        Back to the kitchen
      </Link>
    </div>
  );
}
