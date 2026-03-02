/**
 * Firestore collection/subcollection paths for the ANVISA module.
 *
 * All top-level collections use the `anvisa_` prefix so they don't
 * clash with VENDA's own collections in the same Firebase project.
 * Subcollections are nested under the prefixed parent, so they
 * don't need their own prefix.
 */

export const ANVISA_COLLECTIONS = {
  requests: 'anvisa_requests',
  userProfiles: 'anvisa_userProfiles',
  defaultProfile: 'anvisa_defaultProfile',
  deletedRequests: 'anvisa_deleted_requests',
  rolesAdmin: 'anvisa_roles_admin',
} as const;

export const ANVISA_SUBCOLLECTIONS = {
  pacienteDocuments: 'pacienteDocuments',
  comprovanteResidenciaDocuments: 'comprovanteResidenciaDocuments',
  procuracaoDocuments: 'procuracaoDocuments',
  receitaMedicaDocuments: 'receitaMedicaDocuments',
} as const;
