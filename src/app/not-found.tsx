import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-4">
      <h1 className="font-headline text-4xl font-bold">404</h1>
      <p className="text-muted-foreground">Pagina nao encontrada.</p>
      <Button asChild>
        <Link href="/dashboard">Voltar ao Dashboard</Link>
      </Button>
    </div>
  );
}
