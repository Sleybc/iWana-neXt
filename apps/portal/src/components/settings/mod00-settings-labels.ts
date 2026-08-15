import {
  AccessPermissionAvailability,
  BusinessHoursWeekday,
  OrganizationSiteCapability,
  OrganizationSiteType,
  type SettingsPriorityKey,
} from '@iwana/shared';

export const ORGANIZATION_SITE_TYPE_LABELS: Record<OrganizationSiteType, string> = {
  [OrganizationSiteType.OFFICE]: 'Oficina',
  [OrganizationSiteType.WAREHOUSE]: 'Bodega',
  [OrganizationSiteType.TECH_BASE]: 'Base técnica',
  [OrganizationSiteType.CUSTOMER_SERVICE]: 'Atención al cliente',
  [OrganizationSiteType.COLLECTION_POINT]: 'Punto de recaudo',
  [OrganizationSiteType.NOC]: 'Monitoreo operativo',
  [OrganizationSiteType.MIXED]: 'Sede mixta',
};

export const ORGANIZATION_SITE_CAPABILITY_LABELS: Record<OrganizationSiteCapability, string> = {
  [OrganizationSiteCapability.CUSTOMER_SERVICE]: 'Atención al cliente',
  [OrganizationSiteCapability.TECH_DISPATCH]: 'Despacho técnico',
  [OrganizationSiteCapability.WAREHOUSE]: 'Bodega',
  [OrganizationSiteCapability.COLLECTION_POINT]: 'Recaudo',
  [OrganizationSiteCapability.ADMIN_OFFICE]: 'Gestión administrativa',
  [OrganizationSiteCapability.NOC]: 'Monitoreo operativo',
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
  pageSubtitle: 'Revisa y administra las áreas clave de tu empresa desde un solo lugar.',
  sessionUnavailable: 'No pudimos validar tu sesión en el portal.',
  registryForbidden:
    'Tu perfil puede entrar a esta vista, pero todavía no tiene acceso a las secciones disponibles.',
  registryUnavailable: 'No fue posible cargar las opciones de configuración.',
  permissionsForbidden: 'No pudimos confirmar qué secciones puedes usar con esta cuenta.',
  permissionsUnavailable: 'No fue posible validar los accesos de esta cuenta.',
  priorityEyebrow: 'Recomendado ahora',
  panelEyebrow: 'Configuración',
  panelTitle: 'Secciones de configuración',
  panelDescription:
    'Aquí encontrarás las áreas que puedes consultar o administrar dentro del portal.',
  restrictedMessage:
    'Tu perfil no puede administrar esta área ahora. Solicita apoyo a una persona administradora si necesitas usarla.',
  emptyTitle: 'Aún no hay secciones disponibles',
  emptyDescription:
    'Cuando haya nuevas opciones de configuración para tu empresa, aparecerán aquí.',
  unavailableDescription: 'Esta sección todavía no está lista para usarse en el portal.',
  futureEyebrow: 'Más opciones',
  futureTitle: 'Próximas capacidades',
  futureDescription: 'Estas áreas aparecerán aquí cuando estén listas para usarse en el portal.',
  retryAction: 'Reintentar',
  openSectionAction: 'Abrir sección',
} as const;

export const SETTINGS_PRIORITY_COPY: Record<
  SettingsPriorityKey,
  { title: string; description: string; actionLabel: string }
