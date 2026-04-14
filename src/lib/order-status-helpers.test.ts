/**
 * QA Tests — Order Status Helpers
 *
 * These tests verify the core business logic that determines:
 *   1. Whether an order is "ready to ship" (isReadyToShip)
 *   2. What granular status/missing items to display (getGranularStatus)
 *
 * This is the most critical business logic in the platform — it drives
 * the entire Pedidos UI (which actions to show, how orders are highlighted,
 * what status badges appear).
 */

import { describe, it, expect } from 'vitest';
import { OrderStatus, AnvisaOption, OrderType } from '@/types/enums';
import {
  isReadyToShip,
  getGranularStatus,
  IN_PROGRESS_STATUSES,
  BASE_LABELS,
  EXTENDED_STATUS_CONFIG,
} from './order-status-helpers';
import type { Order } from '@/types/order';
import { Timestamp } from 'firebase/firestore';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Create a minimal valid Order for testing. Override any fields as needed. */
function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'test-order-001',
    status: OrderStatus.PENDING,
    invoice: 'INV-001',
    legalGuardian: false,
    currency: 'BRL',
    amount: 1000,
    discount: 0,
    type: OrderType.SALE,
    documentsComplete: false,
    createdById: 'user-001',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...overrides,
  };
}

// ─── isReadyToShip ──────────────────────────────────────────────────────────

