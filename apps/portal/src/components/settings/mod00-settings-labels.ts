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
  pageTitle: 'Perfiles de acceso',
  loadingSubtitle: 'Cargando perfiles de acceso y sus accesos',
  restrictedTitle: 'Vista disponible para administradores',
  restrictedDescription: 'Solo las personas administradoras pueden acceder a esta sección.',
  pageSubtitle:
    'Crea perfiles de acceso, define lo que puede usar cada uno y apóyate en perfiles sugeridos para empezar más rápido.',
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
  authPolicyForbiddenError:
    'Solo las personas administradoras pueden cambiar la política de autenticación.',
  authPolicyAdminHint:
    'Este ajuste aplica a toda la empresa y solo puede cambiarlo un administrador.',
  templatesTitle: 'Perfiles sugeridos',
  templatesDescription:
    'Estos perfiles sugeridos te ayudan a crear nuevos perfiles de acceso con menos trabajo manual.',
  templateFallbackDescription: 'Perfil sugerido',
  profilesTitle: 'Perfiles personalizados',
  profilesDescription: 'Crea perfiles propios para tu empresa y define qué puede hacer cada uno.',
  profilesEmptyTitle: 'Aún no has creado perfiles personalizados',
  profilesEmptyDescription:
    'Cuando crees tu primer perfil, aparecerá aquí para que puedas editarlo y revisar sus accesos.',
  createProfileAction: 'Crear perfil',
  createFromTemplateAction: 'Crear a partir de este perfil',
  previewAction: 'Ver lo que permite',
  useSuggestedSelector: 'Usar un perfil sugerido',
  useSuggestedHelp: 'Empieza con un perfil sugerido y ajusta solo lo necesario.',
  startFromScratchLabel: 'Empezar desde cero',
  startFromScratchHelp: 'Crea el perfil desde cero y define sus accesos paso a paso.',
  chooseSuggestedFeedback:
    'Elige un perfil sugerido y pulsa «Crear a partir de este perfil» para comenzar.',
  peekEyebrow: 'Lo que permite este perfil',
  peekEmptyDescription: 'Sin accesos asignados a este perfil sugerido.',
  saveChangesAction: 'Guardar cambios',
  saveDraftAction: 'Guardar perfil',
  searchEmptyTitle: 'No encontramos accesos en esta sección',
  clearSearchAction: 'Limpiar búsqueda',
  permissionFallback: 'Acceso no descrito',
  keepProfileActiveLabel: 'Mantener perfil activo',
  retryAction: 'Reintentar',
  sessionExpiredError: 'Tu sesión expiró. Inicia sesión nuevamente.',
  forbiddenProfilesError: 'Solo las personas administradoras pueden gestionar perfiles de acceso.',
  loadProfilesError: 'No pudimos cargar los perfiles de acceso. Intenta nuevamente.',
  saveProfileError: 'No pudimos guardar los cambios. Intenta nuevamente.',
  deleteProfileError: 'No pudimos eliminar el perfil. Intenta nuevamente.',
  deleteDialogTitle: (name: string) => `¿Eliminar el perfil «${name}»?`,
  deleteDialogDescription:
    'Las personas que lo tengan asignado dejarán de usarlo. Esta acción no se puede deshacer.',
  deleteConfirmAction: 'Eliminar perfil',
  cancelAction: 'Cancelar',
  roleColumnLabel: 'Tipo de usuario',
  selectedProfileDescription: (profileName: string) =>
    `Revisa lo que «${profileName}» puede ver o hacer en cada sección.`,
  draftBannerTitle: 'Nuevo perfil en preparación',
  draftBannerDescription: (sourceName: string | null) =>
    sourceName
      ? `Estás creando un nuevo perfil basado en ${sourceName}. Los accesos de ese perfil sugerido ya están activos y puedes ajustar el resto antes de guardarlo.`
      : 'Estás creando un nuevo perfil. Revisa sus datos y ajusta sus accesos antes de guardarlo.',
  draftSelectedProfileDescription: (profileName: string) =>
    `Revisa lo que «${profileName}» podrá ver o hacer en cada sección.`,
  noCompatiblePermissionsTitle: 'Sin accesos disponibles',
  noCompatiblePermissionsDescription: 'No hay accesos activos para mostrar en este momento.',
  noProfileSelectedDescription: 'Elige un perfil de la lista para revisar o cambiar sus accesos.',
  editProfileDescription:
    'Modifica el nombre, la descripción y el tipo de usuario permitido para este perfil.',
  createProfileDescription:
    'Crea un perfil de acceso para organizar lo que cada equipo puede ver o usar.',
  roleFieldLabel: 'Tipo de usuario permitido',
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
  calendarLoadingAnnouncement: 'Cargando calendario operativo',
  calendarLoadError: 'No fue posible cargar el calendario operativo. Intenta nuevamente.',
  calendarBlockUnavailableTitle: 'Bloque temporalmente no disponible',
  calendarLoadFailedTitle: 'No fue posible cargar el calendario',
  calendarRetryAction: 'Reintentar',
  sessionUnavailableSubtitle: 'Sesión no disponible',
  sessionUnavailableTitle: 'No fue posible abrir la vista',
  sessionUnavailableDescription: 'Inicia sesión nuevamente para consultar esta sección.',
  restrictedSubtitle: 'Acceso restringido',
  restrictedTitle: 'Sin autorización',
  restrictedDescription:
    'Tu perfil no puede consultar el calendario operativo. Solicita apoyo a una persona administradora si necesitas usarlo.',
  calendarReadOnlyHint: 'Tu perfil puede consultar estos horarios, pero no modificarlos.',
  organizationEyebrow: 'Paso 1 · Horario base',
  organizationTitle: 'Horario base de la empresa',
  organizationDescription:
    'Define el horario semanal que servirá como referencia para toda la empresa y para las sedes que no tengan un ajuste propio.',
  organizationStatusTitle: 'Referencia para las sedes',
  organizationStatusDescription:
    'Las sedes sin ajuste propio usarán este horario como base operativa.',
  organizationSaveAction: 'Guardar horario base',
  organizationSaveSuccess: 'Horario base actualizado correctamente.',
  organizationSaveError: 'No fue posible guardar el horario base. Intenta nuevamente.',
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
  siteEmptyReadOnlyDescription:
    'Aún no hay sedes registradas. Una persona administradora puede crear la primera.',
  siteDetailLoadError: 'No fue posible cargar el detalle de la sede. Intenta nuevamente.',
  siteDetailRetryAction: 'Reintentar detalle de la sede',
  siteLoadingStatus: 'Cargando detalle de la sede seleccionada.',
  siteSaveAction: 'Guardar horario de la sede',
  siteSaveSuccess: 'Horario personalizado guardado correctamente.',
  siteSaveError: 'No fue posible guardar el horario personalizado. Intenta nuevamente.',
  siteLoadError:
    'No pudimos cargar las sedes. Este bloque queda bloqueado hasta que vuelvas a actualizar.',
  siteClearAction: 'Volver al horario base',
  siteClearDialogTitle: '¿Quitar el horario personalizado?',
  siteClearDialogDescription:
    'Esta sede volverá a usar el horario base de la empresa. Podrás definir un horario propio de nuevo cuando lo necesites.',
  cancelAction: 'Cancelar',
  siteClearSuccess: 'La sede volvió a usar el horario base de la empresa.',
  siteClearError: 'No fue posible quitar el horario personalizado. Intenta nuevamente.',
  siteOverrideActive: 'Horario personalizado activo: esta sede usa su propio horario.',
  siteOverrideInactive:
    'Sin horario personalizado: esta sede usa el horario base de la empresa. Configura los días para crear uno.',
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
  exceptionsSiteUnavailableLabel: 'Sede no disponible',
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
  exceptionsOpenHoursHelper: 'Si marcas «Abrir ese día», define la hora de inicio y de fin.',
  exceptionsLoadError:
    'No pudimos cargar los cierres por fecha. Este bloque queda bloqueado hasta que vuelvas a actualizar.',
  exceptionsDeleteConfirm: '¿Eliminar este festivo o cierre especial?',
  exceptionsDeleteDialogDescription:
    'El festivo o cierre especial dejará de aplicarse en la fecha indicada. Esta acción no se puede deshacer.',
  exceptionsDeleted: 'Festivo o cierre especial eliminado.',
  exceptionsDeleteError:
    'No fue posible eliminar este festivo o cierre especial. Intenta nuevamente.',
  exceptionsDeleteAction: 'Eliminar',
  exceptionsTableNameColumn: 'Nombre',
  exceptionsTableDateColumn: 'Fecha',
  exceptionsTableStatusColumn: 'Estado',
  exceptionsTableSiteColumn: 'Sede',
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
  eventualitiesUnknownUserLabel: 'Registro sin persona asociada',
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
  eventualitiesDeleteDialogDescription:
    'El cambio puntual dejará de aplicarse a la persona o al turno afectado. Esta acción no se puede deshacer.',
  eventualitiesDeleteError: 'No se pudo eliminar el cambio puntual.',
  eventualitiesEmptyTitle: 'Sin cambios puntuales registrados',
  eventualitiesEmptyDescription: 'No hay cambios puntuales de disponibilidad registrados.',
  editorWeekdayColumn: 'Día',
  editorOpenColumn: 'Abierto',
  editorStartsAtColumn: 'Inicio',
  editorEndsAtColumn: 'Fin',
  editorOpenYesLabel: 'Sí',
  editorOpenNoLabel: 'No',
  editorStartsAtMobileLabel: 'Desde',
  editorEndsAtMobileLabel: 'Hasta',
  editorActiveStatusLabel: 'Horario activo',
  editorClosedDayStatusLabel: 'Día cerrado',
  editorOpenAriaSuffix: 'abierto',
  editorStartsAtAriaSuffix: 'desde',
  editorEndsAtAriaSuffix: 'hasta',
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
    'Los horarios base, cambios por sede y cierres especiales se gestionan en el Calendario operativo.',
  canEditHint: 'Edita horarios y cierres desde el Calendario operativo.',
  readOnlyHint: 'Consulta los horarios y cierres en el Calendario operativo.',
  helperText: 'Horario base, cambios por sede y festivos especiales.',
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
  slotSourcePrefix: 'Fuente actual: ',
  slotSourceUploaded: 'Activo subido',
  slotSourceExternalUrl: 'Enlace externo',
  slotSourceNone: 'Sin configurar',
  slotPrecedenceHint:
    'El archivo subido tiene prioridad sobre la URL. Subir un archivo lo aplica de inmediato; escribir una URL HTTPS lo aplica al guardar la marca.',
  slotUrlHelperText:
    'Déjalo vacío para conservar el archivo subido. Escribe una URL HTTPS y guarda la marca para aplicarla.',
  slotImageLoadErrorTitle: 'La imagen no está disponible',
  slotImageLoadErrorDescription: 'Revisa la URL de esta variante o sube un archivo nuevo.',
  readOnlyNoticeTitle: 'Consulta sin edición',
  readOnlyNoticeDescription:
    'Tu perfil puede consultar la marca de la empresa, pero no modificarla. Una persona administradora puede actualizar los activos y los textos públicos.',
  restoreDialogConfirmMessage:
    'Confirma solo si deseas restaurar toda la configuración a la marca base.',
} as const;

