'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home, Users, UserCheck, Stethoscope, Package,
  ClipboardList, Send, FileText, CreditCard, User, UserPlus,
  Shield, Upload, Truck, HelpCircle, Chrome,
} from 'lucide-react';
import { BrandLogo } from '@/components/shared/brand-logo';
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
  { href: '/medicos', icon: Stethoscope, label: 'Medicos' },
];

const productNavItems = [
  { href: '/estoque', icon: Package, label: 'Estoque' },
];

const documentNavItems = [
  { href: '/documentos', icon: FileText, label: 'Documentos' },
];

const paymentNavItems = [
  { href: '/pagamentos', icon: CreditCard, label: 'Pagamentos' },
];

const anvisaNavItems = [
  { href: '/anvisa', icon: Shield, label: 'Solicitacoes' },
  { href: '/anvisa/nova', icon: Upload, label: 'Nova Solicitacao' },
  { href: '/anvisa/perfil', icon: User, label: 'Modelo Solicitante' },
  { href: '/anvisa/extensao', icon: Chrome, label: 'Extensao' },
];

const adminNavItems = [
  { href: '/usuarios', icon: UserPlus, label: 'Usuarios' },
  { href: '/importar', icon: Upload, label: 'Importar CSV' },
];

const helpNavItems = [
  { href: '/ajuda', icon: HelpCircle, label: 'Ajuda' },
];

const userNavItems = [
  { href: '/perfil', icon: User, label: 'Perfil' },
];

function NavGroup({ label, items, pathname, labelClassName }: { label: string; items: typeof vendasNavItems; pathname: string; labelClassName?: string }) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel className={labelClassName}>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton asChild isActive={pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))}>
                <Link href={item.href}>
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border px-4 py-3">
        <Link href="/dashboard" className="flex items-center gap-2">
          <BrandLogo variant="light" className="text-sidebar-primary-foreground" />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="h-10">
            <span style={{ fontFamily: 'Meddon, cursive', textTransform: 'none', marginLeft: '0.75em' }} className="text-lg leading-none">
              Vendas
            </span>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {vendasNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))}>
                    <Link href={item.href}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <NavGroup label="Cadastros" items={cadastrosNavItems} pathname={pathname} />
        <NavGroup label="Produtos & Estoque" items={productNavItems} pathname={pathname} />
        <NavGroup label="Documentos" items={documentNavItems} pathname={pathname} />
        <NavGroup label="Financeiro" items={paymentNavItems} pathname={pathname} />
        <NavGroup label="ANVISA" items={anvisaNavItems} pathname={pathname} />

        <NavGroup label="Administracao" items={adminNavItems} pathname={pathname} />
        <NavGroup label="Suporte" items={helpNavItems} pathname={pathname} />
      </SidebarContent>

      <SidebarFooter className="border-t">
        <SidebarMenu>
          {userNavItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton asChild isActive={pathname.startsWith(item.href)}>
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
