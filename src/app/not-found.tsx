import Link from 'next/link';
import { PlateIcon } from '@/components/icons';

export default function NotFound() {
  return (
    <div className="py-24 text-center">
      <PlateIcon className="animate-float mx-auto h-20 w-20" />
      <h1 className="mt-4 text-3xl font-bold">Nothing on this plate</h1>
      <p className="mx-auto mt-2 max-w-sm text-charcoal/60">
        The page you&apos;re looking for doesn&apos;t exist. Maybe it was eaten.
      </p>
      <Link href="/" className="btn-primary mt-6">
        Back to the kitchen
      </Link>
    </div>
  );
}
