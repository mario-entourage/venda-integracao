/**
 * Centralized route definitions for the ANVISA module.
 */

export const ANVISA_ROUTES = {
  dashboard: '/anvisa',
  newRequest: '/anvisa/nova',
  requestDetail: (id: string) => `/anvisa/${id}`,
  profile: '/anvisa/perfil',
} as const;

export const ANVISA_API_ROUTES = {
  extractOcrFields: '/api/anvisa/extract-ocr-fields',
  classifyDocument: '/api/anvisa/classify-document',
  suggestCorrections: '/api/anvisa/suggest-corrections',
} as const;
