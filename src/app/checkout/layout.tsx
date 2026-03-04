import { BrandLogo } from '@/components/shared/brand-logo';

export const dynamic = 'force-dynamic';

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4 flex items-center gap-2">
        <BrandLogo variant="color" />
        <span className="ml-2 text-sm text-muted-foreground">Checkout</span>
      </header>
      <main className="mx-auto max-w-3xl p-6">{children}</main>
    </div>
  );
}
