export const WEB_USER_ROLES = [
  'ADMIN',
  'NOC',
  'SUPPORT',
  'TECHNICIAN',
  'SALES',
  'ACCOUNTANT',
  'HR',
  'SUBSCRIBER',
  'CONTRACTOR',
  'PARTNER',
  'AUDITOR',
  'INVESTOR',
] as const;

export const WEB_USER_STATUSES = [
  'PENDING_VERIFICATION',
  'ACTIVE',
  'SUSPENDED',
  'INACTIVE',
] as const;

const WEB_USER_ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  NOC: 'Operador NOC',
  SUPPORT: 'Soporte',
  TECHNICIAN: 'Técnico',
  SALES: 'Ventas',
  ACCOUNTANT: 'Contabilidad',
  HR: 'Talento humano',
  SUBSCRIBER: 'Suscriptor',
  CONTRACTOR: 'Contratista',
  PARTNER: 'Aliado',
  AUDITOR: 'Auditor',
  INVESTOR: 'Inversionista',
  SYSTEM_ADMIN: 'Administrador de plataforma',
  IWANA_SUPPORT: 'Soporte iWana',
};

const WEB_USER_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  PENDING_VERIFICATION: 'Pendiente de verificación',
  ACTIVE: 'Activo',
  SUSPENDED: 'Suspendido',
  INACTIVE: 'Inactivo',
};

function formatUnknownValue(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/_/g, ' ');
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function getWebUserRoleLabel(role: string | null | undefined): string {
  if (!role) return 'Sin rol';
  return WEB_USER_ROLE_LABELS[role] ?? formatUnknownValue(role);
}

export function getWebUserStatusLabel(status: string | null | undefined): string {
  if (!status) return 'Sin estado';
  return WEB_USER_STATUS_LABELS[status] ?? formatUnknownValue(status);
}

export const WEB_USER_ROLE_OPTIONS = WEB_USER_ROLES.map((role) => ({
  value: role,
  label: getWebUserRoleLabel(role),
}));

export const WEB_USER_STATUS_OPTIONS = WEB_USER_STATUSES.map((status) => ({
  value: status,
  label: getWebUserStatusLabel(status),
}));
