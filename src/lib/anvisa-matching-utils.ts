/**
 * Fuzzy matching utilities for comparing ANVISA OCR data
 * with VENDA's client/doctor database records.
 */

import type { Client, ClientAddress } from '@/types/client';
import type { Doctor } from '@/types/doctor';
import type { OcrData } from '@/types/anvisa';

// ─── String normalization & matching ────────────────────────────────────────

/** Lowercase, remove accents, collapse whitespace */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Fuzzy name comparison — normalized substring both ways */
export function nameMatches(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb || na.length < 3 || nb.length < 3) return false;
  return na.includes(nb) || nb.includes(na);
}

/** CRM matching — compare digits only */
export function crmMatches(a: string, b: string): boolean {
  const da = a.replace(/\D/g, '');
  const db = b.replace(/\D/g, '');
  return da.length > 0 && db.length > 0 && da === db;
}

// ─── Name splitting ─────────────────────────────────────────────────────────

/** Split a full name into firstName + lastName */
export function splitFullName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 1) {
    return { firstName: parts[0] || '', lastName: '' };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

// ─── Date format conversion ─────────────────────────────────────────────────

/** Convert DD/MM/YYYY (Anvisa) → YYYY-MM-DD (VENDA) */
export function anvisaDateToSalesDate(ddmmyyyy: string): string {
  const parts = ddmmyyyy.split('/');
  if (parts.length !== 3) return '';
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

/** Convert YYYY-MM-DD (VENDA) → DD/MM/YYYY (Anvisa) */
export function salesDateToAnvisaDate(yyyymmdd: string): string {
  const parts = yyyymmdd.split('-');
  if (parts.length !== 3) return '';
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// ─── Address parsing ────────────────────────────────────────────────────────

/** Best-effort parse of a full address string into street + number */
function parseAddress(address: string): { street: string; number: string; complement: string } {
  const commaMatch = address.match(/^(.+?),\s*(\d+)\s*(?:,\s*(.+))?$/);
  if (commaMatch) {
    return {
      street: commaMatch[1].trim(),
      number: commaMatch[2],
      complement: commaMatch[3]?.trim() || '',
    };
  }

  const nMatch = address.match(/^(.+?)\s+n[º°.]?\s*(\d+)\s*(?:,?\s*(.+))?$/i);
  if (nMatch) {
    return {
      street: nMatch[1].trim(),
      number: nMatch[2],
      complement: nMatch[3]?.trim() || '',
    };
  }

  return { street: address, number: '', complement: '' };
}

// ─── Field mapping: VENDA Client/Doctor → ANVISA OcrData ────────────────────

/** Convert a VENDA Client to partial ANVISA OcrData */
export function clientToOcrData(client: Client): Partial<OcrData> {
  const data: Partial<OcrData> = {};

  if (client.fullName) data.patientName = client.fullName;
  if (client.document) data.patientCpf = client.document;
  if (client.rg) data.patientRg = client.rg;
  if (client.email) data.patientEmail = client.email;
  if (client.phone) data.patientPhone = client.phone;

  // Birth date: Firestore Timestamp → DD/MM/YYYY
  if (client.birthDate) {
    try {
      const d = (client.birthDate as Record<string, unknown>).toDate && typeof (client.birthDate as Record<string, unknown>).toDate === 'function'
        ? ((client.birthDate as Record<string, unknown>).toDate as () => Date)()
        : new Date(client.birthDate as string | number | Date);
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      data.patientDob = `${dd}/${mm}/${yyyy}`;
    } catch {
      /* skip if not parseable */
    }
  }

  // Address
  if (client.address) {
    if (client.address.postalCode) data.patientCep = client.address.postalCode;
    if (client.address.city) data.patientCity = client.address.city;
    if (client.address.state) data.patientState = client.address.state;

    const parts = [client.address.street, client.address.number, client.address.complement].filter(
      Boolean,
    );
    if (parts.length > 0) data.patientAddress = parts.join(', ');
  }

  return data;
}

/** Convert a VENDA Doctor to partial ANVISA OcrData */
export function doctorToOcrData(doctor: Doctor): Partial<OcrData> {
  const data: Partial<OcrData> = {};

  if (doctor.fullName) data.doctorName = doctor.fullName;
  if (doctor.crm) data.doctorCrm = doctor.crm;
  if (doctor.mainSpecialty) data.doctorSpecialty = doctor.mainSpecialty;
  if (doctor.state) data.doctorUf = doctor.state;
  if (doctor.city) data.doctorCity = doctor.city;
  if (doctor.phone) data.doctorPhone = doctor.phone;
  if (doctor.mobilePhone) data.doctorMobile = doctor.mobilePhone;
  if (doctor.email) data.doctorEmail = doctor.email;

  return data;
}

// ─── Field mapping: ANVISA OcrData → VENDA entities ─────────────────────────

/** Build a partial client from ANVISA OCR data for creation */
export function ocrDataToNewClient(
  ocr: Partial<OcrData>,
): Omit<Client, 'id' | 'createdAt' | 'updatedAt' | 'removedAt'> {
  const { firstName, lastName } = splitFullName(ocr.patientName || '');
  const addr = parseAddress(ocr.patientAddress || '');

  let birthDate: Date | undefined = undefined;
  if (ocr.patientDob) {
    const salesDate = anvisaDateToSalesDate(ocr.patientDob);
    if (salesDate) {
      birthDate = new Date(salesDate + 'T00:00:00');
    }
  }

  const address: ClientAddress = {
    postalCode: ocr.patientCep || '',
    street: addr.street,
    number: addr.number,
    complement: addr.complement,
    neighborhood: '',
    city: ocr.patientCity || '',
    state: ocr.patientState || '',
    country: 'Brasil',
  };

  return {
    firstName,
    lastName: lastName || undefined,
    fullName: ocr.patientName || '',
    document: ocr.patientCpf || '',
    rg: ocr.patientRg || undefined,
    email: ocr.patientEmail || undefined,
    phone: ocr.patientPhone || undefined,
    birthDate,
    address,
    active: true,
  };
}

/** Build a partial doctor from ANVISA OCR data for creation */
export function ocrDataToNewDoctor(
  ocr: Partial<OcrData>,
): Omit<Doctor, 'id' | 'createdAt' | 'updatedAt' | 'removedAt'> {
  const { firstName, lastName } = splitFullName(ocr.doctorName || '');

  return {
    firstName,
    lastName: lastName || undefined,
    fullName: ocr.doctorName || '',
    crm: ocr.doctorCrm || '',
    mainSpecialty: ocr.doctorSpecialty || undefined,
    state: ocr.doctorUf || undefined,
    city: ocr.doctorCity || undefined,
    phone: ocr.doctorPhone || undefined,
    mobilePhone: ocr.doctorMobile || undefined,
    email: ocr.doctorEmail || undefined,
    active: true,
  };
}
