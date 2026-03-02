"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STORAGE_ROOT = exports.SUBCOLLECTIONS = exports.COLLECTIONS = void 0;
/**
 * Centralized Firestore collection path definitions for the backend.
 *
 * The ANVISA module uses "anvisa_" prefix for all collections to avoid
 * collisions with the VENDA app's collections in the shared Firebase project.
 */
const PREFIX = process.env.FIRESTORE_PREFIX || 'anvisa_';
exports.COLLECTIONS = {
    requests: `${PREFIX}requests`,
    rolesAdmin: `${PREFIX}roles_admin`,
    defaultProfile: `${PREFIX}defaultProfile`,
};
exports.SUBCOLLECTIONS = {
    pacienteDocuments: 'pacienteDocuments',
    comprovanteResidenciaDocuments: 'comprovanteResidenciaDocuments',
    procuracaoDocuments: 'procuracaoDocuments',
    receitaMedicaDocuments: 'receitaMedicaDocuments',
};
/**
 * The expected root folder in Firebase Storage for request documents.
 * Must match the COLLECTIONS.requests value.
 */
exports.STORAGE_ROOT = exports.COLLECTIONS.requests;
//# sourceMappingURL=config.js.map