describe('isReadyToShip', () => {
  it('returns false for a brand new pending order', () => {
    const order = makeOrder({ status: OrderStatus.PENDING });
    expect(isReadyToShip(order)).toBe(false);
  });

  it('returns false when status is not "paid"', () => {
    const order = makeOrder({
      status: OrderStatus.AWAITING_PAYMENT,
      documentsComplete: true,
      anvisaOption: AnvisaOption.EXEMPT,
    });
    expect(isReadyToShip(order)).toBe(false);
  });

  it('returns false when documents are not complete', () => {
    const order = makeOrder({
      status: OrderStatus.PAID,
      documentsComplete: false,
      anvisaOption: AnvisaOption.EXEMPT,
    });
    expect(isReadyToShip(order)).toBe(false);
  });

  it('returns false when ANVISA is required but not concluded', () => {
    const order = makeOrder({
      status: OrderStatus.PAID,
      documentsComplete: true,
      anvisaOption: AnvisaOption.REGULAR,
      anvisaStatus: 'PENDENTE',
    });
    expect(isReadyToShip(order)).toBe(false);
  });

  it('returns false when ANVISA is regular and status is undefined', () => {
    const order = makeOrder({
      status: OrderStatus.PAID,
      documentsComplete: true,
      anvisaOption: AnvisaOption.REGULAR,
    });
    expect(isReadyToShip(order)).toBe(false);
  });

  it('returns true when ANVISA is exempt', () => {
    const order = makeOrder({
      status: OrderStatus.PAID,
      documentsComplete: true,
      anvisaOption: AnvisaOption.EXEMPT,
    });
    expect(isReadyToShip(order)).toBe(true);
  });

  it('returns true when ANVISA is CONCLUIDO (uppercase)', () => {
    const order = makeOrder({
      status: OrderStatus.PAID,
      documentsComplete: true,
      anvisaOption: AnvisaOption.REGULAR,
      anvisaStatus: 'CONCLUIDO',
    });
    expect(isReadyToShip(order)).toBe(true);
  });

  it('returns true when ANVISA is concluido (lowercase)', () => {
    const order = makeOrder({
      status: OrderStatus.PAID,
      documentsComplete: true,
      anvisaOption: AnvisaOption.REGULAR,
      anvisaStatus: 'concluido',
    });
    expect(isReadyToShip(order)).toBe(true);
  });

  it('returns false when Procuracao exists but is not signed', () => {
    const order = makeOrder({
      status: OrderStatus.PAID,
      documentsComplete: true,
      anvisaOption: AnvisaOption.EXEMPT,
      zapsignDocId: 'doc-token-123',
      zapsignStatus: 'pending',
    });
    expect(isReadyToShip(order)).toBe(false);
  });

  it('returns true when Procuracao exists and IS signed', () => {
    const order = makeOrder({
      status: OrderStatus.PAID,
      documentsComplete: true,
      anvisaOption: AnvisaOption.EXEMPT,
      zapsignDocId: 'doc-token-123',
      zapsignStatus: 'signed',
    });
    expect(isReadyToShip(order)).toBe(true);
  });

  it('returns false when Comprovante de Vinculo exists but is not signed', () => {
    const order = makeOrder({
      status: OrderStatus.PAID,
      documentsComplete: true,
      anvisaOption: AnvisaOption.EXEMPT,
      zapsignCvDocId: 'cv-token-456',
      zapsignCvStatus: 'pending',
    });
    expect(isReadyToShip(order)).toBe(false);
  });

  it('returns true when Comprovante de Vinculo exists and IS signed', () => {
    const order = makeOrder({
      status: OrderStatus.PAID,
      documentsComplete: true,
      anvisaOption: AnvisaOption.EXEMPT,
      zapsignCvDocId: 'cv-token-456',
      zapsignCvStatus: 'signed',
    });
    expect(isReadyToShip(order)).toBe(true);
  });

  it('returns false when BOTH ZapSign docs exist but only one is signed', () => {
    const order = makeOrder({
      status: OrderStatus.PAID,
      documentsComplete: true,
      anvisaOption: AnvisaOption.EXEMPT,
      zapsignDocId: 'doc-token-123',
      zapsignStatus: 'signed',
      zapsignCvDocId: 'cv-token-456',
      zapsignCvStatus: 'pending',
    });
    expect(isReadyToShip(order)).toBe(false);
  });

  it('returns true when BOTH ZapSign docs exist and both are signed', () => {
    const order = makeOrder({
      status: OrderStatus.PAID,
      documentsComplete: true,
      anvisaOption: AnvisaOption.EXEMPT,
      zapsignDocId: 'doc-token-123',
      zapsignStatus: 'signed',
      zapsignCvDocId: 'cv-token-456',
      zapsignCvStatus: 'signed',
    });
    expect(isReadyToShip(order)).toBe(true);
  });

  it('returns true when no ZapSign docs were created (no zapsignDocId)', () => {
    const order = makeOrder({
      status: OrderStatus.PAID,
      documentsComplete: true,
      anvisaOption: AnvisaOption.EXEMPT,
      // No zapsignDocId, no zapsignCvDocId
    });
    expect(isReadyToShip(order)).toBe(true);
  });

  it('handles the "golden path" — paid, docs complete, ANVISA done, both signed', () => {
    const order = makeOrder({
      status: OrderStatus.PAID,
      documentsComplete: true,
      anvisaOption: AnvisaOption.REGULAR,
      anvisaStatus: 'CONCLUIDO',
      zapsignDocId: 'proc-token',
      zapsignStatus: 'signed',
      zapsignCvDocId: 'cv-token',
      zapsignCvStatus: 'signed',
    });
    expect(isReadyToShip(order)).toBe(true);
  });
});

// ─── getGranularStatus ──────────────────────────────────────────────────────

