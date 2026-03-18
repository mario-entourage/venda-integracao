import { Timestamp } from 'firebase/firestore';

export type AuditSessionStatus = 'pending' | 'active' | 'expired' | 'signed_out';

export interface AuditSession {
  id: string;
  creatingUserId: string;
  creatingUserEmail: string;
  auditorEmail: string;
  status: AuditSessionStatus;
  expiresAt: Timestamp;
  startedAt: Timestamp | null;
  endedAt: Timestamp | null;
  modulesVisited: string[];
  createdAt: Timestamp;
}

/** Module keys that map to top-level sidebar sections */
export const MODULE_KEYS = {
  vendas: 'Vendas',
  cadastros: 'Cadastros',
  produtos_estoque: 'Produtos & Estoque',
  documentos: 'Documentos',
  financeiro: 'Financeiro',
  anvisa: 'ANVISA',
  administracao: 'Administração',
  suporte: 'Suporte',
  perfil: 'Perfil',
} as const;

export type ModuleKey = keyof typeof MODULE_KEYS;

/** Map route prefixes to module keys */
export const ROUTE_TO_MODULE: Record<string, ModuleKey> = {
  '/dashboard': 'vendas',
  '/remessas': 'vendas',
  '/pedidos': 'vendas',
  '/controle': 'vendas',
  '/clientes': 'cadastros',
  '/representantes': 'cadastros',
  '/medicos': 'cadastros',
  '/estoque': 'produtos_estoque',
  '/documentos': 'documentos',
  '/pagamentos': 'financeiro',
  '/anvisa': 'anvisa',
  '/auditoria': 'administracao',
  '/usuarios': 'administracao',
  '/importar': 'administracao',
  '/ajuda': 'suporte',
  '/perfil': 'perfil',
};

/** Expiration duration presets */
export const EXPIRY_OPTIONS = [
  { label: '1 hora', value: 1 * 60 * 60 * 1000 },
  { label: '2 horas', value: 2 * 60 * 60 * 1000 },
  { label: '4 horas', value: 4 * 60 * 60 * 1000 },
  { label: '8 horas', value: 8 * 60 * 60 * 1000 },
  { label: '24 horas', value: 24 * 60 * 60 * 1000 },
  { label: '3 dias', value: 3 * 24 * 60 * 60 * 1000 },
  { label: '1 semana', value: 7 * 24 * 60 * 60 * 1000 },
] as const;