export const ORGANIZATION_SETTINGS_COPY = {
  pageTitle: 'Perfil empresarial y organización',
  pageSubtitle:
    'Revisa los datos de tu empresa, sus preferencias regionales y las sedes registradas.',
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
  operationalTitle: 'Preferencias regionales',
  operationalDescription: 'Zona horaria, país, idioma y moneda usados en el portal.',
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
  emptySitesDescription:
    'Aún no hay sedes registradas. Crea la primera para organizar la operación de tu empresa.',
  emptySitesReadOnlyDescription:
    'Aún no hay sedes registradas. Una persona administradora puede crear la primera.',
  sitesReadOnlyNotice: 'Puedes consultar las sedes, pero no modificarlas.',
  sitesDeniedDescription: 'No tienes permisos para consultar las sedes.',
  sitesPermissionsUnavailable: 'No pudimos confirmar tus permisos para gestionar sedes.',
  retryPermissionsAction: 'Reintentar permisos',
  retrySitesAction: 'Reintentar sedes',
  siteDialogErrorTitle: 'No fue posible guardar la sede',
  createSiteAction: 'Crear sede',
  createFirstSiteAction: 'Crear primera sede',
  noServices: 'Sin servicios activos',
  activeStatus: 'Activa',
  inactiveStatus: 'Inactiva',
  noActions: 'Sin acciones disponibles',
  editSiteAction: 'Editar sede',
  deactivateSiteAction: 'Dar de baja sede',
  deactivateDialogTitle: (name: string) => `¿Dar de baja «${name}»?`,
  deactivateDialogDescription:
    'La sede dejará de estar disponible para la operación. La información histórica se conservará.',
  deactivateConfirmAction: 'Dar de baja',
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
      description: 'Consulta sedes, servicios disponibles y el horario base de la empresa.',
    },
    access: {
      title: 'Perfiles de acceso',
      description: 'Administra perfiles de acceso, perfiles sugeridos y accesos por sección.',
    },
    fieldOperations: {
      title: 'Operaciones de campo',
      description:
        'Abre la configuración operativa de las operaciones de campo y consulta la referencia de despacho técnico sin salir del centro de configuración.',
    },
  },
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
    operations: 'Operaciones',
    wfm: 'Operaciones de campo',
    crm: 'CRM',
    commercial: 'Comercial',
    assurance: 'Mesa de ayuda',
    inventory: 'Inventario',
    billing: 'Facturación',
  };

  return labels[moduleKey] ?? 'Sección';
}
