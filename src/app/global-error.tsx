'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body className="flex h-screen items-center justify-center bg-white font-sans antialiased">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm px-4">
          <h2 className="text-xl font-bold text-gray-900 font-headline">Algo deu errado</h2>
          <p className="text-sm text-gray-500">{error.message}</p>
          <Button onClick={reset}>Tentar novamente</Button>
        </div>
      </body>
    </html>
  );
}
