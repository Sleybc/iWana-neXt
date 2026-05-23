import {
  AccessPermissionAvailability,
  BusinessHoursWeekday,
  OrganizationSiteCapability,
  OrganizationSiteType,
} from '@iwana/shared';

export const ORGANIZATION_SITE_TYPE_LABELS: Record<OrganizationSiteType, string> = {
  [OrganizationSiteType.OFFICE]: 'Oficina',
  [OrganizationSiteType.WAREHOUSE]: 'Bodega',
  [OrganizationSiteType.TECH_BASE]: 'Base técnica',
  [OrganizationSiteType.CUSTOMER_SERVICE]: 'Atención al cliente',
  [OrganizationSiteType.COLLECTION_POINT]: 'Punto de recaudo',
  [OrganizationSiteType.NOC]: 'Centro NOC',
  [OrganizationSiteType.MIXED]: 'Sede mixta',
};

export const ORGANIZATION_SITE_CAPABILITY_LABELS: Record<OrganizationSiteCapability, string> = {
  [OrganizationSiteCapability.CUSTOMER_SERVICE]: 'Atención al cliente',
  [OrganizationSiteCapability.TECH_DISPATCH]: 'Despacho técnico',
  [OrganizationSiteCapability.WAREHOUSE]: 'Bodega',
  [OrganizationSiteCapability.COLLECTION_POINT]: 'Recaudo',
  [OrganizationSiteCapability.ADMIN_OFFICE]: 'Gestión administrativa',
  [OrganizationSiteCapability.NOC]: 'Operación NOC',
  [OrganizationSiteCapability.SALES_OFFICE]: 'Ventas',
};

export const BUSINESS_HOURS_WEEKDAY_LABELS: Record<BusinessHoursWeekday, string> = {
  [BusinessHoursWeekday.MONDAY]: 'Lunes',
  [BusinessHoursWeekday.TUESDAY]: 'Martes',
  [BusinessHoursWeekday.WEDNESDAY]: 'Miércoles',
  [BusinessHoursWeekday.THURSDAY]: 'Jueves',
  [BusinessHoursWeekday.FRIDAY]: 'Viernes',
  [BusinessHoursWeekday.SATURDAY]: 'Sábado',
  [BusinessHoursWeekday.SUNDAY]: 'Domingo',
};

export const BUSINESS_HOURS_WEEKDAY_ORDER: BusinessHoursWeekday[] = [
  BusinessHoursWeekday.MONDAY,
  BusinessHoursWeekday.TUESDAY,
  BusinessHoursWeekday.WEDNESDAY,
  BusinessHoursWeekday.THURSDAY,
  BusinessHoursWeekday.FRIDAY,
  BusinessHoursWeekday.SATURDAY,
  BusinessHoursWeekday.SUNDAY,
];

export const ACCESS_PERMISSION_AVAILABILITY_LABELS: Record<AccessPermissionAvailability, string> = {
  [AccessPermissionAvailability.ASSIGNABLE]: 'Disponible',
  [AccessPermissionAvailability.RESERVED]: 'Reservado',
};

export function getOrganizationSiteTypeLabel(value: OrganizationSiteType): string {
  return ORGANIZATION_SITE_TYPE_LABELS[value] ?? value;
}

export function getOrganizationSiteCapabilityLabel(value: OrganizationSiteCapability): string {
  return ORGANIZATION_SITE_CAPABILITY_LABELS[value] ?? value;
}

export function getBusinessHoursWeekdayLabel(value: BusinessHoursWeekday): string {
  return BUSINESS_HOURS_WEEKDAY_LABELS[value] ?? value;
}

export function getAccessPermissionAvailabilityLabel(value: AccessPermissionAvailability): string {
  return ACCESS_PERMISSION_AVAILABILITY_LABELS[value] ?? value;
}

export function getAccessModuleLabel(moduleKey: string): string {
  const labels: Record<string, string> = {
    settings: 'Configuración',
    organization: 'Organización',
    users: 'Usuarios',
    access: 'Acceso',
    wfm: 'WFM',
    crm: 'CRM',
    commercial: 'Comercial',
    assurance: 'Mesa de ayuda',
    inventory: 'Inventario',
    billing: 'Facturación',
  };

  return labels[moduleKey] ?? moduleKey;
}
