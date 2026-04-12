'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Josefin_Sans } from 'next/font/google';
import {
  Home, Users, UserCheck, Stethoscope, Package,
  ClipboardList, Send, FileText, CreditCard, User, UserPlus,
  Shield, Upload, Truck, HelpCircle, Chrome, Eye, DollarSign,
} from 'lucide-react';
import { useAuditMode } from '@/contexts/audit-mode-context';
import { useDashboardLang, translateSidebar } from '@/contexts/dashboard-lang-context';

const josefinSans = Josefin_Sans({
  subsets: ['latin'],
  weight: '700',
});
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';

const vendasNavItems = [
  { href: '/dashboard', icon: Home, label: 'Home' },
  { href: '/remessas', icon: Send, label: 'Nova Venda' },
  { href: '/pedidos', icon: Truck, label: 'Pedidos' },
  { href: '/controle', icon: ClipboardList, label: 'Controle' },
];

const cadastrosNavItems = [
  { href: '/clientes', icon: Users, label: 'Clientes' },
  { href: '/representantes', icon: UserCheck, label: 'Representantes' },
  { href: '/medicos', icon: Stethoscope, label: 'Médicos' },
];

const productNavItems = [
  { href: '/estoque', icon: Package, label: 'Estoque' },
];

const documentNavItems = [
  { href: '/documentos', icon: FileText, label: 'Documentos' },
];

const paymentNavItems = [
  { href: '/pagamentos', icon: CreditCard, label: 'Pagamentos' },
  { href: '/comissoes', icon: DollarSign, label: 'Comissões' },
];

const anvisaNavItems = [
  { href: '/anvisa', icon: Shield, label: 'Solicitações' },
  { href: '/anvisa/perfil', icon: User, label: 'Modelo Solicitante' },
  { href: '/anvisa/extensao', icon: Chrome, label: 'Extensão' },
];

const adminNavItems = [
  { href: '/usuarios', icon: UserPlus, label: 'Usuarios' },
  { href: '/auditoria', icon: Eye, label: 'Auditoria' },
  { href: '/importar', icon: Upload, label: 'Importar CSV' },
];

const helpNavItems = [
  { href: '/ajuda', icon: HelpCircle, label: 'Ajuda' },
];

const userNavItems = [
  { href: '/perfil', icon: User, label: 'Perfil' },
];

function NavGroup({
  label,
  items,
  pathname,
  labelClassName,
  lang,
}: {
  label: string;
  items: typeof vendasNavItems;
  pathname: string;
  labelClassName?: string;
  lang: 'pt' | 'en';
}) {
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <SidebarGroup>
      <SidebarGroupLabel className={labelClassName}>
        {translateSidebar(label, lang)}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                isActive={
                  pathname === item.href ||
                  (item.href !== '/dashboard' &&
                    pathname.startsWith(item.href))
                }
              >
                <Link
                  href={item.href}
                  onClick={() => isMobile && setOpenMobile(false)}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{translateSidebar(item.label, lang)}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/** Routes hidden from the sidebar in audit mode */
const AUDIT_HIDDEN_ROUTES = new Set([
  '/remessas',
  '/anvisa/nova',
  '/importar',
  '/auditoria',
]);

export function AppSidebar() {
  const pathname = usePathname();
  const { isAuditMode } = useAuditMode();
  const langCtx = useDashboardLang();
  const lang = langCtx?.lang ?? 'pt';

  const filterItems = (items: typeof vendasNavItems) =>
    isAuditMode
      ? items.filter((i) => !AUDIT_HIDDEN_ROUTES.has(i.href))
      : items;

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border px-4 py-3">
        <Link href="/dashboard" className="flex items-center justify-center">
          <h1
            className={`${josefinSans.className} text-xl font-bold uppercase tracking-[0.3em] text-[#2EE6D6]`}
          >
            VENDAS
          </h1>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <NavGroup
          label="Vendas"
          labelClassName="sr-only"
          items={filterItems(vendasNavItems)}
          pathname={pathname}
          lang={lang}
        />

        <NavGroup
          label="Cadastros"
          items={filterItems(cadastrosNavItems)}
          pathname={pathname}
          lang={lang}
        />

        <NavGroup
          label="Produtos & Estoque"
          items={filterItems(productNavItems)}
          pathname={pathname}
          lang={lang}
        />

        <NavGroup
          label="Documentos"
          items={filterItems(documentNavItems)}
          pathname={pathname}
          lang={lang}
        />

        <NavGroup
          label="Financeiro"
          items={filterItems(paymentNavItems)}
          pathname={pathname}
          lang={lang}
        />

        <NavGroup
          label="ANVISA"
          items={filterItems(anvisaNavItems)}
          pathname={pathname}
          lang={lang}
        />

        <NavGroup
          label="Administração"
          items={filterItems(adminNavItems)}
          pathname={pathname}
          lang={lang}
        />

        <NavGroup
          label="Suporte"
          items={filterItems(helpNavItems)}
          pathname={pathname}
          lang={lang}
        />
      </SidebarContent>

      <SidebarFooter className="border-t">
        <SidebarMenu>
          {userNavItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                isActive={pathname.startsWith(item.href)}
              >
                <Link href={item.href}>
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}