describe('getGranularStatus', () => {
  describe('terminal statuses', () => {
    it('returns base label for shipped orders', () => {
      const order = makeOrder({ status: OrderStatus.SHIPPED });
      const result = getGranularStatus(order);
      expect(result.configKey).toBe('shipped');
      expect(result.label).toBe('Enviado');
      expect(result.missing).toEqual([]);
    });

    it('returns base label for delivered orders', () => {
      const order = makeOrder({ status: OrderStatus.DELIVERED });
      const result = getGranularStatus(order);
      expect(result.configKey).toBe('delivered');
      expect(result.label).toBe('Entregue');
      expect(result.missing).toEqual([]);
    });

    it('returns base label for cancelled orders', () => {
      const order = makeOrder({ status: OrderStatus.CANCELLED });
      const result = getGranularStatus(order);
      expect(result.configKey).toBe('cancelled');
      expect(result.label).toBe('Cancelado');
      expect(result.missing).toEqual([]);
    });
  });

  describe('missing items detection', () => {
    it('detects missing payment for unpaid orders', () => {
      const order = makeOrder({
        status: OrderStatus.PENDING,
        documentsComplete: true,
        anvisaOption: AnvisaOption.EXEMPT,
      });
      const result = getGranularStatus(order);
      expect(result.missing).toContain('Pagamento');
    });

    it('does NOT flag payment as missing when status is "paid"', () => {
      const order = makeOrder({
        status: OrderStatus.PAID,
        documentsComplete: true,
        anvisaOption: AnvisaOption.EXEMPT,
      });
      const result = getGranularStatus(order);
      expect(result.missing).not.toContain('Pagamento');
    });

    it('detects missing documents', () => {
      const order = makeOrder({
        status: OrderStatus.PAID,
        documentsComplete: false,
        anvisaOption: AnvisaOption.EXEMPT,
      });
      const result = getGranularStatus(order);
      expect(result.missing).toContain('Documentos');
    });

    it('does NOT flag documents when documentsComplete is true', () => {
      const order = makeOrder({
        status: OrderStatus.PAID,
        documentsComplete: true,
        anvisaOption: AnvisaOption.EXEMPT,
      });
      const result = getGranularStatus(order);
      expect(result.missing).not.toContain('Documentos');
    });

    it('detects missing ANVISA for regular orders without conclusion', () => {
      const order = makeOrder({
        status: OrderStatus.PAID,
        documentsComplete: true,
        anvisaOption: AnvisaOption.REGULAR,
      });
      const result = getGranularStatus(order);
      expect(result.missing).toContain('ANVISA');
    });

    it('shows "ANVISA (em andamento)" when request exists but not concluded', () => {
      const order = makeOrder({
        status: OrderStatus.PAID,
        documentsComplete: true,
        anvisaOption: AnvisaOption.REGULAR,
        anvisaRequestId: 'req-123',
        anvisaStatus: 'EM_AJUSTE',
      });
      const result = getGranularStatus(order);
      expect(result.missing).toContain('ANVISA (em andamento)');
      expect(result.missing).not.toContain('ANVISA');
    });

    it('does NOT flag ANVISA when option is exempt', () => {
      const order = makeOrder({
        status: OrderStatus.PAID,
        documentsComplete: true,
        anvisaOption: AnvisaOption.EXEMPT,
      });
      const result = getGranularStatus(order);
      expect(result.missing.some((m) => m.includes('ANVISA'))).toBe(false);
    });

    it('does NOT flag ANVISA when status is CONCLUIDO', () => {
      const order = makeOrder({
        status: OrderStatus.PAID,
        documentsComplete: true,
        anvisaOption: AnvisaOption.REGULAR,
        anvisaStatus: 'CONCLUIDO',
      });
      const result = getGranularStatus(order);
      expect(result.missing.some((m) => m.includes('ANVISA'))).toBe(false);
    });

    it('detects missing Procuracao signature', () => {
      const order = makeOrder({
        status: OrderStatus.PAID,
        documentsComplete: true,
        anvisaOption: AnvisaOption.EXEMPT,
        zapsignDocId: 'doc-token',
        zapsignStatus: 'pending',
      });
      const result = getGranularStatus(order);
      expect(result.missing).toContain('Procuracao (assinatura)');
    });

    it('does NOT flag Procuracao when it is signed', () => {
      const order = makeOrder({
        status: OrderStatus.PAID,
        documentsComplete: true,
        anvisaOption: AnvisaOption.EXEMPT,
        zapsignDocId: 'doc-token',
        zapsignStatus: 'signed',
      });
      const result = getGranularStatus(order);
      expect(result.missing).not.toContain('Procuracao (assinatura)');
    });

    it('does NOT flag Procuracao when no ZapSign doc was created', () => {
      const order = makeOrder({
        status: OrderStatus.PAID,
        documentsComplete: true,
        anvisaOption: AnvisaOption.EXEMPT,
      });
      const result = getGranularStatus(order);
      expect(result.missing).not.toContain('Procuracao (assinatura)');
    });

    it('detects missing Comprovante de Vinculo signature', () => {
      const order = makeOrder({
        status: OrderStatus.PAID,
        documentsComplete: true,
        anvisaOption: AnvisaOption.EXEMPT,
        zapsignCvDocId: 'cv-token',
        zapsignCvStatus: 'pending',
      });
      const result = getGranularStatus(order);
      expect(result.missing).toContain('Comprovante');
    });
  });

  describe('combined missing items', () => {
    it('shows all missing items in a brand-new order', () => {
      const order = makeOrder({
        status: OrderStatus.PENDING,
        documentsComplete: false,
        anvisaOption: AnvisaOption.REGULAR,
        zapsignDocId: 'proc-tok',
        zapsignStatus: 'pending',
        zapsignCvDocId: 'cv-tok',
        zapsignCvStatus: 'pending',
      });
      const result = getGranularStatus(order);
      expect(result.configKey).toBe('falta');
      expect(result.missing).toContain('Pagamento');
      expect(result.missing).toContain('Documentos');
      expect(result.missing).toContain('ANVISA');
      expect(result.missing).toContain('Procuracao (assinatura)');
      expect(result.missing).toContain('Comprovante');
      expect(result.label).toContain('Falta');
    });

    it('returns base label when nothing is missing (fully resolved paid order)', () => {
      const order = makeOrder({
        status: OrderStatus.PAID,
        documentsComplete: true,
        anvisaOption: AnvisaOption.EXEMPT,
      });
      const result = getGranularStatus(order);
      expect(result.configKey).toBe('paid');
      expect(result.label).toBe('Pago');
      expect(result.missing).toEqual([]);
    });

    it('returns "falta" configKey when items are missing', () => {
      const order = makeOrder({
        status: OrderStatus.PENDING,
        documentsComplete: false,
      });
      const result = getGranularStatus(order);
      expect(result.configKey).toBe('falta');
    });

    it('joins multiple missing items with " + "', () => {
      const order = makeOrder({
        status: OrderStatus.PENDING,
        documentsComplete: false,
        anvisaOption: AnvisaOption.REGULAR,
      });
      const result = getGranularStatus(order);
      expect(result.label).toBe('Falta Pagamento + Documentos + ANVISA');
    });
  });
});

