'use client';

import { useUser, useAuth } from '@/firebase/provider';
import { useAuditMode } from '@/contexts/audit-mode-context';
import { useDashboardLang } from '@/contexts/dashboard-lang-context';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { LogOut, Eye } from 'lucide-react';
import { NotificationBell } from './notification-bell';
import { BrandLogo } from '@/components/shared/brand-logo';

export function AppHeader() {
  const { user } = useUser();
  const auth = useAuth();
  const { isAuditMode, auditSession, deactivateAuditMode } = useAuditMode();
  const dashboardLang = useDashboardLang();

  const initials = user?.displayName
    ? user.displayName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.[0]?.toUpperCase() || '?';

  const handleSignOut = () => {
    if (isAuditMode) {
      deactivateAuditMode('signed_out');
    } else {
      auth.signOut();
    }
  };

  return (
    <header className="relative flex h-14 items-center gap-2 border-b bg-[#093e5d] px-4">
      {/* Left: sidebar trigger */}
      <SidebarTrigger className="text-white" />
      <Separator orientation="vertical" className="h-6" />

      {/* Center: Entourage logo — absolutely positioned for true centering */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <BrandLogo variant="light" size={32} className="text-white" />
      </div>

      {/* Right: notification bell + user menu */}
      <div className="relative z-10 ml-auto flex items-center gap-2 text-white">
        {!isAuditMode && <NotificationBell />}

        {dashboardLang && (
          <div className="flex items-center rounded-md border border-white/20">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-6 rounded-r-none px-2 text-[10px]',
                dashboardLang.lang === 'pt'
                  ? 'bg-white/20 text-white font-bold'
                  : 'text-white/60',
              )}
              onClick={() => dashboardLang.setLang('pt')}
            >
              PT
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-6 rounded-l-none px-2 text-[10px]',
                dashboardLang.lang === 'en'
                  ? 'bg-white/20 text-white font-bold'
                  : 'text-white/60',
              )}
              onClick={() => dashboardLang.setLang('en')}
            >
              EN
            </Button>
          </div>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              {isAuditMode && (
                <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300 gap-1">
                  <Eye className="h-3 w-3" />
                  Auditoria
                </Badge>
              )}
              <Avatar className="h-8 w-8">
                {isAuditMode ? (
                  <AvatarFallback className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                    AU
                  </AvatarFallback>
                ) : (
                  <>
                    <AvatarImage src={user?.photoURL || undefined} alt={user?.displayName || ''} />
                    <AvatarFallback className="text-xs font-semibold bg-slate-200 text-[#093e5d]">{initials}</AvatarFallback>
                  </>
                )}
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                {isAuditMode ? (
                  <>
                    <span className="text-sm font-medium">Modo Auditoria</span>
                    <span className="text-xs text-muted-foreground">{auditSession?.auditorEmail}</span>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-medium">{user?.displayName || 'Usuario'}</span>
                    <span className="text-xs text-muted-foreground">{user?.email}</span>
                  </>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              {isAuditMode ? 'Sair da Auditoria' : 'Sair'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
