import {
  collection, doc, addDoc, updateDoc, getDocs, writeBatch,
  query, where, orderBy, limit, serverTimestamp,
  Firestore, Query,
} from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Notification {
  id: string;
  recipientUserId: string;
  type: 'payment_link_created' | 'payment_received' | 'shipment_tracking';
  title: string;
  body: string;
  orderId: string;
  read: boolean;
  emailSent: boolean;
  createdAt: unknown;
}

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

export function getNotificationsRef(db: Firestore) {
  return collection(db, 'notifications');
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createNotification(
  db: Firestore,
  data: Omit<Notification, 'id' | 'createdAt'>,
): Promise<string> {
  const ref = await addDoc(getNotificationsRef(db), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export function getUnreadNotificationsQuery(
  db: Firestore,
  userId: string,
): Query {
  return query(
    getNotificationsRef(db),
    where('recipientUserId', '==', userId),
    where('read', '==', false),
    orderBy('createdAt', 'desc'),
    limit(50),
  );
}

export function getRecentNotificationsQuery(
  db: Firestore,
  userId: string,
): Query {
  return query(
    getNotificationsRef(db),
    where('recipientUserId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(20),
  );
}

export async function markNotificationRead(
  db: Firestore,
  notificationId: string,
): Promise<void> {
  await updateDoc(doc(db, 'notifications', notificationId), {
    read: true,
  });
}

export async function markAllNotificationsRead(
  db: Firestore,
  userId: string,
): Promise<void> {
  const unread = await getDocs(
    query(
      getNotificationsRef(db),
      where('recipientUserId', '==', userId),
      where('read', '==', false),
    ),
  );

  if (unread.empty) return;

  const batch = writeBatch(db);
  for (const d of unread.docs) {
    batch.update(d.ref, { read: true });
  }
  await batch.commit();
}

// ---------------------------------------------------------------------------
// Trigger helpers (client-side convenience)
// ---------------------------------------------------------------------------

/**
 * Notify a rep that a TriStar shipment was created and include the tracking code.
 */
export async function notifyShipmentTracking(
  db: Firestore,
  opts: {
    recipientUserId: string;
    recipientEmail: string;
    orderId: string;
    trackingCode: string;
    invoiceNumber?: string;
  },
): Promise<void> {
  const ref = opts.invoiceNumber || opts.orderId.slice(0, 8).toUpperCase();
  const title = 'Remessa criada — código de rastreio disponível';
  const body = `Pedido ${ref} — Rastreio TriStar: ${opts.trackingCode}`;

  await createNotification(db, {
    recipientUserId: opts.recipientUserId,
    type: 'shipment_tracking',
    title,
    body,
    orderId: opts.orderId,
    read: false,
    emailSent: false,
  });

  try {
    await fetch('/api/notifications/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: opts.recipientEmail,
        subject: `${title} — Pedido ${ref}`,
        html: `<p>Olá,</p><p>A remessa TriStar do pedido <strong>${ref}</strong> foi criada com sucesso.</p><p><strong>Código de rastreio:</strong> ${opts.trackingCode}</p><p>Acesse o sistema para baixar a etiqueta.</p>`,
      }),
    });
  } catch {
    // Email failure is non-fatal
  }
}

/**
 * Create an in-app notification and optionally send an email for payment link creation.
 */
export async function notifyPaymentLinkCreated(
  db: Firestore,
  opts: {
    recipientUserId: string;
    recipientEmail: string;
    orderId: string;
    invoiceNumber?: string;
    amount: number;
    currency: string;
  },
): Promise<void> {
  const fmtAmount = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: opts.currency || 'BRL',
  }).format(opts.amount);

  const title = 'Link de pagamento criado';
  const body = `Pedido ${opts.invoiceNumber || opts.orderId.slice(0, 8).toUpperCase()} — ${fmtAmount}`;

  // In-app notification
  await createNotification(db, {
    recipientUserId: opts.recipientUserId,
    type: 'payment_link_created',
    title,
    body,
    orderId: opts.orderId,
    read: false,
    emailSent: false,
  });

  // Email (fire-and-forget)
  try {
    await fetch('/api/notifications/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: opts.recipientEmail,
        subject: `${title} — ${body}`,
        html: `<p>Olá,</p><p>Um link de pagamento foi criado para o pedido <strong>${opts.invoiceNumber || opts.orderId.slice(0, 8).toUpperCase()}</strong> no valor de <strong>${fmtAmount}</strong>.</p><p>Acesse o sistema para mais detalhes.</p>`,
      }),
    });
  } catch {
    // Email failure should not block the flow
  }
}
