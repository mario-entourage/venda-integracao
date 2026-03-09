'use server';

import { adminDb } from '@/firebase/admin';

/**
 * Generate next invoice number in format "ETGA NS #####"
 * where:
 *   E = Entourage
 *   T = (brand)
 *   G = GlobalPay
 *   A = Automated
 *   N = first letter of rep's first name
 *   S = first letter of rep's last name (surname)
 *   ##### = zero-padded sequential counter (auto-expands beyond 99999)
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
  return `ETGA ${firstInitial}${lastInitial} ${padded}`;
}
