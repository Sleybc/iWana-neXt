import { formatFullName } from '@iwana/shared';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

const STANDALONE_ACTIONS = new Set([
  'login',
  'logout',
  'login_failed',
  'refresh',
  'mfa_enabled',
  'mfa_disabled',
  'mfa_setup_initiated',
  'mfa_setup',
  'mfa_verified',
  'password_changed',
  'password_reset_requested',
  'password_reset_completed',
  'email_verified',
]);

/** Campos internos: no se pintan en modo Lectura (CA-AUD-02). */
const READING_OMIT_FIELDS = new Set(['slug', 'schemaname']);

const ENTITY_TYPE_LABELS: Record<string, string> = {
  User: 'usuario interno',
  Tenant: 'empresa',
  PlatformUser: 'usuario interno',
  Role: 'categoría base',
  AccessProfile: 'perfil de acceso',
  Subscription: 'suscripción',
  Contact: 'contacto',
  Opportunity: 'oportunidad',
  Quote: 'cotización',
  Contract: 'contrato',
  Expediente: 'oportunidad',
  TaxRule: 'regla tributaria',
  TaxCatalog: 'catálogo tributario',
  Bundle: 'paquete',
  Offer: 'oferta',
  Plan: 'plan',
  Promotion: 'promoción',
};

export interface PlatformActivitySource {
  action: string;
  entityType: string;
  actor?: { displayName?: string | null } | null;
  newValue?: Record<string, unknown> | null;
  oldValue?: Record<string, unknown> | null;
}

function isSafeVisibleName(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('@')) {
    return false;
  }
  if (/^[0-9a-f-]{8,}$/i.test(trimmed) && trimmed.includes('-')) {
    return false;
  }
  return true;
}

function lookupCopy(map: Record<string, string>, rawKey: string): string | undefined {
  const key = rawKey.toLowerCase().replace(/_/g, '');
  const underscored = rawKey.toLowerCase();
  return map[underscored] ?? map[key];
}

function pickSubjectName(entry: PlatformActivitySource): string | null {
  const payload = entry.newValue ?? entry.oldValue;
  if (!payload) {
    return null;
  }

  const first = typeof payload.firstName === 'string' ? payload.firstName.trim() : '';
  const last = typeof payload.lastName === 'string' ? payload.lastName.trim() : '';
  const fullName = formatFullName(first, last);
  if (isSafeVisibleName(fullName)) {
    return fullName;
  }

  for (const field of ['name', 'companyName', 'legalName'] as const) {
    const value = typeof payload[field] === 'string' ? payload[field].trim() : '';
    if (isSafeVisibleName(value)) {
      return value;
    }
  }

  return null;
}

/**
 * Línea visible del historial: frase con verbo, sin enum, id ni correo.
 * Fuente de vocabulario: PLATFORM_UI_COPY.audit (system-vocabulary-review).
 */
export function describePlatformActivityLine(entry: PlatformActivitySource): string {
  const actor = entry.actor?.displayName?.trim() || PLATFORM_UI_COPY.audit.actorFallback;
  const actionKey = entry.action.toLowerCase();
  const verb =
    lookupCopy(PLATFORM_UI_COPY.audit.actionVerbs, entry.action) ?? 'registró un cambio en';

  if (STANDALONE_ACTIONS.has(actionKey)) {
    return `${actor} ${verb}`;
  }

  const subject = pickSubjectName(entry);
  const complement =
    subject ?? lookupCopy(PLATFORM_UI_COPY.audit.entityPhrases, entry.entityType) ?? 'un registro';

  return `${actor} ${verb} ${complement}`;
}

export function describePlatformActionLabel(action: string): string {
  return lookupCopy(PLATFORM_UI_COPY.audit.actionLabels, action) ?? 'Cambio';
}

export function describePlatformEntityLabel(entityType: string): string {
  if (!entityType) {
    return 'registro';
  }
  if (ENTITY_TYPE_LABELS[entityType]) {
    return ENTITY_TYPE_LABELS[entityType];
  }
  const fromCopy = lookupCopy(PLATFORM_UI_COPY.audit.entityTypeLabels, entityType);
  if (fromCopy) {
    return fromCopy;
  }
  const singular = entityType.replace(/s$/i, '').replace(/_/g, ' ');
  const pascal = singular.charAt(0).toUpperCase() + singular.slice(1);
  return ENTITY_TYPE_LABELS[pascal] ?? 'registro';
}

/**
 * ¿El campo debe omitirse en modo Lectura? (slug / schemaName).
 */
export function shouldOmitAuditFieldInReading(field: string): boolean {
  return READING_OMIT_FIELDS.has(field.toLowerCase().replace(/_/g, ''));
}

/**
 * Label de producto para un campo de diff (CA-AUD-02).
 * Devuelve null si el campo no debe pintarse en Lectura.
 */
export function describeAuditFieldLabel(
  field: string,
  options?: { mode?: 'reading' | 'detail' },
): string | null {
  const mode = options?.mode ?? 'detail';
  if (mode === 'reading' && shouldOmitAuditFieldInReading(field)) {
    return null;
  }

  const labels = PLATFORM_UI_COPY.audit.fieldLabels as Record<string, string>;
  const direct = labels[field];
  if (direct) {
    return direct;
  }

  const lowerKey = field.charAt(0).toLowerCase() + field.slice(1);
  if (labels[lowerKey]) {
    return labels[lowerKey];
  }

  const underscored = field
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
  const byLookup = lookupCopy(
    Object.fromEntries(Object.entries(labels).map(([k, v]) => [k.toLowerCase(), v])),
    underscored.replace(/_/g, ''),
  );
  if (byLookup) {
    return byLookup;
  }

  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .replace(/\bId\b/g, 'ID')
    .trim();
}
