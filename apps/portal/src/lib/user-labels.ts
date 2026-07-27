import {
  DocumentType,
  PlatformRole,
  TENANT_ASSIGNABLE_ROLES,
  UserRole,
  UserStatus,
} from '@iwana/shared';
import { portalActiveBadgeVariant } from '@/lib/portal-status-badge-rules';
import { getSystemBaseRoleLabel } from './system-vocabulary';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'lime';

export const PORTAL_DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  [DocumentType.CC]: 'Cédula de ciudadanía',
  [DocumentType.CE]: 'Cédula de extranjería',
  [DocumentType.PASAPORTE]: 'Pasaporte',
  [DocumentType.PEP]: 'PEP',
  [DocumentType.PTP]: 'PTP',
  [DocumentType.NIT_PERSONA]: 'NIT persona',
};

export function getPortalDocumentTypeLabel(documentType: string): string {
  return (
    PORTAL_DOCUMENT_TYPE_LABELS[documentType as DocumentType] ?? formatEnumFallback(documentType)
  );
}

export const PORTAL_USER_ROLE_LABELS: Record<UserRole | PlatformRole, string> = {
  [UserRole.ADMIN]: 'Administrador',
  [UserRole.NOC]: 'Monitoreo operativo',
  [UserRole.SUPPORT]: 'Soporte inicial',
  [UserRole.SALES]: 'Ventas',
  [UserRole.TECHNICIAN]: 'Técnico de campo',
  [UserRole.ACCOUNTANT]: 'Contabilidad',
  [UserRole.HR]: 'Talento humano',
  [UserRole.SUBSCRIBER]: 'Suscriptor',
  [UserRole.CONTRACTOR]: 'Contratista',
  [UserRole.PARTNER]: 'Aliado',
  [UserRole.AUDITOR]: 'Auditor',
  [UserRole.INVESTOR]: 'Inversionista',
  [PlatformRole.SYSTEM_ADMIN]: 'Administrador de plataforma',
  [PlatformRole.IWANA_SUPPORT]: 'Soporte iWana',
};

export const PORTAL_USER_STATUS_LABELS: Record<UserStatus, string> = {
  [UserStatus.ACTIVE]: 'Activo',
  [UserStatus.PENDING_VERIFICATION]: 'Pendiente de verificación',
  [UserStatus.SUSPENDED]: 'Suspendido',
  [UserStatus.INACTIVE]: 'Inactivo',
};

export const PORTAL_USER_STATUS_VARIANTS: Record<UserStatus, BadgeVariant> = {
  [UserStatus.ACTIVE]: portalActiveBadgeVariant,
  [UserStatus.PENDING_VERIFICATION]: 'warning',
  [UserStatus.SUSPENDED]: 'error',
  [UserStatus.INACTIVE]: 'neutral',
};

/** Roles asignables en tenant: canónico en `@iwana/shared` (FE-05). */
export { TENANT_ASSIGNABLE_ROLES as PORTAL_TENANT_ASSIGNABLE_ROLES };

export const PORTAL_USER_STATUSES = Object.values(UserStatus);

function formatEnumFallback(value: string): string {
  const normalized = value.replace(/_/g, ' ').toLocaleLowerCase('es-CO');
  return normalized.charAt(0).toLocaleUpperCase('es-CO') + normalized.slice(1);
}

export function getPortalUserRoleLabel(role: string): string {
  return getSystemBaseRoleLabel(role);
}

/**
 * Resuelve un rol de CSV: acepta enum (`ADMIN`) o etiqueta amigable (`Administrador`).
 * Devuelve `null` si no hay coincidencia con `UserRole`.
 */
export function resolveUserRoleFromCsv(value: string): UserRole | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const userRoleValues = Object.values(UserRole) as string[];
  if (userRoleValues.includes(trimmed)) {
    return trimmed as UserRole;
  }

  const upper = trimmed.toUpperCase();
  const byEnum = userRoleValues.find((role) => role.toUpperCase() === upper);
  if (byEnum) {
    return byEnum as UserRole;
  }

  const normalized = trimmed.toLocaleLowerCase('es-CO');
  for (const role of userRoleValues) {
    const label = PORTAL_USER_ROLE_LABELS[role as UserRole];
    if (label.toLocaleLowerCase('es-CO') === normalized) {
      return role as UserRole;
    }
  }

  return null;
}

export function getPortalUserStatusLabel(status: string): string {
  return PORTAL_USER_STATUS_LABELS[status as UserStatus] ?? formatEnumFallback(status);
}

export function getPortalUserStatusVariant(status: string): BadgeVariant {
  return PORTAL_USER_STATUS_VARIANTS[status as UserStatus] ?? 'neutral';
}

export const PORTAL_USER_STATUS_FILTER_OPTIONS = [
  { value: '', label: 'Todos' },
  ...PORTAL_USER_STATUSES.map((status) => ({
    value: status,
    label: getPortalUserStatusLabel(status),
  })),
];

export const PORTAL_TENANT_ROLE_FILTER_OPTIONS = [
  { value: '', label: 'Todos' },
  ...TENANT_ASSIGNABLE_ROLES.map((role) => ({
    value: role,
    label: getPortalUserRoleLabel(role),
  })),
];
