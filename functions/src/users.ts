import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import type { UserRecord } from 'firebase-admin/auth';
import { COLLECTIONS } from './config';

type UserRole = 'admin' | 'operator';

// Super-admins who always have admin access (configured via env var)
const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS || 'caio@entouragelab.com,mario@entouragelab.com')
    .split(',')
    .map(e => e.trim())
    .filter(Boolean);

// Email domain restriction for user listing (empty string allows all domains)
const ALLOWED_EMAIL_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN || 'entouragelab.com';

export const listUsers = functions
    .region('us-central1')
    .https.onCall(async (data, context) => {
        if (!context.auth || !context.auth.token.email) {
            throw new functions.https.HttpsError('unauthenticated', 'The function must be called by an authenticated user with an email.');
        }

        const callerEmail = context.auth.token.email;
        const callerUid = context.auth.uid;

        // Check if caller is a super-admin or has a roles_admin document
        const isCallerSuperAdmin = SUPER_ADMIN_EMAILS.includes(callerEmail);
        let isCallerDynamicAdmin = false;

        if (!isCallerSuperAdmin) {
            const callerAdminDoc = await admin.firestore().collection(COLLECTIONS.rolesAdmin).doc(callerUid).get();
            isCallerDynamicAdmin = callerAdminDoc.exists;
        }

        if (!isCallerSuperAdmin && !isCallerDynamicAdmin) {
            throw new functions.https.HttpsError('permission-denied', 'Only admins can list users.');
        }

        try {
            // Fetch all admin UIDs from the roles_admin collection
            const rolesAdminSnapshot = await admin.firestore().collection(COLLECTIONS.rolesAdmin).get();
            const dynamicAdminUids = new Set(rolesAdminSnapshot.docs.map(doc => doc.id));

            const listUsersResult = await admin.auth().listUsers();

            const users = listUsersResult.users
            .filter((userRecord: UserRecord) => {
                if (!ALLOWED_EMAIL_DOMAIN) return true; // No restriction
                return userRecord.email?.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
            })
            .map((userRecord: UserRecord) => {
                // User is admin if they're a super-admin OR have a roles_admin document
                const isSuperAdmin = userRecord.email && SUPER_ADMIN_EMAILS.includes(userRecord.email);
                const isDynamicAdmin = dynamicAdminUids.has(userRecord.uid);
                const role: UserRole = (isSuperAdmin || isDynamicAdmin) ? 'admin' : 'operator';

                return {
                    id: userRecord.uid,
                    name: userRecord.displayName || 'N/A',
                    email: userRecord.email || 'N/A',
                    avatarUrl: userRecord.photoURL || '',
                    role: role,
                    disabled: userRecord.disabled,
                };
            });

            return users;

        } catch (error) {
            console.error('Error listing users:', error);
            if (error instanceof Error) {
                throw new functions.https.HttpsError('internal', 'Unable to list users.', error.message);
            }
            throw new functions.https.HttpsError('internal', 'Unable to list users.');
        }
    });
