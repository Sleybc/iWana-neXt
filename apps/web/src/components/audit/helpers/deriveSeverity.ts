import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

/** Nivel de criticidad de un evento de auditoría */
export type Severity = 'critical' | 'medium' | 'info';

/** Acciones que siempre son críticas independientemente de la entidad o diff */
const CRITICAL_ACTIONS = new Set([
  'DELETE',
  'ACCOUNT_LOCKED',
  'MFA_DISABLED',
  'TENANT_SUSPENDED',
  'LOGIN_FAILED',
]);

/** Acciones que son de nivel medio */
const MEDIUM_ACTIONS = new Set([
  'MFA_ENABLED',
  'MFA_SETUP_INITIATED',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET_REQUESTED',
  'PASSWORD_RESET_COMPLETED',
  'TENANT_PROVISIONED',
]);

/** Campos de UPDATE que elevan la criticidad a crítico */
const CRITICAL_UPDATE_FIELDS = ['role', 'mfaEnabled', 'status', 'isActive', 'password'];

/** Campos de UPDATE que elevan la criticidad a medio */
const MEDIUM_UPDATE_FIELDS = [
  'email',
  'name',
  'firstName',
  'lastName',
  'slug',
  'schemaName',
  'plan',
];

/**
 * Deriva la criticidad de un evento de auditoría a partir de la acción, tipo
 * de entidad y los campos modificados (para UPDATE).
 * En Fase 5 este cálculo se moverá al backend para persistirse.
 */
export function deriveSeverity(
  action: string,
  _entityType: string,
  diff: Array<{ field: string }> = [],
): Severity {
  if (CRITICAL_ACTIONS.has(action)) return 'critical';

  if (action === 'UPDATE') {
    const fields = diff.map((d) => d.field);
    if (fields.some((f) => CRITICAL_UPDATE_FIELDS.includes(f))) return 'critical';
    if (fields.some((f) => MEDIUM_UPDATE_FIELDS.includes(f))) return 'medium';
    return 'info';
  }

  if (MEDIUM_ACTIONS.has(action)) return 'medium';

  return 'info';
}

/** Retorna las clases Tailwind para punto y badge según la severidad */
export function severityClasses(severity: Severity): { dot: string; badge: string } {
  switch (severity) {
    case 'critical':
      return {
        dot: 'bg-red-500',
        badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      };
    case 'medium':
      return {
        dot: 'bg-amber-400',
        badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      };
    case 'info':
    default:
      return {
        dot: 'bg-gray-300 dark:bg-gray-600',
        badge: 'bg-gray-100 text-gray-600 dark:bg-dark-surface-3 dark:text-gray-400',
      };
  }
}

/** Retorna la etiqueta legible para una severidad */
export function severityLabel(severity: Severity): string {
  switch (severity) {
    case 'critical':
      return PLATFORM_UI_COPY.audit.severityCritical;
    case 'medium':
      return PLATFORM_UI_COPY.audit.severityMedium;
    case 'info':
    default:
      return PLATFORM_UI_COPY.audit.severityNormal;
  }
}
