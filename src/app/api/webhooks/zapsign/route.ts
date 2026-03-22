import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
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
 *
 * Webhook authentication: set ZAPSIGN_WEBHOOK_TOKEN in env vars and configure
 * the same value in ZapSign's dashboard. It will be sent as the
 * `X-ZapSign-Token` header on each request. If the env var is not set,
 * the check is skipped (graceful degradation).
 */

const PayloadSchema = z.object({
  event_action: z.string().optional(),
  document: z.object({
    token: z.string().optional(),
    external_id: z.string().optional(),
    status: z.string().optional(),
  }).passthrough().optional(),
}).passthrough();

export async function POST(request: NextRequest) {
  // ── Webhook secret verification (optional, enabled when env var is set) ────
  const expectedToken = process.env.ZAPSIGN_WEBHOOK_TOKEN;
  if (expectedToken) {
    const receivedToken = request.headers.get('x-zapsign-token') ?? '';
    if (receivedToken !== expectedToken) {
      console.warn('[webhook/zapsign] Invalid webhook token — request rejected');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } else {
    console.warn('[webhook/zapsign] ZAPSIGN_WEBHOOK_TOKEN not set — signature check disabled');
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = PayloadSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn('[webhook/zapsign] Payload validation failed:', parsed.error.flatten());
    return NextResponse.json({ error: 'Invalid payload' }, { status: 422 });
  }

  const payload = parsed.data;
  console.log('[webhook/zapsign] Received:', JSON.stringify(payload));

  // ── Parse payload ──────────────────────────────────────────────────────────

  const eventAction = String(payload.event_action ?? '');
  const document = payload.document ?? {};
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

  // ── Identify which document was signed ──────────────────────────────────────
  // Match the webhook token against our stored Procuração or CV document IDs.

  const isProcuracao = docToken && docToken === orderData.zapsignDocId;
  const isCv = docToken && docToken === orderData.zapsignCvDocId;

  if (docToken && !isProcuracao && !isCv) {
    console.warn(
      `[webhook/zapsign] Token mismatch for order "${orderId}":`,
      `docToken "${docToken}" does not match zapsignDocId "${orderData.zapsignDocId}" or zapsignCvDocId "${orderData.zapsignCvDocId}"`,
    );
    return NextResponse.json({ error: 'Token mismatch' }, { status: 400 });
  }

  // ── Idempotency guard ──────────────────────────────────────────────────────

  if (isProcuracao && orderData.zapsignStatus === 'signed') {
    console.log(`[webhook/zapsign] Order "${orderId}" procuracao already signed — skipping`);
    return NextResponse.json({ received: true, processed: false });
  }

  if (isCv && orderData.zapsignCvStatus === 'signed') {
    console.log(`[webhook/zapsign] Order "${orderId}" CV already signed — skipping`);
    return NextResponse.json({ received: true, processed: false });
  }

  // ── Update order ───────────────────────────────────────────────────────────

  if (isCv) {
    await orderRef.update({
      zapsignCvStatus: 'signed',
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log(`[webhook/zapsign] ✓ Order "${orderId}" CV marked as signed`);
  } else {
    // Default to procuração (backwards-compatible)
    await orderRef.update({
      zapsignStatus: 'signed',
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log(`[webhook/zapsign] ✓ Order "${orderId}" procuracao marked as signed`);
  }

  return NextResponse.json({ received: true, processed: true });
}
