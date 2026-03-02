import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/firebase/admin';

/**
 * ZapSign webhook — fires when a document event occurs (signed, refused, etc.)
 *
 * Payload shape:
 * {
 *   "event_action": "doc_signed" | "doc_refused" | "doc_viewed" | ...,
 *   "document": {
 *     "token": "<zapsignDocId>",
 *     "external_id": "<orderId>",   ← set by us when creating the document
 *     "status": "signed" | "pending" | "refused",
 *     ...
 *   }
 * }
 *
 * Configure the webhook URL in the ZapSign dashboard:
 *   https://app.entouragelab.com/api/webhooks/zapsign
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  console.log('[webhook/zapsign] Received:', JSON.stringify(body));

  // ── Parse payload ──────────────────────────────────────────────────────────

  const eventAction = String(body.event_action ?? '');
  const document = (body.document ?? {}) as Record<string, unknown>;
  const docToken = String(document.token ?? '');
  const orderId = String(document.external_id ?? '');   // set by us at creation
  const docStatus = String(document.status ?? '');

  // ── Filter to signing events only ──────────────────────────────────────────

  const isSigned =
    eventAction === 'doc_signed' ||
    docStatus === 'signed';

  if (!isSigned) {
    console.log(`[webhook/zapsign] Ignoring event: "${eventAction}" / status: "${docStatus}"`);
    return NextResponse.json({ received: true, processed: false });
  }

  if (!orderId) {
    console.warn('[webhook/zapsign] No external_id in payload — cannot identify order');
    return NextResponse.json({ received: true, processed: false });
  }

  // ── Load order ─────────────────────────────────────────────────────────────

  const orderRef = adminDb.collection('orders').doc(orderId);
  const orderSnap = await orderRef.get();

  if (!orderSnap.exists) {
    console.warn(`[webhook/zapsign] Order "${orderId}" not found in Firestore`);
    // Return 200 so ZapSign doesn't keep retrying for a genuinely missing order
    return NextResponse.json({ received: true, processed: false });
  }

  const orderData = orderSnap.data() ?? {};

  // ── Secondary verification: doc token must match what we stored ────────────
  // Prevents a spoofed payload from modifying the wrong order.

  if (docToken && orderData.zapsignDocId && docToken !== orderData.zapsignDocId) {
    console.warn(
      `[webhook/zapsign] Token mismatch for order "${orderId}":`,
      `expected "${orderData.zapsignDocId}", got "${docToken}"`,
    );
    return NextResponse.json({ error: 'Token mismatch' }, { status: 400 });
  }

  // ── Idempotency guard ──────────────────────────────────────────────────────

  if (orderData.zapsignStatus === 'signed') {
    console.log(`[webhook/zapsign] Order "${orderId}" already signed — skipping`);
    return NextResponse.json({ received: true, processed: false });
  }

  // ── Update order ───────────────────────────────────────────────────────────

  await orderRef.update({
    zapsignStatus: 'signed',
    updatedAt: FieldValue.serverTimestamp(),
  });

  console.log(`[webhook/zapsign] ✓ Order "${orderId}" marked as signed`);
  return NextResponse.json({ received: true, processed: true });
}