> = {
  MFA_POLICY_DISABLED: {
    title: 'Activa la verificación en dos pasos',
    description:
      'Protege el acceso de toda la empresa haciendo obligatoria la verificación en dos pasos.',
    actionLabel: 'Configurar verificación',
  },
  MFA_ENROLLMENT_INCOMPLETE: {
    title: 'Completa la verificación del equipo',
    description: 'Aún hay personas activas sin verificación en dos pasos.',
    actionLabel: 'Revisar autenticación',
  },
  NO_ACTIVE_ORGANIZATION_SITE: {
    title: 'Registra una sede activa',
    description: 'La empresa necesita al menos una sede activa para organizar su operación.',
    actionLabel: 'Revisar sedes',
  },
  COMPANY_HOURS_NOT_CONFIGURED: {
    title: 'Define el horario de la empresa',
    description: 'Configura al menos un día abierto para orientar jornadas y atención.',
    actionLabel: 'Configurar horario',
  },
  BRANDING_NOT_CUSTOMIZED: {
    title: 'Personaliza la marca de tu empresa',
    description: 'Añade los recursos visuales que identificarán a tu empresa en el portal.',
    actionLabel: 'Revisar marca',
  },
};

export const SETTINGS_HUB_SECTION_COPY: Partial<
  Record<
    string,
    {
      title: string;
      description: string;
      actionLabel?: string;
      emphasis?: 'primary' | 'secondary';
    }
  >
> = {
  organization: {
    title: 'Perfil empresarial y organización',
    description: 'Datos de la empresa, configuración base y sedes registradas.',
    actionLabel: 'Revisar empresa',
    emphasis: 'primary',
  },
  access: {
    title: 'Perfiles y autenticación',
    description: 'Perfiles de acceso, autenticación y control de quién puede usar cada área.',
    actionLabel: 'Revisar perfiles y autenticación',
    emphasis: 'primary',
  },
  calendar: {
    title: 'Calendario operativo y jornadas',
    description: 'Horarios de atención, jornadas por sede y cambios puntuales de operación.',
    actionLabel: 'Revisar calendario',
    emphasis: 'secondary',
  },
  branding: {
    title: 'Marca',
    description: 'Imagen institucional y activos visuales de la empresa.',
    actionLabel: 'Revisar marca',
    emphasis: 'secondary',
  },
  billing: {
    title: 'Facturación',
    description:
      'Aquí podrás revisar y ajustar la configuración de facturación cuando esta capacidad esté disponible.',
  },
  inventory: {
    title: 'Inventario',
    description:
      'Aquí podrás administrar reglas y parámetros de inventario cuando esta capacidad esté disponible.',
  },
  integrations: {
    title: 'Integraciones',
    description:
      'Aquí podrás conectar y revisar integraciones empresariales cuando estén habilitadas.',
  },
};

export const ACCESS_SETTINGS_COPY = {
  pageTitle: 'Perfiles de acceso y autenticación',
  loadingSubtitle: 'Cargando perfiles de acceso y sus accesos',
  restrictedTitle: 'Vista disponible para administradores',
  restrictedDescription: 'Solo las personas administradoras pueden acceder a esta sección.',
  pageSubtitle:
    'Administra perfiles de acceso, plantillas iniciales y la verificación en dos pasos (MFA) global de tu empresa desde un solo lugar.',
  authPolicyEyebrow: 'Políticas de autenticación',
  authPolicyTitle: 'Verificación en dos pasos global',
  authPolicyDescription:
    'Define si toda la empresa debe configurar verificación en dos pasos antes de entrar al portal.',
  authPolicyToggleTitle: 'Verificación en dos pasos obligatoria para toda la empresa',
  authPolicyToggleLabel: 'Activar verificación en dos pasos obligatoria',
  authPolicyToggleDescription:
    'Si se activa, cada persona deberá verificar su identidad antes de entrar al portal.',
  authPolicyStatusEnabled: 'Verificación en dos pasos global activa',
  authPolicyStatusDisabled: 'Verificación en dos pasos global opcional',
  authPolicySaveAction: 'Guardar política',
  authPolicySaveSuccess: 'Política de verificación en dos pasos actualizada correctamente.',
  authPolicyLoadError: 'No fue posible cargar la política de verificación en dos pasos.',
  authPolicySaveError:
    'No fue posible guardar la política de verificación en dos pasos. Intenta de nuevo.',
  authPolicyAdminHint:
    'Este ajuste aplica a toda la empresa y solo puede cambiarlo un administrador.',
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

export const OPERATIONAL_EVENTUALITY_TYPE_LABELS = {
  extra_availability: 'Disponibilidad extra',
  operational_block: 'Cierre temporal',
  early_entry: 'Entrada anticipada',
  extended_shift: 'Extensión de horario',
  emergency_response: 'Atención de emergencia',
} as const;

export const OPERATIONAL_EVENTUALITY_STATUS_LABELS = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  cancelled: 'Cancelada',
} as const;

