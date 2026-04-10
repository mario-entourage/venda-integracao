'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

export type Lang = 'pt' | 'en';
// Keep old alias so existing imports still work
export type DashboardLang = Lang;

interface LangContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

const LangContext = createContext<LangContextValue | null>(null);

export function DashboardLangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('pt');
  return (
    <LangContext.Provider value={{ lang, setLang }}>
      {children}
    </LangContext.Provider>
  );
}

export function useDashboardLang() {
  return useContext(LangContext);
}

// ─── Sidebar translations ────────────────────────────────────────────────────

const sidebarLabels: Record<string, Record<Lang, string>> = {
  // Nav items
  Home: { pt: 'Home', en: 'Home' },
  'Nova Venda': { pt: 'Nova Venda', en: 'New Sale' },
  Pedidos: { pt: 'Pedidos', en: 'Orders' },
  Controle: { pt: 'Controle', en: 'Control' },
  Clientes: { pt: 'Clientes', en: 'Clients' },
  Representantes: { pt: 'Representantes', en: 'Representatives' },
  'Médicos': { pt: 'Médicos', en: 'Doctors' },
  Estoque: { pt: 'Estoque', en: 'Inventory' },
  Documentos: { pt: 'Documentos', en: 'Documents' },
  Pagamentos: { pt: 'Pagamentos', en: 'Payments' },
  'Comissões': { pt: 'Comissões', en: 'Commissions' },
  'Solicitações': { pt: 'Solicitações', en: 'Requests' },
  'Modelo Solicitante': { pt: 'Modelo Solicitante', en: 'Applicant Template' },
  'Extensão': { pt: 'Extensão', en: 'Extension' },
  Usuarios: { pt: 'Usuarios', en: 'Users' },
  Auditoria: { pt: 'Auditoria', en: 'Audit' },
  'Importar CSV': { pt: 'Importar CSV', en: 'Import CSV' },
  Ajuda: { pt: 'Ajuda', en: 'Help' },
  Perfil: { pt: 'Perfil', en: 'Profile' },
  // Group labels
  Vendas: { pt: 'Vendas', en: 'Sales' },
  Cadastros: { pt: 'Cadastros', en: 'Registry' },
  'Produtos & Estoque': { pt: 'Produtos & Estoque', en: 'Products & Inventory' },
  Financeiro: { pt: 'Financeiro', en: 'Financial' },
  ANVISA: { pt: 'ANVISA', en: 'ANVISA' },
  'Administração': { pt: 'Administração', en: 'Administration' },
  Suporte: { pt: 'Suporte', en: 'Support' },
};

export function translateSidebar(label: string, lang: Lang): string {
  return sidebarLabels[label]?.[lang] ?? label;
}
