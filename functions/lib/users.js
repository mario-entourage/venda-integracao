"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listUsers = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const config_1 = require("./config");
// Super-admins who always have admin access (configured via env var)
const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS || 'caio@entouragelab.com,mario@entouragelab.com')
    .split(',')
    .map(e => e.trim())
    .filter(Boolean);
// Email domain restriction for user listing (empty string allows all domains)
const ALLOWED_EMAIL_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN || 'entouragelab.com';
exports.listUsers = functions
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
        const callerAdminDoc = await admin.firestore().collection(config_1.COLLECTIONS.rolesAdmin).doc(callerUid).get();
        isCallerDynamicAdmin = callerAdminDoc.exists;
    }
    if (!isCallerSuperAdmin && !isCallerDynamicAdmin) {
        throw new functions.https.HttpsError('permission-denied', 'Only admins can list users.');
    }
    try {
        // Fetch all admin UIDs from the roles_admin collection
        const rolesAdminSnapshot = await admin.firestore().collection(config_1.COLLECTIONS.rolesAdmin).get();
        const dynamicAdminUids = new Set(rolesAdminSnapshot.docs.map(doc => doc.id));
        const listUsersResult = await admin.auth().listUsers();
        const users = listUsersResult.users
            .filter((userRecord) => {
            var _a;
            if (!ALLOWED_EMAIL_DOMAIN)
                return true; // No restriction
            return (_a = userRecord.email) === null || _a === void 0 ? void 0 : _a.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
        })
            .map((userRecord) => {
            // User is admin if they're a super-admin OR have a roles_admin document
            const isSuperAdmin = userRecord.email && SUPER_ADMIN_EMAILS.includes(userRecord.email);
            const isDynamicAdmin = dynamicAdminUids.has(userRecord.uid);
            const role = (isSuperAdmin || isDynamicAdmin) ? 'admin' : 'operator';
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
    }
    catch (error) {
        console.error('Error listing users:', error);
        if (error instanceof Error) {
            throw new functions.https.HttpsError('internal', 'Unable to list users.', error.message);
        }
        throw new functions.https.HttpsError('internal', 'Unable to list users.');
    }
});
//# sourceMappingURL=users.js.map