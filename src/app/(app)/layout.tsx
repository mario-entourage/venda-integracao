import { AuthGuard } from '@/components/auth/auth-guard';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { AppHeader } from '@/components/layout/app-header';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AuditModeProvider } from '@/contexts/audit-mode-context';
import { AuditModePopup } from '@/components/audit/audit-mode-popup';
import { AuditModeBanner } from '@/components/audit/audit-mode-banner';
import { AuditModeLayout } from '@/components/audit/audit-mode-layout';

export const dynamic = 'force-dynamic';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <AuditModeProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <AppHeader />
            <AuditModeBanner />
            <AuditModeLayout>
              <main className="flex-1 min-w-0 overflow-x-hidden p-4 lg:p-6">{children}</main>
            </AuditModeLayout>
          </SidebarInset>
        </SidebarProvider>
        <AuditModePopup />
      </AuditModeProvider>
    </AuthGuard>
  );
}