// ─── Constants & Config ─────────────────────────────────────────────────────

describe('constants and config', () => {
  it('IN_PROGRESS_STATUSES includes exactly the 6 non-terminal statuses', () => {
    expect(IN_PROGRESS_STATUSES).toHaveLength(6);
    expect(IN_PROGRESS_STATUSES).toContain(OrderStatus.PENDING);
    expect(IN_PROGRESS_STATUSES).toContain(OrderStatus.PROCESSING);
    expect(IN_PROGRESS_STATUSES).toContain(OrderStatus.AWAITING_DOCUMENTS);
    expect(IN_PROGRESS_STATUSES).toContain(OrderStatus.DOCUMENTS_COMPLETE);
    expect(IN_PROGRESS_STATUSES).toContain(OrderStatus.AWAITING_PAYMENT);
    expect(IN_PROGRESS_STATUSES).toContain(OrderStatus.PAID);
    // Should NOT include terminal statuses
    expect(IN_PROGRESS_STATUSES).not.toContain(OrderStatus.SHIPPED);
    expect(IN_PROGRESS_STATUSES).not.toContain(OrderStatus.DELIVERED);
    expect(IN_PROGRESS_STATUSES).not.toContain(OrderStatus.CANCELLED);
  });

  it('BASE_LABELS has entries for all OrderStatus values', () => {
    const allStatuses = Object.values(OrderStatus);
    for (const s of allStatuses) {
      expect(BASE_LABELS[s]).toBeDefined();
      expect(typeof BASE_LABELS[s]).toBe('string');
    }
  });

  it('EXTENDED_STATUS_CONFIG includes the "falta" and "pronto" keys', () => {
    expect(EXTENDED_STATUS_CONFIG.falta).toBeDefined();
    expect(EXTENDED_STATUS_CONFIG.pronto).toBeDefined();
  });

  it('all EXTENDED_STATUS_CONFIG entries have label and className', () => {
    for (const [key, value] of Object.entries(EXTENDED_STATUS_CONFIG)) {
      expect(value.label).toBeDefined();
      expect(value.className).toBeDefined();
      expect(typeof value.label).toBe('string');
      expect(typeof value.className).toBe('string');
    }
  });
});
