import Link from 'next/link';
import { Button } from '@/components/ui';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <p className="text-5xl font-bold text-brand">404</p>
      <h1 className="text-xl font-semibold">We could not find that page</h1>
      <p className="max-w-md text-sm text-muted">
        The opportunity may have expired and been removed, or the link may be wrong.
      </p>
      <div className="flex gap-2">
        <Link href="/opportunities"><Button>Browse opportunities</Button></Link>
        <Link href="/"><Button variant="outline">Go home</Button></Link>
      </div>
    </div>
  );
}
