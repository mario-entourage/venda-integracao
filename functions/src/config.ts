/**
 * Centralized Firestore collection path definitions for the backend.
 *
 * The ANVISA module uses "anvisa_" prefix for all collections to avoid
 * collisions with the VENDA app's collections in the shared Firebase project.
 */
const PREFIX = process.env.FIRESTORE_PREFIX || 'anvisa_';

export const COLLECTIONS = {
    requests: `${PREFIX}requests`,
    rolesAdmin: `${PREFIX}roles_admin`,
    defaultProfile: `${PREFIX}defaultProfile`,
} as const;

export const SUBCOLLECTIONS = {
    pacienteDocuments: 'pacienteDocuments',
    comprovanteResidenciaDocuments: 'comprovanteResidenciaDocuments',
    procuracaoDocuments: 'procuracaoDocuments',
    receitaMedicaDocuments: 'receitaMedicaDocuments',
} as const;

/**
 * The expected root folder in Firebase Storage for request documents.
 * Must match the COLLECTIONS.requests value.
 */
export const STORAGE_ROOT = COLLECTIONS.requests;
