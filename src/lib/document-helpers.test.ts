/**
 * Tests — Document Helpers
 *
 * Covers: getPatientName, matchesSearch, getPrescriptionExpiry, markArchivedDocs
 *
 * These are the pure business logic functions behind the Documentos page's
 * search, archiving, and expiry badge features.
 */

import { describe, it, expect } from 'vitest';
import {
  getPatientName,
  matchesSearch,
  getPrescriptionExpiry,
  markArchivedDocs,
} from './document-helpers';

// ─── getPatientName ─────────────────────────────────────────────────────────

describe('getPatientName', () => {
  it('returns holder when present', () => {
    expect(getPatientName({ holder: 'João Silva', metadata: {} })).toBe('João Silva');
  });

  it('falls back to metadata.fullName when holder is empty', () => {
    expect(
      getPatientName({ holder: '', metadata: { fullName: 'Maria Santos' } }),
    ).toBe('Maria Santos');
  });

  it('returns default fallback when both are missing', () => {
    expect(getPatientName({ holder: '', metadata: {} })).toBe('(sem paciente)');
  });

  it('returns custom fallback when provided', () => {
    expect(getPatientName({ holder: '', metadata: {} }, 'Desconhecido')).toBe('Desconhecido');
  });

  it('prefers holder over metadata.fullName', () => {
    expect(
      getPatientName({ holder: 'Holder Name', metadata: { fullName: 'Meta Name' } }),
    ).toBe('Holder Name');
  });

  it('handles undefined metadata gracefully', () => {
    expect(getPatientName({ holder: '', metadata: undefined as any })).toBe('(sem paciente)');
  });

  it('handles null metadata.fullName', () => {
    expect(getPatientName({ holder: '', metadata: { fullName: null } })).toBe('(sem paciente)');
  });
});

// ─── matchesSearch ──────────────────────────────────────────────────────────

describe('matchesSearch', () => {
  const doc = {
    holder: 'João Silva',
    metadata: { fullName: 'João Carlos Silva' },
    number: 'RX-2025-001',
    key: 'prescription_joao_silva.pdf',
  };

  it('returns true when searchTerm is empty', () => {
    expect(matchesSearch(doc, '')).toBe(true);
  });

  it('matches holder (case-insensitive)', () => {
    expect(matchesSearch(doc, 'joao')).toBe(true);
    expect(matchesSearch(doc, 'SILVA')).toBe(true);
  });

  it('matches metadata.fullName', () => {
    expect(matchesSearch(doc, 'Carlos')).toBe(true);
  });

  it('matches number field', () => {
    expect(matchesSearch(doc, 'RX-2025')).toBe(true);
    expect(matchesSearch(doc, 'rx-2025')).toBe(true);
  });

  it('matches key field', () => {
    expect(matchesSearch(doc, 'prescription_joao')).toBe(true);
  });

  it('returns false when no field matches', () => {
    expect(matchesSearch(doc, 'Fernanda')).toBe(false);
  });

  it('handles partial matches (substring)', () => {
    expect(matchesSearch(doc, 'oão')).toBe(true);
  });

  it('handles doc with missing optional fields', () => {
    const sparse = { holder: '', metadata: {}, number: '', key: '' };
    expect(matchesSearch(sparse, 'anything')).toBe(false);
  });

  it('handles doc where metadata.fullName is undefined', () => {
    const noMeta = { holder: 'Test', metadata: {}, number: '', key: '' };
    expect(matchesSearch(noMeta, 'Test')).toBe(true);
    expect(matchesSearch(noMeta, 'nope')).toBe(false);
  });
});

// ─── getPrescriptionExpiry ──────────────────────────────────────────────────

describe('getPrescriptionExpiry', () => {
  // Use a fixed "now" for deterministic tests: 2026-03-31
  const now = new Date('2026-03-31T12:00:00Z');

  it('returns null when prescriptionDate is undefined', () => {
    expect(getPrescriptionExpiry(undefined, now)).toBeNull();
  });

  it('returns null when prescriptionDate is null', () => {
    expect(getPrescriptionExpiry(null, now)).toBeNull();
  });

  it('returns null when prescriptionDate is invalid', () => {
    expect(getPrescriptionExpiry('not-a-date', now)).toBeNull();
  });

  it('returns "valid" for a prescription from 2 months ago', () => {
    // 2026-01-31 → ~59 days ago → valid
    expect(getPrescriptionExpiry('2026-01-31', now)).toBe('valid');
  });

  it('returns "valid" for a prescription from 4 months ago', () => {
    // 2025-11-30 → ~121 days ago → valid (under 152)
    expect(getPrescriptionExpiry('2025-11-30', now)).toBe('valid');
  });

  it('returns "expiring" for a prescription from ~5.5 months ago', () => {
    // 2025-10-15 → ~167 days ago → between 152 and 183 → expiring
    expect(getPrescriptionExpiry('2025-10-15', now)).toBe('expiring');
  });

  it('returns "expired" for a prescription from 7 months ago', () => {
    // 2025-08-31 → ~212 days ago → expired
    expect(getPrescriptionExpiry('2025-08-31', now)).toBe('expired');
  });

  it('returns "expired" for a prescription from over a year ago', () => {
    expect(getPrescriptionExpiry('2025-01-01', now)).toBe('expired');
  });

  it('returns "valid" for a prescription from yesterday', () => {
    expect(getPrescriptionExpiry('2026-03-30', now)).toBe('valid');
  });

  it('returns "valid" for a prescription from today', () => {
    expect(getPrescriptionExpiry('2026-03-31', now)).toBe('valid');
  });

  // Boundary tests — the thresholds are 152 and 183 days
  // Boundary tests — use midnight "now" to avoid time-of-day offset issues
  const midnight = new Date('2026-03-31T00:00:00Z');

  it('returns "valid" at exactly 152 days', () => {
    // 152 days before midnight 2026-03-31 = 2025-10-30
    expect(getPrescriptionExpiry('2025-10-30', midnight)).toBe('valid');
  });

  it('returns "expiring" at 153 days', () => {
    // 153 days before midnight 2026-03-31 = 2025-10-29
    expect(getPrescriptionExpiry('2025-10-29', midnight)).toBe('expiring');
  });

  it('returns "expiring" at exactly 183 days', () => {
    // 183 days before midnight 2026-03-31 = 2025-09-29
    expect(getPrescriptionExpiry('2025-09-29', midnight)).toBe('expiring');
  });

  it('returns "expired" at 184 days', () => {
    // 184 days before midnight 2026-03-31 = 2025-09-28
    expect(getPrescriptionExpiry('2025-09-28', midnight)).toBe('expired');
  });
});

