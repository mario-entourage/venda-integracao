/**
 * One-time migration: merge representantes into users.
 *
 * Run with: npx tsx src/scripts/migrate-reps-to-users.ts
 *
 * What this script does:
 * 1. Reads all docs from the `representantes` collection
 * 2. For each rep WITH a `userId` → finds the matching user, sets isRepresentante + legacyRepresentanteId
 * 3. For each rep WITHOUT a `userId` → checks if a user with matching email exists;
 *    if so, links; if not, creates a preregistration with isRepresentante: true
 * 4. Scans ALL orders → for each `orders/{id}/representative` subcollection doc,
 *    if `userId` points to a representante ID, updates it to the corresponding user ID
 * 5. Logs a full audit trail
 *
 * IMPORTANT: Set GOOGLE_APPLICATION_CREDENTIALS or run from a context with default credentials.
 */

import 'dotenv/config';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Initialize admin SDK
if (getApps().length === 0) {
  initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
}
const db = getFirestore();

interface RepDoc {
  name: string;
  email?: string;
  phone?: string;
  estado?: string;
  userId?: string;
  active: boolean;
}

interface AuditEntry {
  action: string;
  repId: string;
  repName: string;
  userId?: string;
  details: string;
}

const audit: AuditEntry[] = [];

function log(entry: AuditEntry) {
  audit.push(entry);
  console.log(`[${entry.action}] rep=${entry.repId} (${entry.repName}) → ${entry.details}`);
}

async function main() {
  console.log('=== Starting representante → user migration ===\n');

  // 1. Load all representantes
  const repsSnap = await db.collection('representantes').get();
  console.log(`Found ${repsSnap.size} representante(s)\n`);

  // Build mapping: repId → userId (for order updates)
  const repIdToUserId = new Map<string, string>();

  for (const repDoc of repsSnap.docs) {
    const rep = repDoc.data() as RepDoc;
    const repId = repDoc.id;

    // Case A: rep has a userId link
    if (rep.userId) {
      const userSnap = await db.collection('users').doc(rep.userId).get();

      if (userSnap.exists) {
        // Update the user to be a rep
        await db.collection('users').doc(rep.userId).update({
          isRepresentante: true,
          legacyRepresentanteId: repId,
          ...(rep.name && !userSnap.data()?.displayName ? { displayName: rep.name } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Update profile if needed
        const profilesSnap = await db.collection('users').doc(rep.userId).collection('profiles').limit(1).get();
        if (profilesSnap.size > 0) {
          const profile = profilesSnap.docs[0];
          const profileData = profile.data();
          const updates: Record<string, unknown> = {};
          if (rep.phone && !profileData.phone) updates.phone = rep.phone;
          if (rep.estado && !profileData.state) updates.state = rep.estado;
          if (rep.name && !profileData.fullName) updates.fullName = rep.name;
          if (Object.keys(updates).length > 0) {
            updates.updatedAt = FieldValue.serverTimestamp();
            await profile.ref.update(updates);
          }
        }

        repIdToUserId.set(repId, rep.userId);
        log({
          action: 'LINKED',
          repId,
          repName: rep.name,
          userId: rep.userId,
          details: `User ${rep.userId} marked as rep (had existing userId link)`,
        });
      } else {
        log({
          action: 'WARNING',
          repId,
          repName: rep.name,
          userId: rep.userId,
          details: `User ${rep.userId} not found — skipping`,
        });
      }
      continue;
    }

    // Case B: rep has no userId — try to match by email
    if (rep.email) {
      const usersSnap = await db
        .collection('users')
        .where('email', '==', rep.email)
        .where('active', '==', true)
        .limit(1)
        .get();

      if (usersSnap.size > 0) {
        const userDoc = usersSnap.docs[0];
        await userDoc.ref.update({
          isRepresentante: true,
          legacyRepresentanteId: repId,
          ...(rep.name && !userDoc.data().displayName ? { displayName: rep.name } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        });

        repIdToUserId.set(repId, userDoc.id);
        log({
          action: 'MATCHED_BY_EMAIL',
          repId,
          repName: rep.name,
          userId: userDoc.id,
          details: `User ${userDoc.id} matched by email ${rep.email}`,
        });
        continue;
      }
    }

    // Case C: no match — create preregistration
    if (rep.email) {
      const preregDocId = rep.email.replace(/[.@]/g, '_');
      await db.collection('preregistrations').doc(preregDocId).set({
        email: rep.email,
        groupId: 'user',
        isRepresentante: true,
        displayName: rep.name,
        createdAt: FieldValue.serverTimestamp(),
      });

      log({
        action: 'PREREGISTERED',
        repId,
        repName: rep.name,
        details: `Created preregistration for ${rep.email}`,
      });
    } else {
      log({
        action: 'SKIPPED',
        repId,
        repName: rep.name,
        details: 'No userId and no email — cannot migrate',
      });
    }
  }

  // 2. Update order representative subcollections
  console.log('\n=== Updating order representative references ===\n');

  const ordersSnap = await db.collection('orders').get();
  let orderUpdates = 0;

  for (const orderDoc of ordersSnap.docs) {
    const repsSubSnap = await orderDoc.ref.collection('representative').get();

    for (const repSubDoc of repsSubSnap.docs) {
      const repSub = repSubDoc.data();
      const oldUserId = repSub.userId;

      if (oldUserId && repIdToUserId.has(oldUserId)) {
        const newUserId = repIdToUserId.get(oldUserId)!;
        await repSubDoc.ref.update({
          userId: newUserId,
          updatedAt: FieldValue.serverTimestamp(),
        });
        orderUpdates++;
        log({
          action: 'ORDER_REP_UPDATED',
          repId: oldUserId,
          repName: repSub.name || '?',
          userId: newUserId,
          details: `Order ${orderDoc.id}: rep userId ${oldUserId} → ${newUserId}`,
        });
      }
    }
  }

  // 3. Summary
  console.log('\n=== Migration Summary ===');
  console.log(`Total representantes processed: ${repsSnap.size}`);
  console.log(`Order rep references updated: ${orderUpdates}`);
  console.log(`Audit entries: ${audit.length}`);

  const counts = {
    LINKED: 0, MATCHED_BY_EMAIL: 0, PREREGISTERED: 0, SKIPPED: 0, WARNING: 0, ORDER_REP_UPDATED: 0,
  };
  for (const entry of audit) {
    counts[entry.action as keyof typeof counts] = (counts[entry.action as keyof typeof counts] || 0) + 1;
  }
  console.log('Breakdown:', counts);
  console.log('\n=== Done ===');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
