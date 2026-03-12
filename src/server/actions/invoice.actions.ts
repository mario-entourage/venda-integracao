'use server';

import { adminDb } from '@/firebase/admin';

/**
 * Generate next invoice number in format "ETGANS#####"
 * where:
 *   E = Entourage
 *   T = (brand)
 *   G = GlobalPay
 *   A = Automated
 *   N = first letter of rep's first name (uppercase)
 *   S = first letter of rep's last name / surname (uppercase)
 *   ##### = zero-padded sequential counter (auto-expands beyond 99999)
 *
 * Example: rep "Mario Bonifacio" + counter 42 → "ETGAMB00042"
 */
export async function generateInvoiceNumber(
  repDisplayName: string,
): Promise<string> {
  // Parse initials from rep name
  const parts = repDisplayName.trim().split(/\s+/);
  const firstInitial = (parts[0]?.[0] || 'X').toUpperCase();
  const lastInitial = (parts[parts.length - 1]?.[0] || 'X').toUpperCase();

  // Atomic increment via transaction
  const counterRef = adminDb.collection('counters').doc('invoice');
  const result = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists ? (snap.data()?.nextValue || 1) : 1;
    tx.set(counterRef, { nextValue: current + 1 }, { merge: true });
    return current;
  });

  // Pad to at least 5 digits (auto-expands beyond 99999)
  const padded = String(result).padStart(5, '0');
  return `ETGA${firstInitial}${lastInitial}${padded}`;
}

/**
 * Generate next manual invoice number in format "ETGM#####"
 * Used for standalone payment links created outside of an order.
 * Uses a separate counter from order-based invoices.
 */
export async function generateManualInvoiceNumber(): Promise<string> {
  const counterRef = adminDb.collection('counters').doc('invoiceManual');
  const result = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists ? (snap.data()?.nextValue || 1) : 1;
    tx.set(counterRef, { nextValue: current + 1 }, { merge: true });
    return current;
  });

  const padded = String(result).padStart(5, '0');
  return `ETGM${padded}`;
}
