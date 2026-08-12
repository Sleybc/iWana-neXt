import { describePlatformActionLabel } from '@/lib/platform-audit-vocabulary';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

function lookupVerb(action: string): string {
  const key = action.toLowerCase() as keyof typeof PLATFORM_UI_COPY.audit.actionVerbs;
  return PLATFORM_UI_COPY.audit.actionVerbs[key] ?? 'registró un cambio en';
}

/** Retorna el verbo en pasado para una acción del historial */
export function actionVerb(action: string): string {
  return lookupVerb(action);
}

/** Retorna la etiqueta legible para una acción del historial */
export function actionLabel(action: string): string {
  return describePlatformActionLabel(action);
}

/** Conjunto de acciones relacionadas con autenticación */
export const AUTH_ACTIONS = new Set([
  'LOGIN',
  'LOGOUT',
  'LOGIN_FAILED',
  'REFRESH',
  'ACCOUNT_LOCKED',
  'EMAIL_VERIFIED',
]);

/** Conjunto de acciones relacionadas con permisos y seguridad */
export const SECURITY_ACTIONS = new Set([
  'PASSWORD_CHANGED',
  'PASSWORD_RESET_REQUESTED',
  'PASSWORD_RESET_COMPLETED',
  'MFA_ENABLED',
  'MFA_DISABLED',
  'MFA_SETUP_INITIATED',
]);

/** Conjunto de acciones relacionadas con cambios de empresa */
export const TENANT_ACTIONS = new Set([
  'TENANT_PROVISIONED',
  'TENANT_SUSPENDED',
  'TENANT_ACTIVATED',
]);
