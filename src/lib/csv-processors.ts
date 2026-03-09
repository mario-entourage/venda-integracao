/**
 * CSV import processors — validation and transformation for bulk entity uploads.
 */

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export function parseNumber(v: string): number {
  if (!v?.trim()) return 0;
  const cleaned = v.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

export function parseDate(v: string): Date | null {
  if (!v?.trim()) return null;
  let d = new Date(v.trim() + 'T12:00:00');
  if (!isNaN(d.getTime())) return d;
  const match = v.trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (match) {
    d = new Date(`${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}T12:00:00`);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

export interface RowValidation {
  valid: boolean;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Doctor
// ---------------------------------------------------------------------------

export const DOCTOR_COLUMNS = [
  'firstName', 'lastName', 'email', 'crm', 'mainSpecialty',
  'state', 'city', 'phone', 'mobilePhone', 'repUserEmail',
] as const;

export const DOCTOR_COLUMN_LABELS: Record<string, string> = {
  firstName: 'Nome',
  lastName: 'Sobrenome',
  email: 'Email',
  crm: 'CRM',
  mainSpecialty: 'Especialidade',
  state: 'UF',
  city: 'Cidade',
  phone: 'Telefone fixo',
  mobilePhone: 'Celular',
  repUserEmail: 'Email do representante',
};

export function validateDoctorRow(row: Record<string, string>): RowValidation {
  const errors: string[] = [];
  if (!row.firstName?.trim()) errors.push('Nome é obrigatório');
  if (!row.crm?.trim()) errors.push('CRM é obrigatório');
  if (row.state?.trim() && row.state.trim().length !== 2)
    errors.push('UF deve ter 2 letras');
  return { valid: errors.length === 0, errors };
}

export function transformDoctorRow(row: Record<string, string>) {
  const firstName = (row.firstName ?? '').trim();
  const lastName = (row.lastName ?? '').trim();
  return {
    firstName,
    lastName,
    fullName: lastName ? `${firstName} ${lastName}` : firstName,
    email: (row.email ?? '').trim(),
    crm: (row.crm ?? '').trim(),
    mainSpecialty: (row.mainSpecialty ?? '').trim(),
    state: (row.state ?? '').trim().toUpperCase(),
    city: (row.city ?? '').trim(),
    phone: (row.phone ?? '').trim(),
    mobilePhone: (row.mobilePhone ?? '').trim(),
    active: true,
    repUserEmail: (row.repUserEmail ?? '').trim(),
  };
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export const CLIENT_COLUMNS = [
  'document', 'firstName', 'lastName', 'email', 'phone',
  'birthDate', 'street', 'number', 'neighborhood', 'city', 'state', 'postalCode',
] as const;

export const CLIENT_COLUMN_LABELS: Record<string, string> = {
  document: 'CPF / Documento',
  firstName: 'Nome',
  lastName: 'Sobrenome',
  email: 'Email',
  phone: 'Telefone',
  birthDate: 'Data nascimento',
  street: 'Rua',
  number: 'Número',
  neighborhood: 'Bairro',
  city: 'Cidade',
  state: 'UF',
  postalCode: 'CEP',
};

export function validateClientRow(row: Record<string, string>): RowValidation {
  const errors: string[] = [];
  if (!row.firstName?.trim()) errors.push('Nome é obrigatório');
  if (!row.document?.trim()) errors.push('Documento é obrigatório');
  if (row.birthDate?.trim() && !parseDate(row.birthDate))
    errors.push('Data de nascimento inválida');
  return { valid: errors.length === 0, errors };
}

export function transformClientRow(row: Record<string, string>) {
  const firstName = (row.firstName ?? '').trim();
  const lastName = (row.lastName ?? '').trim();
  return {
    firstName,
    lastName,
    fullName: lastName ? `${firstName} ${lastName}` : firstName,
    document: (row.document ?? '').trim(),
    email: (row.email ?? '').trim(),
    phone: (row.phone ?? '').trim(),
    birthDate: row.birthDate?.trim() ? parseDate(row.birthDate) : null,
    address: {
      street: (row.street ?? '').trim(),
      number: (row.number ?? '').trim(),
      neighborhood: (row.neighborhood ?? '').trim(),
      city: (row.city ?? '').trim(),
      state: (row.state ?? '').trim().toUpperCase(),
      postalCode: (row.postalCode ?? '').trim(),
      country: 'Brasil',
    },
    active: true,
  };
}

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export const USER_COLUMNS = [
  'email', 'displayName', 'groupId', 'isRepresentante', 'phone', 'state',
] as const;

export const USER_COLUMN_LABELS: Record<string, string> = {
  email: 'Email',
  displayName: 'Nome completo',
  groupId: 'Grupo (admin/user)',
  isRepresentante: 'É representante? (sim/não)',
  phone: 'Telefone',
  state: 'UF',
};

export function validateUserRow(row: Record<string, string>): RowValidation {
  const errors: string[] = [];
  if (!row.email?.trim()) errors.push('Email é obrigatório');
  if (row.email?.trim() && !row.email.includes('@'))
    errors.push('Email inválido');
  return { valid: errors.length === 0, errors };
}

export function transformUserRow(row: Record<string, string>) {
  const isRep = ['sim', 'yes', 'true', '1', 'x']
    .includes((row.isRepresentante ?? '').trim().toLowerCase());
  return {
    user: {
      email: (row.email ?? '').trim().toLowerCase(),
      displayName: (row.displayName ?? '').trim(),
      groupId: (row.groupId ?? 'user').trim().toLowerCase(),
      isRepresentante: isRep,
    },
    profile: {
      fullName: (row.displayName ?? '').trim(),
      phone: (row.phone ?? '').trim(),
      state: (row.state ?? '').trim().toUpperCase(),
    },
  };
}

// ---------------------------------------------------------------------------
// Order
// ---------------------------------------------------------------------------

export const ORDER_COLUMNS = [
  'clientDocument', 'clientName', 'currency', 'amount', 'discount',
  'type', 'status', 'legalGuardian', 'doctorCrm', 'repEmail',
  'meioPagamento', 'lead', 'formaEnvio', 'lote',
  'codigoRastreio', 'dataEnvio', 'invoice',
] as const;

export const ORDER_COLUMN_LABELS: Record<string, string> = {
  clientDocument: 'CPF / Doc. cliente',
  clientName: 'Nome do cliente',
  currency: 'Moeda (BRL/USD)',
  amount: 'Valor total',
  discount: 'Desconto',
  type: 'Tipo (sale/return/exchange)',
  status: 'Status',
  legalGuardian: 'Responsável legal? (sim/não)',
  doctorCrm: 'CRM do médico',
  repEmail: 'Email do representante',
  meioPagamento: 'Meio de pagamento',
  lead: 'Lead (1ª compra / recompra)',
  formaEnvio: 'Forma de envio',
  lote: 'Lote',
  codigoRastreio: 'Código de rastreio',
  dataEnvio: 'Data de envio',
  invoice: 'Invoice',
};

const VALID_ORDER_TYPES = new Set(['sale', 'return', 'exchange', 'venda', 'retorno', 'troca']);
const VALID_ORDER_STATUSES = new Set([
  'pending', 'processing', 'awaiting_documents', 'documents_complete',
  'awaiting_payment', 'paid', 'shipped', 'delivered', 'cancelled',
]);

export function validateOrderRow(row: Record<string, string>): RowValidation {
  const errors: string[] = [];
  if (!row.clientDocument?.trim() && !row.clientName?.trim())
    errors.push('CPF do cliente ou Nome é obrigatório');
  if (!row.currency?.trim()) errors.push('Moeda é obrigatória');
  const amount = parseNumber(row.amount);
  if (!row.amount?.trim() || amount <= 0) errors.push('Valor deve ser maior que zero');
  if (row.type?.trim() && !VALID_ORDER_TYPES.has(row.type.trim().toLowerCase()))
    errors.push(`Tipo inválido: "${row.type}" (use sale, return ou exchange)`);
  if (row.status?.trim() && !VALID_ORDER_STATUSES.has(row.status.trim().toLowerCase()))
    errors.push(`Status inválido: "${row.status}"`);
  if (row.dataEnvio?.trim() && !parseDate(row.dataEnvio))
    errors.push('Data de envio inválida (use AAAA-MM-DD ou DD/MM/AAAA)');
  return { valid: errors.length === 0, errors };
}

/** Map localised type aliases → canonical OrderType values */
function normaliseOrderType(raw: string): string {
  const v = raw.trim().toLowerCase();
  if (v === 'venda') return 'sale';
  if (v === 'retorno') return 'return';
  if (v === 'troca') return 'exchange';
  return v || 'sale';
}

export function transformOrderRow(row: Record<string, string>) {
  const legalGuardian = ['sim', 'yes', 'true', '1', 'x']
    .includes((row.legalGuardian ?? '').trim().toLowerCase());
  const dataEnvio = row.dataEnvio?.trim() ? parseDate(row.dataEnvio) : null;

  return {
    // Core order fields
    currency:       (row.currency ?? 'BRL').trim().toUpperCase(),
    amount:         parseNumber(row.amount),
    discount:       parseNumber(row.discount),
    type:           normaliseOrderType(row.type ?? 'sale'),
    status:         (row.status ?? 'pending').trim().toLowerCase(),
    legalGuardian,
    invoice:        (row.invoice ?? '').trim(),
    documentsComplete: false,

    // Controle fields
    meioPagamento:  (row.meioPagamento ?? '').trim(),
    lead:           (row.lead ?? '').trim(),
    formaEnvio:     (row.formaEnvio ?? '').trim(),
    lote:           (row.lote ?? '').trim(),
    codigoRastreio: (row.codigoRastreio ?? '').trim(),
    dataEnvio:      dataEnvio ? dataEnvio.toISOString().split('T')[0] : '',

    // Lookup keys — used in the import page to resolve references
    _clientDocument: (row.clientDocument ?? '').trim(),
    _clientName:     (row.clientName ?? '').trim(),
    _doctorCrm:      (row.doctorCrm ?? '').trim(),
    _repEmail:       (row.repEmail ?? '').trim().toLowerCase(),
  };
}

// ---------------------------------------------------------------------------
// Entity type config
// ---------------------------------------------------------------------------

export type ImportEntityType = 'doctors' | 'clients' | 'users' | 'orders';

export const ENTITY_CONFIG: Record<ImportEntityType, {
  label: string;
  columns: readonly string[];
  columnLabels: Record<string, string>;
  validate: (row: Record<string, string>) => RowValidation;
}> = {
  doctors: {
    label: 'Médicos',
    columns: DOCTOR_COLUMNS,
    columnLabels: DOCTOR_COLUMN_LABELS,
    validate: validateDoctorRow,
  },
  clients: {
    label: 'Clientes',
    columns: CLIENT_COLUMNS,
    columnLabels: CLIENT_COLUMN_LABELS,
    validate: validateClientRow,
  },
  users: {
    label: 'Usuários',
    columns: USER_COLUMNS,
    columnLabels: USER_COLUMN_LABELS,
    validate: validateUserRow,
  },
  orders: {
    label: 'Pedidos',
    columns: ORDER_COLUMNS,
    columnLabels: ORDER_COLUMN_LABELS,
    validate: validateOrderRow,
  },
};
