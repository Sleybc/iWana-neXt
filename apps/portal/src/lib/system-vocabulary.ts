import { UserRole } from '@iwana/shared';

const SYSTEM_BASE_ROLE_LABELS: Record<UserRole, string> = {
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

const SYSTEM_TEMPLATE_PROFILE_NAMES: Partial<Record<UserRole, string>> = {
  [UserRole.ADMIN]: 'Administrador general',
  [UserRole.NOC]: 'Monitoreo operativo',
  [UserRole.SUPPORT]: 'Soporte inicial',
  [UserRole.TECHNICIAN]: 'Técnico de campo',
  [UserRole.CONTRACTOR]: 'Contratista',
  [UserRole.AUDITOR]: 'Auditor',
};

interface AccessProfileNameSource {
  name: string;
  isSystem: boolean;
  baseRoleConstraint: UserRole | null;
}

function formatEnumFallback(value: string): string {
  const normalized = value.replace(/_/g, ' ').toLocaleLowerCase('es-CO');
  return normalized.charAt(0).toLocaleUpperCase('es-CO') + normalized.slice(1);
}

export function getSystemBaseRoleLabel(value: string | null | undefined): string {
  if (!value) {
    return 'Sin restricción';
  }

  return SYSTEM_BASE_ROLE_LABELS[value as UserRole] ?? formatEnumFallback(value);
}

export function getSystemTemplateProfileName(value: UserRole | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return SYSTEM_TEMPLATE_PROFILE_NAMES[value] ?? null;
}

export function getAccessProfileDisplayName(profile: AccessProfileNameSource): string {
  if (!profile.isSystem) {
    return profile.name;
  }

  return getSystemTemplateProfileName(profile.baseRoleConstraint) ?? profile.name;
}
