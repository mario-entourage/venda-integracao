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
// Entity type config
// ---------------------------------------------------------------------------

export type ImportEntityType = 'doctors' | 'clients' | 'users';

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
};
