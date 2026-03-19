/**
 * Maps technical error messages to user-friendly Portuguese descriptions.
 * Use in catch blocks before showing errors in toasts or UI.
 */

const ERROR_MAP: [RegExp, string][] = [
  [/permission[_-]denied|insufficient permissions/i, 'Você não tem permissão para esta ação.'],
  [/not[_-]found/i, 'O recurso solicitado não foi encontrado.'],
  [/unavailable|failed to fetch|network/i, 'Erro de conexão. Verifique sua internet e tente novamente.'],
  [/deadline[_-]exceeded|timeout/i, 'A operação demorou demais. Tente novamente.'],
  [/already[_-]exists|duplicate/i, 'Este registro já existe.'],
  [/unauthenticated|auth/i, 'Sua sessão expirou. Faça login novamente.'],
  [/resource[_-]exhausted|quota/i, 'Limite de uso atingido. Tente novamente em alguns minutos.'],
  [/failed[_-]precondition|missing index/i, 'Erro interno de configuração. Contate o suporte.'],
  [/invalid[_-]argument|invalid/i, 'Dados inválidos. Verifique os campos e tente novamente.'],
  [/cancelled|aborted/i, 'Operação cancelada.'],
];

export function friendlyError(err: unknown, fallback?: string): string {
  const raw =
    err instanceof Error ? err.message : typeof err === 'string' ? err : '';

  for (const [pattern, message] of ERROR_MAP) {
    if (pattern.test(raw)) return message;
  }

  return fallback ?? 'Ocorreu um erro inesperado. Tente novamente.';
}
