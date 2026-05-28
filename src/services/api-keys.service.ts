import crypto from 'node:crypto';
import { adminDb } from '@/firebase/admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { ApiKey, ApiKeyLevel } from '@/types/api-key';

/**
 * Server-side API key service. Uses the Firebase Admin SDK directly because
 * all callers run in Node API routes — never invoke this from the browser.
 *
 * Storage model: only the SHA-256 hash of each key is persisted. The plaintext
 * is shown to the admin exactly once at creation time and then discarded.
 */

const COLLECTION = 'api_keys';

function hashKey(plaintext: string): string {
  return crypto.createHash('sha256').update(plaintext).digest('hex');
}

/** Generates a high-entropy plaintext key prefixed with `ent_` for visual ID. */
function generatePlaintextKey(): string {
  // 32 bytes of entropy, url-safe base64 → ~43 chars
  const raw = crypto.randomBytes(32).toString('base64url');
  return `ent_${raw}`;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export interface CreateApiKeyInput {
  name: string;
  level: ApiKeyLevel;
  createdById: string;
  createdByEmail: string;
}

export interface CreateApiKeyResult {
  id: string;
  /** Plaintext key — shown to the admin once, never stored or retrievable again. */
  plaintext: string;
  keyPrefix: string;
}

export async function createApiKey(input: CreateApiKeyInput): Promise<CreateApiKeyResult> {
  const plaintext = generatePlaintextKey();
  const keyHash = hashKey(plaintext);
  const keyPrefix = plaintext.slice(0, 8);

  const docRef = await adminDb.collection(COLLECTION).add({
    name: input.name,
    keyHash,
    keyPrefix,
    level: input.level,
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    createdById: input.createdById,
    createdByEmail: input.createdByEmail,
    requestCount: 0,
  });

  return { id: docRef.id, plaintext, keyPrefix };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function listApiKeys(): Promise<ApiKey[]> {
  const snap = await adminDb
    .collection(COLLECTION)
    .orderBy('createdAt', 'desc')
    .get();
  return snap.docs.map((d) => ({ ...(d.data() as Omit<ApiKey, 'id'>), id: d.id }));
}

/**
 * Looks up an API key by its plaintext value. Returns null if no active key
 * matches. Does NOT update lastUsedAt — that's the caller's job (typically
 * the middleware) so failed lookups don't pollute the metric.
 */
export async function findActiveApiKeyByPlaintext(
  plaintext: string,
): Promise<ApiKey | null> {
  const keyHash = hashKey(plaintext);
  const snap = await adminDb
    .collection(COLLECTION)
    .where('keyHash', '==', keyHash)
    .where('active', '==', true)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { ...(d.data() as Omit<ApiKey, 'id'>), id: d.id };
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function recordApiKeyUsage(keyId: string): Promise<void> {
  try {
    await adminDb.collection(COLLECTION).doc(keyId).update({
      lastUsedAt: FieldValue.serverTimestamp(),
      requestCount: FieldValue.increment(1),
    });
  } catch (err) {
    // Non-fatal — usage tracking failure must not break the request
    console.error('[api-keys] Failed to record usage:', err);
  }
}

export async function revokeApiKey(
  keyId: string,
  revokedById: string,
): Promise<void> {
  await adminDb.collection(COLLECTION).doc(keyId).update({
    active: false,
    revokedAt: FieldValue.serverTimestamp(),
    revokedById,
  });
}

// ---------------------------------------------------------------------------
// Audit log (separate collection from operation audit)
// ---------------------------------------------------------------------------

export interface ApiKeyAccessLog {
  apiKeyId: string;
  keyName: string;
  level: ApiKeyLevel;
  endpoint: string;
  method: string;
  status: number;
  timestamp: Timestamp;
}

export async function writeApiAccessLog(entry: {
  apiKeyId: string;
  keyName: string;
  level: ApiKeyLevel;
  endpoint: string;
  method: string;
  status: number;
}): Promise<void> {
  try {
    await adminDb.collection('api_key_access_log').add({
      ...entry,
      timestamp: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('[api-keys] Failed to write access log:', err);
  }
}
