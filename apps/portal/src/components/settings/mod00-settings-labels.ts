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

export const SETTINGS_HUB_COPY = {
  pageTitle: 'Configuración empresarial',
  loadingSubtitle: 'Cargando opciones de configuración',
  errorSubtitle: 'No pudimos cargar esta vista',
  pageSubtitle: 'Elige una sección para consultar o administrar la configuración de tu empresa.',
  sessionUnavailable: 'No pudimos validar tu sesión en el portal.',
  registryForbidden:
    'Tu perfil puede entrar a esta vista, pero todavía no tiene acceso a las secciones disponibles.',
  registryUnavailable: 'No fue posible cargar las opciones de configuración.',
  permissionsForbidden: 'No pudimos confirmar qué secciones puedes usar con esta cuenta.',
  permissionsUnavailable: 'No fue posible validar los accesos de esta cuenta.',
  panelEyebrow: 'Configuración',
  panelTitle: 'Secciones de configuración',
  panelDescription:
    'Aquí encontrarás las áreas que puedes consultar o administrar dentro del portal.',
  restrictedMessage: 'Tu perfil no tiene acceso a esta sección.',
  emptyTitle: 'Aún no hay secciones disponibles',
  emptyDescription:
    'Cuando haya nuevas opciones de configuración para tu empresa, aparecerán aquí.',
  unavailableDescription: 'Esta sección todavía no está lista para usarse en el portal.',
  retryAction: 'Reintentar',
  openSectionAction: 'Abrir sección',
} as const;

export const ACCESS_SETTINGS_COPY = {
  pageTitle: 'Perfiles de acceso',
  loadingSubtitle: 'Cargando perfiles de acceso y sus accesos',
  restrictedTitle: 'Vista disponible para administradores',
  restrictedDescription: 'Solo las personas administradoras pueden acceder a esta sección.',
  pageSubtitle:
    'Crea perfiles de acceso, define lo que puede usar cada uno y apóyate en perfiles sugeridos para empezar más rápido.',
  templatesTitle: 'Plantillas iniciales',
  templatesDescription:
    'Estas plantillas del sistema te dan un punto de partida para crear o ajustar perfiles de acceso.',
  profilesDescription: 'Crea perfiles propios para tu empresa y define qué puede hacer cada uno.',
  profilesEmptyDescription:
    'Cuando crees tu primer perfil, aparecerá aquí para que puedas editarlo y revisar sus accesos.',
  roleColumnLabel: 'Categoría base',
  selectedProfileDescription: (profileName: string) =>
    `Administra por sección lo que puede ver o hacer ${profileName}.`,
  draftBannerTitle: 'Nuevo perfil en preparación',
  draftBannerDescription: (sourceName: string | null) =>
    sourceName
      ? `Estás creando un nuevo perfil basado en ${sourceName}. Los accesos de esa plantilla ya están activos y puedes ajustar el resto antes de guardarlo.`
      : 'Estás creando un nuevo perfil. Revisa sus datos y ajusta sus accesos antes de guardarlo.',
  draftSelectedProfileDescription: (profileName: string) =>
    `Revisa por sección los accesos activos de la plantilla y suma los que necesite el nuevo perfil ${profileName}.`,
  noCompatiblePermissionsTitle: 'Sin accesos disponibles',
  noCompatiblePermissionsDescription: 'No hay accesos activos para mostrar en este momento.',
  noProfileSelectedDescription: 'Elige un perfil de la lista para revisar o cambiar sus accesos.',
  editProfileDescription:
    'Modifica el nombre, la descripción y la categoría base permitida para este perfil.',
  createProfileDescription:
    'Crea un perfil de acceso para organizar lo que cada equipo puede ver o usar.',
  roleFieldLabel: 'Categoría base permitida',
} as const;

export const SECURITY_SETTINGS_COPY = {
  loadingSubtitle: 'Cargando configuración de seguridad',
  pageSubtitle: 'Configura la autenticación de dos factores y revisa las opciones de seguridad.',
  panelDescription: 'Autenticación de dos factores y opciones de seguridad.',
  unavailableMessage: 'No fue posible cargar la configuración de seguridad.',
  billingEnabled: 'Activa',
  billingDisabled: 'Inactiva',
  billingDescription: 'Esta opción se administra centralmente y no puede cambiarse aquí.',
  subscribersLabel: 'Límite de suscriptores',
  subscribersTitle: 'Gestionado por nuestro equipo',
  subscribersDescription:
    'El número máximo de suscriptores y otras opciones comerciales se administran fuera de esta pantalla.',
  adminHint: 'Solo los administradores pueden cambiar esta configuración.',
  readOnlyHint: 'Puedes consultar esta configuración, pero no cambiarla.',
  saveAction: 'Guardar cambios',
  successMessage: 'Configuración de seguridad actualizada correctamente.',
  errorMessage: 'No fue posible guardar la configuración de seguridad. Intenta de nuevo.',
} as const;