// ─── markArchivedDocs ───────────────────────────────────────────────────────

describe('markArchivedDocs', () => {
  it('marks nothing as archived when there are no prescriptions', () => {
    const docs = [
      { type: 'identity', createdAt: { seconds: 1000 } },
      { type: 'medical_report', createdAt: { seconds: 2000 } },
    ];
    const result = markArchivedDocs(docs);
    expect(result.every((d) => d.archived === false)).toBe(true);
  });

  it('marks nothing as archived when there is only one prescription', () => {
    const docs = [
      { type: 'prescription', prescriptionDate: '2025-06-01', createdAt: { seconds: 1000 } },
      { type: 'identity', createdAt: { seconds: 2000 } },
    ];
    const result = markArchivedDocs(docs);
    expect(result.every((d) => d.archived === false)).toBe(true);
  });

  it('archives older prescriptions when multiple exist', () => {
    const docs = [
      { type: 'prescription', prescriptionDate: '2025-06-01', createdAt: { seconds: 1000 } },
      { type: 'prescription', prescriptionDate: '2025-09-15', createdAt: { seconds: 2000 } },
      { type: 'identity', createdAt: { seconds: 3000 } },
    ];
    const result = markArchivedDocs(docs);
    // Older prescription (2025-06-01) should be archived
    expect(result[0].archived).toBe(true);
    // Newer prescription (2025-09-15) should NOT be archived
    expect(result[1].archived).toBe(false);
    // Identity doc should NOT be archived
    expect(result[2].archived).toBe(false);
  });

  it('falls back to createdAt when prescriptionDate is missing', () => {
    const docs = [
      { type: 'prescription', createdAt: { seconds: 1000 } },
      { type: 'prescription', createdAt: { seconds: 5000 } },
    ];
    const result = markArchivedDocs(docs);
    // Older by createdAt → archived
    expect(result[0].archived).toBe(true);
    // Newer by createdAt → active
    expect(result[1].archived).toBe(false);
  });

  it('handles 3+ prescriptions — only newest stays active', () => {
    const docs = [
      { type: 'prescription', prescriptionDate: '2025-01-01', createdAt: { seconds: 100 } },
      { type: 'prescription', prescriptionDate: '2025-06-01', createdAt: { seconds: 200 } },
      { type: 'prescription', prescriptionDate: '2025-09-01', createdAt: { seconds: 300 } },
    ];
    const result = markArchivedDocs(docs);
    expect(result[0].archived).toBe(true);  // Jan
    expect(result[1].archived).toBe(true);  // Jun
    expect(result[2].archived).toBe(false); // Sep (newest)
  });

  it('never archives non-prescription types', () => {
    const docs = [
      { type: 'identity', createdAt: { seconds: 100 } },
      { type: 'prescription', prescriptionDate: '2025-06-01', createdAt: { seconds: 200 } },
      { type: 'prescription', prescriptionDate: '2025-09-01', createdAt: { seconds: 300 } },
      { type: 'medical_report', createdAt: { seconds: 400 } },
    ];
    const result = markArchivedDocs(docs);
    expect(result[0].archived).toBe(false); // identity
    expect(result[1].archived).toBe(true);  // older prescription
    expect(result[2].archived).toBe(false); // newer prescription
    expect(result[3].archived).toBe(false); // medical_report
  });

  it('preserves original doc properties', () => {
    const docs = [
      { type: 'prescription', prescriptionDate: '2025-01-01', createdAt: { seconds: 100 }, holder: 'João' },
      { type: 'prescription', prescriptionDate: '2025-09-01', createdAt: { seconds: 200 }, holder: 'João' },
    ];
    const result = markArchivedDocs(docs as any);
    expect(result[0].holder).toBe('João');
    expect(result[1].holder).toBe('João');
  });

  it('handles empty array', () => {
    const result = markArchivedDocs([]);
    expect(result).toEqual([]);
  });

  it('handles prescriptions with same date — first wins by index', () => {
    const docs = [
      { type: 'prescription', prescriptionDate: '2025-06-01', createdAt: { seconds: 100 } },
      { type: 'prescription', prescriptionDate: '2025-06-01', createdAt: { seconds: 100 } },
    ];
    const result = markArchivedDocs(docs);
    // When tied, first one found with highest time wins (both equal → index 0 stays)
    const activeCount = result.filter((d) => !d.archived).length;
    const archivedCount = result.filter((d) => d.archived).length;
    // Exactly one should be active
    expect(activeCount).toBe(1);
    expect(archivedCount).toBe(1);
  });
});
