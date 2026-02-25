'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[AppError]', error);
  }, [error]);

  return (
    <div className="flex h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <h2 className="text-xl font-bold">Algo deu errado</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{error.message}</p>
      <div className="flex gap-2">
        <Button variant="outline" asChild>
          <Link href="/dashboard">← Início</Link>
        </Button>
        <Button onClick={reset}>Tentar novamente</Button>
      </div>
    </div>
  );
}
