// Mapa de acciones de auditoría a verbos en pasado (español)
const ACTION_VERBS: Record<string, string> = {
  CREATE: 'creó',
  UPDATE: 'actualizó',
  DELETE: 'eliminó',
  LOGIN: 'inició sesión',
  LOGOUT: 'cerró sesión',
  LOGIN_FAILED: 'falló al iniciar sesión',
  ACCOUNT_LOCKED: 'bloqueó la cuenta de',
  PASSWORD_CHANGED: 'cambió la contraseña de',
  PASSWORD_RESET_REQUESTED: 'solicitó restablecimiento de contraseña para',
  MFA_ENABLED: 'activó MFA para',
  MFA_DISABLED: 'desactivó MFA de',
  MFA_SETUP_INITIATED: 'inició configuración de MFA para',
  TENANT_PROVISIONED: 'provisionó la empresa',
  TENANT_SUSPENDED: 'suspendió la empresa',
  TENANT_ACTIVATED: 'activó la empresa',
  REFRESH: 'renovó sesión',
  EMAIL_VERIFIED: 'verificó el email de',
  PASSWORD_RESET_COMPLETED: 'completó restablecimiento de contraseña de',
};

// Mapa de acciones a etiquetas legibles para badges y filtros
const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Creación',
  UPDATE: 'Actualización',
  DELETE: 'Eliminación',
  LOGIN: 'Inicio de sesión',
  LOGOUT: 'Cierre de sesión',
  LOGIN_FAILED: 'Fallo de acceso',
  ACCOUNT_LOCKED: 'Cuenta bloqueada',
  PASSWORD_CHANGED: 'Cambio de contraseña',
  PASSWORD_RESET_REQUESTED: 'Solicitud de restablecimiento',
  MFA_ENABLED: 'MFA activado',
  MFA_DISABLED: 'MFA desactivado',
  MFA_SETUP_INITIATED: 'Inicio de MFA',
  TENANT_PROVISIONED: 'Empresa provisionada',
  TENANT_SUSPENDED: 'Empresa suspendida',
  TENANT_ACTIVATED: 'Empresa activada',
  REFRESH: 'Renovación de sesión',
  EMAIL_VERIFIED: 'Email verificado',
  PASSWORD_RESET_COMPLETED: 'Restablecimiento completado',
};

/** Retorna el verbo en pasado para una acción de auditoría */
export function actionVerb(action: string): string {
  return ACTION_VERBS[action] ?? action.toLowerCase().replace(/_/g, ' ');
}

/** Retorna la etiqueta legible para una acción de auditoría */
export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
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

/** Conjunto de acciones relacionadas con cambios de tenant */
export const TENANT_ACTIONS = new Set([
  'TENANT_PROVISIONED',
  'TENANT_SUSPENDED',
  'TENANT_ACTIVATED',
]);
