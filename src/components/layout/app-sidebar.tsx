'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home, Users, UserCheck, Stethoscope, Package,
  ClipboardList, Send, FileText, CreditCard, User, UserPlus,
  Shield, Upload, Truck, HelpCircle,
} from 'lucide-react';
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

const orderNavItems = [
  { href: '/dashboard', icon: Home, label: 'Dashboard' },
  { href: '/remessas', icon: Send, label: 'Vendas' },
  { href: '/pedidos', icon: Truck, label: 'Pedidos' },
  { href: '/controle', icon: ClipboardList, label: 'Controle' },
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
  { href: '/checkout', icon: CreditCard, label: 'Pagamentos' },
];

const anvisaNavItems = [
  { href: '/anvisa', icon: Shield, label: 'Solicitacoes' },
  { href: '/anvisa/nova', icon: Upload, label: 'Nova Solicitacao' },
  { href: '/anvisa/perfil', icon: User, label: 'Modelo Solicitante' },
];

const adminNavItems = [
  { href: '/usuarios', icon: UserPlus, label: 'Usuarios' },
];

const helpNavItems = [
  { href: '/ajuda', icon: HelpCircle, label: 'Ajuda' },
];

const userNavItems = [
  { href: '/perfil', icon: User, label: 'Perfil' },
];

function NavGroup({ label, items, pathname }: { label: string; items: typeof orderNavItems; pathname: string }) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
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
      <SidebarHeader className="border-b px-4 py-3">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="font-headline text-lg font-bold text-primary">Entourage Lab</span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <NavGroup label="Pedidos" items={orderNavItems} pathname={pathname} />
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
