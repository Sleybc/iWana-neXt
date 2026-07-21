export const PLATFORM_UI_COPY = {
  navigation: {
    home: 'Centro de control',
    tenants: 'Empresas',
    users: 'Usuarios internos',
    audit: 'Auditoria',
    settings: 'Plataforma',
    profile: 'Mi cuenta',
  },
  navigationGroups: {
    operation: 'Operacion',
    governance: 'Gobierno',
  },
  shell: {
    workspace: 'Plataforma iWana',
    workspaceSubtitle: 'Operacion y gobierno interno',
    openMenu: 'Abrir menu',
    closeMenu: 'Cerrar menu',
    expandSidebar: 'Expandir panel lateral',
    collapseSidebar: 'Contraer panel lateral',
    goHome: 'Ir al centro de control',
  },
  dashboard: {
    title: 'Centro de control',
    subtitle: 'Vista general de la operacion y gobierno de plataforma',
  },
  users: {
    title: 'Usuarios internos',
    subtitleIdle: 'Selecciona una empresa para revisar accesos internos.',
    createAction: 'Crear usuario interno',
  },
  audit: {
    title: 'Auditoria',
    subtitle: 'Historial de cambios y operaciones de plataforma',
    platformSectionTitle: 'Auditoria de plataforma',
    platformSectionSubtitle:
      'Sigue cambios realizados por administradores sobre empresas, usuarios y configuracion de plataforma.',
    tenantSectionTitle: 'Auditoria por empresa',
    tenantSectionSubtitle: 'Revisa cambios realizados dentro de la empresa seleccionada.',
    actionLabels: {
      create: 'Creación',
      update: 'Actualización',
      delete: 'Eliminación',
      suspend: 'Suspensión',
      activate: 'Reactivación',
      login: 'Inicio de sesión',
      logout: 'Cierre de sesión',
      provision: 'Puesta en marcha',
      retry: 'Reintento',
    },
    entityTypeLabels: {
      tenant: 'empresa',
      user: 'usuario',
      settings: 'configuración',
      platform: 'plataforma',
    },
  },
  shared: {
    selectTenant: 'Seleccionar empresa',
    noTenantsAvailable: 'Sin empresas activas',
    chooseTenant: 'Selecciona una empresa',
  },
} as const;

export function getPlatformUsersSubtitle(tenantName: string | null | undefined): string {
  if (!tenantName) {
    return PLATFORM_UI_COPY.users.subtitleIdle;
  }

  return `Gestiona acceso interno de ${tenantName}`;
}
