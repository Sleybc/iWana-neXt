import { UserRole, UserStatus } from '@iwana/shared';
import { portalActiveBadgeVariant } from '@/lib/portal-status-badge-rules';
import { getSystemBaseRoleLabel } from './system-vocabulary';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'lime';

export const PORTAL_USER_ROLE_LABELS: Record<UserRole, string> = {
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
  [UserRole.SYSTEM_ADMIN]: 'Administrador de plataforma',
  [UserRole.IWANA_SUPPORT]: 'Soporte iWana',
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

export const PORTAL_PLATFORM_ROLES = new Set<UserRole>([
  UserRole.SYSTEM_ADMIN,
  UserRole.IWANA_SUPPORT,
]);

export const PORTAL_TENANT_ASSIGNABLE_ROLES = Object.values(UserRole).filter(
  (role) => !PORTAL_PLATFORM_ROLES.has(role),
);

export const PORTAL_USER_STATUSES = Object.values(UserStatus);

function formatEnumFallback(value: string): string {
  const normalized = value.replace(/_/g, ' ').toLocaleLowerCase('es-CO');
  return normalized.charAt(0).toLocaleUpperCase('es-CO') + normalized.slice(1);
}

export function getPortalUserRoleLabel(role: string): string {
  return getSystemBaseRoleLabel(role);
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
  ...PORTAL_TENANT_ASSIGNABLE_ROLES.map((role) => ({
    value: role,
    label: getPortalUserRoleLabel(role),
  })),
];