export const CALENDAR_SETTINGS_COPY = {
  loadingSubtitle: 'Cargando tu calendario',
  pageSubtitle:
    'Define el horario general de tu organización, ajustes por sede y festivos especiales.',
  organizationTitle: 'Horario general de atención y recaudo',
  organizationDescription:
    'Horario semanal general para toda la organización. Las sedes que no tengan horario propio usarán este horario automáticamente.',
  organizationSaveAction: 'Guardar horario general',
  organizationSaveSuccess: 'Horario general actualizado correctamente.',
  organizationSaveError: 'No fue posible guardar el horario general. Intenta nuevamente.',
  sitePanelDescription: 'Elige si una sede usa el horario general o tiene su propio horario.',
  siteEmptyDescription: 'Crea al menos una sede para configurar su horario.',
  siteSaveAction: 'Guardar horario de la sede',
  siteSaveSuccess: 'Horario personalizado guardado correctamente.',
  siteSaveError: 'No fue posible guardar el horario personalizado. Intenta nuevamente.',
  siteClearConfirm:
    '¿Quitar el horario personalizado? Esta sede volverá a usar el horario general de la organización.',
  siteClearSuccess: 'La sede volvió a usar el horario general de la organización.',
  siteClearError: 'No fue posible quitar el horario personalizado. Intenta nuevamente.',
  siteOverrideActive: 'Horario personalizado activo: esta sede usa su propio horario.',
  siteOverrideInactive:
    'Sin horario personalizado: esta sede usa el horario general de la organización. Configura los días para crear uno.',
  exceptionsCreateTitle: 'Registrar nuevo festivo o cierre especial',
  exceptionsCreateAction: 'Agregar festivo o cierre',
  exceptionsCreated: 'Festivo o cierre especial creado correctamente.',
  exceptionsCreateError: 'No fue posible crear el festivo o cierre especial. Intenta nuevamente.',
  exceptionsDeleteConfirm: '¿Eliminar este festivo o cierre especial?',
  exceptionsDeleted: 'Festivo o cierre especial eliminado.',
  exceptionsDeleteError:
    'No fue posible eliminar este festivo o cierre especial. Intenta nuevamente.',
  exceptionsEmptyTitle: 'Sin festivos ni cierres especiales',
  exceptionsEmptyDescription:
    'No hay festivos ni cierres especiales registrados para tu organización.',
} as const;

export const FIELD_OPERATIONS_SETTINGS_COPY = {
  pageTitle: 'Operaciones de campo',
  loadingSubtitle: 'Cargando horarios y cierres del calendario',
  authRequiredSubtitle: 'Acceso requerido',
  authRequiredDescription:
    'No pudimos iniciar tu sesión. Recarga la página o intenta de nuevo para continuar.',
  pageSubtitle: 'Consulta o ajusta los horarios y cierres de las operaciones de campo.',
  panelTitle: 'Horarios y jornadas',
  panelDescription:
    'Los horarios generales, cambios por sede y cierres especiales se gestionan en el Calendario operativo.',
  canEditHint: 'Edita horarios y cierres desde el Calendario operativo.',
  readOnlyHint: 'Consulta los horarios y cierres en el Calendario operativo.',
  helperText: 'Horario general, cambios por sede y festivos especiales.',
} as const;

export const WFM_SETTINGS_COPY = {
  loadError: 'No fue posible cargar la configuración de horarios.',
  companyWeekSaved: 'Los horarios fueron guardados correctamente.',
  blackoutsSaved: 'Los festivos y cierres especiales ya fueron actualizados.',
  blackoutsDeleted: 'La lista de festivos y cierres especiales fue actualizada.',
  headerEyebrow: 'Programación de visitas',
  headerDescription:
    'Administra los horarios de trabajo y los cierres especiales para la programación de visitas.',
  readOnlyDescription: 'Tu rol puede consultar estos horarios, pero no modificarlos.',
  companyWeekTitle: 'Horario de atención para visitas',
  companyWeekDescription: 'Define los días y horas disponibles para programar visitas.',
  companyWeekHint: 'Los días desmarcados no tendrán citas disponibles.',
  companyWeekSaveAction: 'Guardar horarios',
  blackoutsTitle: 'Festivos y días sin disponibilidad',
  blackoutsDescription:
    'Bloquea fechas para toda la empresa o para una sede cuando no deba haber citas disponibles.',
  blackoutsEmptyDescription:
    'Registra festivos, cierres por sede o mantenimientos cuando corresponda.',
  recurringBadge: 'Cada año',
  oneTimeBadge: 'Una vez',
  blackoutFormDescription: 'En estas fechas no habrá citas disponibles para reservar.',
  recurringCheckbox: 'Cada año',
} as const;

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
    'access-control': 'Control de acceso',
    wfm: 'Operaciones de campo',
    crm: 'CRM',
    commercial: 'Comercial',
    assurance: 'Mesa de ayuda',
    inventory: 'Inventario',
    billing: 'Facturación',
  };

  return labels[moduleKey] ?? moduleKey;
}