export const CALENDAR_SETTINGS_COPY = {
  pageTitle: 'Calendario operativo y jornadas',
  loadingSubtitle: 'Cargando tu calendario',
  pageSubtitle:
    'Ordena el horario base de tu empresa y luego ajusta sedes, cierres por fecha y cambios puntuales desde una sola vista.',
  pageStatusEyebrow: 'Estado operativo',
  pagePartialStatus:
    'Algunos bloques no se pudieron cargar. Actualiza la vista antes de confirmar el estado operativo o guardar cambios.',
  refreshAction: 'Actualizar',
  sessionUnavailableSubtitle: 'Sesión no disponible',
  sessionUnavailableTitle: 'No fue posible abrir la vista',
  sessionUnavailableDescription: 'Inicia sesión nuevamente para consultar esta sección.',
  restrictedSubtitle: 'Acceso restringido',
  restrictedTitle: 'Sin autorización',
  restrictedDescription: 'Tu rol no puede consultar el calendario operativo.',
  organizationEyebrow: 'Paso 1 · Horario base',
  organizationTitle: 'Horario base de la empresa',
  organizationDescription:
    'Define el horario semanal que servirá como referencia para toda la empresa y para las sedes que no tengan un ajuste propio.',
  organizationStatusTitle: 'Horario de referencia activo',
  organizationStatusDescription:
    'Las sedes sin ajuste propio usarán este horario como base operativa.',
  organizationSaveAction: 'Guardar horario general',
  organizationSaveSuccess: 'Horario general actualizado correctamente.',
  organizationSaveError: 'No fue posible guardar el horario general. Intenta nuevamente.',
  organizationLoadError:
    'No pudimos cargar el horario base. Este bloque queda bloqueado hasta que vuelvas a actualizar.',
  siteEyebrow: 'Paso 2 · Horarios por sede',
  sitePanelTitle: 'Horarios por sede',
  sitePanelDescription:
    'Revisa qué sede sigue el horario base y cuál necesita un ajuste propio antes de guardar cambios.',
  siteSelectorLabel: 'Sede',
  siteSelectorHint:
    'Elige una sede para revisar si usa el horario base o si necesita un horario propio.',
  siteEmptyTitle: 'Sin sedes registradas',
  siteEmptyDescription: 'Crea al menos una sede para configurar su horario.',
  siteDetailLoadError: 'No fue posible cargar el detalle de la sede. Intenta nuevamente.',
  siteDetailRetryAction: 'Reintentar detalle de la sede',
  siteLoadingStatus: 'Cargando detalle de la sede seleccionada.',
  siteSaveAction: 'Guardar horario de la sede',
  siteSaveSuccess: 'Horario personalizado guardado correctamente.',
  siteSaveError: 'No fue posible guardar el horario personalizado. Intenta nuevamente.',
  siteLoadError:
    'No pudimos cargar las sedes. Este bloque queda bloqueado hasta que vuelvas a actualizar.',
  siteClearConfirm:
    '¿Quitar el horario personalizado? Esta sede volverá a usar el horario general de la empresa.',
  siteClearAction: 'Volver al horario base',
  siteClearSuccess: 'La sede volvió a usar el horario general de la empresa.',
  siteClearError: 'No fue posible quitar el horario personalizado. Intenta nuevamente.',
  siteOverrideActive: 'Horario personalizado activo: esta sede usa su propio horario.',
  siteOverrideInactive:
    'Sin horario personalizado: esta sede usa el horario general de la empresa. Configura los días para crear uno.',
  siteSelectedEyebrow: 'Sede seleccionada',
  siteSelectedTitle: (siteName: string, siteCode: string) => `${siteName} (${siteCode})`,
  siteOverrideAlertTitle: 'Horario propio activo',
  siteOverrideAlertDescription:
    'Los cambios que guardes aquí solo afectan a esta sede. Si ya no necesita un horario propio, puedes volver al horario base.',
  siteBaseAlertTitle: 'Usa el horario base',
  siteBaseAlertDescription:
    'Si guardas cambios en este bloque, crearás un horario propio solo para esta sede.',
  exceptionsEyebrow: 'Paso 3 · Cierres por fecha',
  exceptionsTitle: 'Cierres por fecha y aperturas especiales',
  exceptionsDescription:
    'Registra fechas concretas en las que la atención cambia por festivos, cierres o aperturas extraordinarias.',
  exceptionsCreateTitle: 'Registrar una fecha especial',
  exceptionsFormDescription:
    'Úsalo solo cuando necesites un cierre, festivo o apertura puntual. El listado sigue siendo la referencia principal.',
  exceptionsShowFormAction: 'Registrar fecha especial',
  exceptionsHideFormAction: 'Cancelar registro',
  exceptionsNameLabel: 'Nombre del cierre o apertura',
  exceptionsDateLabel: 'Fecha afectada',
  exceptionsSiteLabel: 'Sede afectada (opcional)',
  exceptionsSiteAllLabel: 'Todas las sedes',
  exceptionsOpenLabel: 'Abrir ese día',
  exceptionsRecurringLabel: 'Repetir cada año',
  exceptionsOpensAtLabel: 'Desde',
  exceptionsClosesAtLabel: 'Hasta',
  exceptionsNamePlaceholder: 'Ej: Día festivo nacional',
  exceptionsCreateAction: 'Agregar festivo o cierre',
  exceptionsCreated: 'Festivo o cierre especial creado correctamente.',
  exceptionsCreateError: 'No fue posible crear el festivo o cierre especial. Intenta nuevamente.',
  exceptionsOpenHoursRequired: 'Si abres ese día, define hora de inicio y de fin.',
  exceptionsOpenHoursOrder: 'La hora de cierre debe ser posterior a la hora de inicio.',
  exceptionsLoadError:
    'No pudimos cargar los cierres por fecha. Este bloque queda bloqueado hasta que vuelvas a actualizar.',
  exceptionsDeleteConfirm: '¿Eliminar este festivo o cierre especial?',
  exceptionsDeleted: 'Festivo o cierre especial eliminado.',
  exceptionsDeleteError:
    'No fue posible eliminar este festivo o cierre especial. Intenta nuevamente.',
  exceptionsDeleteAction: 'Eliminar',
  exceptionsTableNameColumn: 'Nombre',
  exceptionsTableDateColumn: 'Fecha',
  exceptionsTableStatusColumn: 'Estado',
  exceptionsTableSiteColumn: 'Sede',
  exceptionsTableActionColumn: 'Acción',
  exceptionsRecurringBadge: 'Recurrente anual',
  exceptionsOpenStatus: 'Abierto',
  exceptionsClosedStatus: 'Cerrado',
  exceptionsEmptyTitle: 'Sin festivos ni cierres especiales',
  exceptionsEmptyDescription: 'No hay festivos ni cierres especiales registrados para tu empresa.',
  eventualitiesEyebrow: 'Paso 4 · Cambios puntuales',
  eventualitiesTitle: 'Cambios puntuales de disponibilidad',
  eventualitiesDescription:
    'Registra ajustes temporales para personas o turnos sin alterar el horario base de la empresa.',
  eventualitiesLoadingStatus: 'Cargando cambios puntuales de disponibilidad.',
  eventualitiesLoadError:
    'No se pudieron cargar los cambios puntuales de disponibilidad. Intenta de nuevo.',
  eventualitiesUsersUnavailableTitle: 'Directorio de personal no disponible',
  eventualitiesUsersUnavailableDescription:
    'Puedes revisar la lista actual, pero espera a que esta vista se actualice antes de registrar un nuevo cambio puntual.',
  eventualitiesValidationRequired: 'Completa los campos obligatorios.',
  eventualitiesValidationDates: 'La fecha de inicio debe ser anterior a la fecha de fin.',
  eventualitiesFormTitle: 'Registrar un cambio puntual',
  eventualitiesFormDescription:
    'Úsalo cuando necesites ajustar una persona o un turno fuera del horario habitual. El listado sigue siendo la referencia principal.',
  eventualitiesShowFormAction: 'Registrar cambio puntual',
  eventualitiesHideFormAction: 'Cancelar registro',
  eventualitiesTableUserColumn: 'Personal',
  eventualitiesTableTypeColumn: 'Tipo',
  eventualitiesTableStartsAtColumn: 'Inicio',
  eventualitiesTableEndsAtColumn: 'Fin',
  eventualitiesTableStatusColumn: 'Estado',
  eventualitiesTableActionsColumn: 'Acciones',
  eventualitiesConfirmAction: 'Confirmar',
  eventualitiesCancelAction: 'Cancelar',
  eventualitiesDeleteAction: 'Eliminar',
  eventualitiesUnknownUserLabel: 'Persona no disponible',
  eventualitiesUserLabel: 'Persona afectada *',
  eventualitiesUserPlaceholder: 'Selecciona una persona',
  eventualitiesTypeLabel: 'Tipo de ajuste *',
  eventualitiesTypePlaceholder: 'Selecciona un tipo',
  eventualitiesStartsAtLabel: 'Inicio del cambio *',
  eventualitiesEndsAtLabel: 'Fin del cambio *',
  eventualitiesReasonLabel: 'Motivo operativo',
  eventualitiesReasonPlaceholder: 'Motivo (opcional)',
  eventualitiesOriginLabel: 'Origen del aviso',
  eventualitiesOriginPlaceholder: 'Origen (opcional)',
  eventualitiesRequiresReviewLabel: 'Requiere revisión administrativa',
  eventualitiesSaveAction: 'Guardar cambio',
  eventualitiesSavingAction: 'Guardando cambio…',
  eventualitiesCreated: 'Cambio puntual registrado.',
  eventualitiesCreateError: 'No se pudo registrar el cambio puntual.',
  eventualitiesConfirmed: 'Cambio puntual confirmado.',
  eventualitiesCancelled: 'Cambio puntual cancelado.',
  eventualitiesDeleted: 'Cambio puntual eliminado.',
  eventualitiesStatusError: 'No se pudo actualizar el estado.',
  eventualitiesDeleteConfirm: '¿Eliminar este cambio puntual de disponibilidad?',
  eventualitiesDeleteError: 'No se pudo eliminar el cambio puntual.',
  eventualitiesEmptyTitle: 'Sin cambios puntuales registrados',
  eventualitiesEmptyDescription: 'No hay cambios puntuales de disponibilidad registrados.',
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

export const BRANDING_SETTINGS_COPY = {
  pageTitle: 'Marca',
  loadingSubtitle: 'Cargando identidad visual de la empresa',
  errorSubtitle: 'Error al cargar la vista',
  pageSubtitle:
    'Administra la identidad visual, los activos y los textos públicos del portal empresarial.',
  sessionUnavailable: 'No fue posible resolver la sesión del portal.',
  authExpired: 'Tu sesión expiró. Inicia sesión nuevamente.',
  forbidden: 'No tienes permisos para consultar la marca de la empresa.',
  loadError: 'No fue posible cargar la configuración de marca.',
  formDescription: 'Administra los activos de marca y los textos públicos del portal empresarial.',
  logoDescription:
    'Se usa en el acceso público y en superficies de identificación extendida de la empresa.',
  loginBackgroundDescription:
    'Se usa como acento visual del acceso público del portal para reforzar la identidad de la empresa.',
  faviconAlt: 'Favicon de la empresa',
  showCompanyNameDescription:
    'Si se desactiva, el menú mostrará solo el sello sin texto. El acceso público seguirá la política configurada para mostrar el nombre comercial.',
  identitySectionDescription:
    'Definen cómo aparece tu empresa en el navegador y en la comunicación pública del portal.',
  productHelperText: 'Nombre visible de la empresa en el acceso público.',
} as const;

export const ORGANIZATION_SETTINGS_COPY = {
  pageTitle: 'Perfil empresarial y organización',
  pageSubtitle: 'Gestiona los datos de tu empresa, ajustes generales y sedes.',
  companyProfileTitle: 'Perfil empresarial',
  companyProfileDescription: 'Datos legales y de contacto de la empresa.',
  companyProfileContactSection: 'Perfil y contacto',
  companyProfileIdentitySection: 'Identificación y ubicación',
  companyProfileSaveSuccess: 'Perfil empresarial actualizado correctamente.',
  companyProfileSaveError: 'No fue posible guardar el perfil empresarial. Intenta de nuevo.',
  companyProfileErrorTitle: 'No fue posible guardar el perfil',
  companyProfileSuccessTitle: 'Perfil actualizado',
  companyProfileEditableHint: 'Solo se guardan los campos que puedes editar en esta sección.',
  companyProfileReadOnlyHint: 'Tu rol tiene acceso solo lectura sobre esta sección.',
  companyProfileSaveAction: 'Guardar perfil empresarial',
  operationalTitle: 'Configuración operativa',
  operationalDescription: 'Región, idioma y moneda base del portal.',
  operationalLocationSection: 'Ubicación',
  operationalPreferencesSection: 'Preferencias',
  operationalTimezoneLabel: 'Zona horaria',
  operationalCountryLabel: 'País operativo',
  operationalLanguageLabel: 'Idioma',
  operationalCurrencyLabel: 'Moneda',
  operationalReadOnlyHint: 'Puedes consultar esta información, pero no cambiarla.',
  operationalEditableHint: 'Los cambios se aplicarán de inmediato al portal.',
  operationalSaveSuccess: 'Configuración operativa actualizada correctamente.',
  operationalSaveError: 'No fue posible guardar la configuración operativa. Intenta de nuevo.',
  operationalErrorTitle: 'No fue posible guardar la configuración',
  operationalSuccessTitle: 'Configuración actualizada',
  operationalSaveAction: 'Guardar configuración operativa',
  sitesPanelTitle: 'Sedes registradas',
  sitesPanelDescription: 'Revisa y administra las sedes de tu empresa.',
  emptySitesTitle: 'Sin sedes registradas',
  emptySitesDescription: 'Todavía no hay sedes creadas.',
  createSiteAction: 'Crear sede',
  createFirstSiteAction: 'Crear primera sede',
  noServices: 'Sin servicios activos',
  activeStatus: 'Activa',
  inactiveStatus: 'Inactiva',
  noActions: 'Sin acciones disponibles',
  editSiteAction: 'Editar sede',
  deactivateSiteAction: 'Dar de baja sede',
  createDialogTitle: 'Crear sede',
  editDialogTitle: 'Editar sede',
  createDialogDescription:
    'Registra una nueva sede para tu empresa y define sus servicios activos.',
  editDialogDescription:
    'Actualiza la información principal y los servicios de la sede seleccionada.',
  informationTab: 'Información de la sede',
  servicesTab: 'Servicios',
} as const;

export const SETTINGS_ACCESS_SHORTCUTS_COPY = {
  eyebrow: 'Configuración',
  title: 'Rutas rápidas de configuración',
  description:
    'Usa estas rutas para entrar a Empresa y organización, Operaciones de campo y Perfiles de acceso sin salir del centro de configuración.',
  administrationBadge: 'Administración',
  readOnlyBadge: 'Consulta',
  cards: {
    organization: {
      title: 'Empresa y organización',
      description: 'Consulta sedes, servicios disponibles y horario institucional de la empresa.',
    },
    access: {
      title: 'Perfiles de acceso',
      description: 'Administra perfiles de acceso, plantillas iniciales y accesos por sección.',
    },
    fieldOperations: {
      title: 'Operaciones de campo',
      description:
        'Abre la configuración operativa de las operaciones de campo y consulta la referencia de despacho técnico sin salir del centro de configuración.',
    },
  },
} as const;

export const WFM_SETTINGS_COPY = {
  loadError: 'No fue posible cargar la configuración de horarios.',
  companyWeekSaved: 'El horario de visitas fue actualizado correctamente.',
  blackoutsSaved: 'Los cierres que bloquean visitas ya fueron actualizados.',
  blackoutsDeleted: 'La lista de cierres que bloquean visitas fue actualizada.',
  contextTitle: 'Este bloque solo afecta visitas programadas',
  contextDescription:
    'Los cambios que hagas aquí aplican a la agenda de visitas técnicas. El horario base de la empresa se sigue gestionando en los pasos anteriores.',
  readOnlyDescription: 'Tu rol puede consultar estos horarios, pero no modificarlos.',
  companyWeekEyebrow: 'Semana operativa',
  companyWeekTitle: 'Horario operativo para visitas',
  companyWeekDescription: 'Define los días y horas disponibles para programar visitas.',
  companyWeekHint: 'Los días desmarcados no tendrán citas disponibles.',
  companyWeekSaveAction: 'Guardar horarios',
  blackoutsEyebrow: 'Cierres y bloqueos',
  blackoutsTitle: 'Cierres que bloquean visitas',
  blackoutsDescription:
    'Bloquea fechas para toda la empresa o para una sede cuando no deba haber citas disponibles.',
  blackoutsEmptyDescription:
    'Registra festivos, cierres por sede o mantenimientos cuando corresponda.',
  blackoutsFormTitle: 'Registrar un cierre para visitas',
  blackoutsShowFormAction: 'Registrar cierre',
  blackoutsHideFormAction: 'Cancelar registro',
  blackoutsFormHelper:
    'Usa este registro solo cuando necesites bloquear visitas por una fecha puntual o recurrente.',
  blackoutsSitesUnavailableTitle: 'Sedes de visitas no disponibles',
  blackoutsSitesUnavailableDescription:
    'No pudimos cargar las sedes de visitas. Revisa la lista actual, pero espera a que esta vista se actualice antes de registrar o editar cierres por sede.',
  blackoutsUnavailableSiteLabel: 'Sede no disponible en esta carga',
  recurringBadge: 'Cada año',
  oneTimeBadge: 'Una vez',
  blackoutFormDescription: 'En estas fechas no habrá citas disponibles para reservar.',
  blackoutDeleteConfirm: (name: string) => `¿Eliminar el cierre ${name}?`,
  blackoutInactiveBadge: 'Inactivo',
  recurringCheckbox: 'Cada año',
} as const;

interface CalendarOperationalStatusInput {
  openDaysCount: number;
  activeSitesCount: number;
  exceptionCount: number;
}

function formatCalendarCount(value: number, singular: string, plural: string): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

export function getCalendarOperationalStatusSummary({
  openDaysCount,
  activeSitesCount,
  exceptionCount,
}: CalendarOperationalStatusInput): string {
  return [
    formatCalendarCount(
      openDaysCount,
      'día abierto en horario base',
      'días abiertos en horario base',
    ),
    formatCalendarCount(activeSitesCount, 'sede activa', 'sedes activas'),
    formatCalendarCount(
      exceptionCount,
      'cierre por fecha registrado',
      'cierres por fecha registrados',
    ),
  ]
    .join(', ')
    .replace(/, ([^,]*)$/, ' y $1.');
}

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
