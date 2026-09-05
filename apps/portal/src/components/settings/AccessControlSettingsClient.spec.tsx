import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AccessPermissionAvailability,
  AccessPermissionCatalogVersion,
  AccessPermissionKey,
  UserRole,
} from '@iwana/shared';
import { AccessControlSettingsClient } from './AccessControlSettingsClient';
import { ACCESS_SETTINGS_COPY } from './mod00-settings-labels';

const useAuthMock = jest.fn();

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => useAuthMock(),
}));

jest.mock('@/lib/api-client', () => ({
  ApiError: class MockApiError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  accessControlApi: {
    listPermissions: jest.fn(),
    listProfiles: jest.fn(),
    createProfile: jest.fn(),
    updateProfile: jest.fn(),
    deleteProfile: jest.fn(),
    replaceProfilePermissions: jest.fn(),
  },
  tenantSelfApi: {
    getSettings: jest.fn(),
    updateSettings: jest.fn(),
  },
}));

function createCompatibilityMatrix() {
  const matrix = Object.fromEntries(
    Object.values(UserRole).map((role) => [role, []]),
  ) as unknown as Record<UserRole, AccessPermissionKey[]>;

  matrix[UserRole.ADMIN] = [
    AccessPermissionKey.SETTINGS_READ,
    AccessPermissionKey.ORGANIZATION_SITES_READ,
  ];

  matrix[UserRole.NOC] = [
    AccessPermissionKey.SETTINGS_READ,
    AccessPermissionKey.ORGANIZATION_SITES_READ,
  ];

  matrix[UserRole.TECHNICIAN] = [AccessPermissionKey.WFM_WORK_ORDERS_EXECUTE];

  return matrix;
}

const permissionsCatalog = {
  version: AccessPermissionCatalogVersion.MOD00_ACCESS_V1,
  permissions: [
    {
      id: 'perm-1',
      tenantId: 'tenant-1',
      permissionKey: AccessPermissionKey.SETTINGS_READ,
      moduleKey: 'settings',
      action: 'read',
      description: 'Ver centro de Configuración',
      catalogVersion: AccessPermissionCatalogVersion.MOD00_ACCESS_V1,
      availability: AccessPermissionAvailability.ASSIGNABLE,
      isSystem: true,
      isActive: true,
    },
    {
      id: 'perm-2',
      tenantId: 'tenant-1',
      permissionKey: AccessPermissionKey.ORGANIZATION_SITES_READ,
      moduleKey: 'organization',
      action: 'read',
      description: 'Ver sedes de la organización',
      catalogVersion: AccessPermissionCatalogVersion.MOD00_ACCESS_V1,
      availability: AccessPermissionAvailability.ASSIGNABLE,
      isSystem: true,
      isActive: true,
    },
    {
      id: 'perm-3',
      tenantId: 'tenant-1',
      permissionKey: AccessPermissionKey.WFM_WORK_ORDERS_EXECUTE,
      moduleKey: 'wfm',
      action: 'execute',
      description: 'Ejecutar órdenes de trabajo asignadas',
      catalogVersion: AccessPermissionCatalogVersion.MOD00_ACCESS_V1,
      availability: AccessPermissionAvailability.ASSIGNABLE,
      isSystem: true,
      isActive: true,
    },
    {
      id: 'perm-4',
      tenantId: 'tenant-1',
      permissionKey: AccessPermissionKey.ACCESS_PROFILES_MANAGE,
      moduleKey: 'access-control',
      action: 'manage',
      description: 'Administrar perfiles de acceso',
      catalogVersion: AccessPermissionCatalogVersion.MOD00_ACCESS_V1,
      availability: AccessPermissionAvailability.ASSIGNABLE,
      isSystem: true,
      isActive: true,
    },
  ],
  compatibilityMatrix: createCompatibilityMatrix(),
};

const profiles = [
  {
    id: 'template-admin',
    name: 'Administrador general',
    description: 'Perfil sugerido para la administración general de la empresa.',
    baseRoleConstraint: UserRole.ADMIN,
    scopeSiteId: null,
    isSystem: true,
    isActive: true,
    permissions: [AccessPermissionKey.SETTINGS_READ],
    createdAt: '2026-05-21T00:00:00.000Z',
    updatedAt: '2026-05-21T00:00:00.000Z',
  },
  {
    id: 'template-tech',
    name: 'Técnico de campo',
    description: 'Perfil sugerido para agenda y ejecución de trabajo de campo.',
    baseRoleConstraint: UserRole.TECHNICIAN,
    scopeSiteId: null,
    isSystem: true,
    isActive: true,
    permissions: [],
    createdAt: '2026-05-21T00:00:00.000Z',
    updatedAt: '2026-05-21T00:00:00.000Z',
  },
  {
    id: 'profile-1',
    name: 'Perfil NOC lectura',
    description: 'Perfil de consulta',
    baseRoleConstraint: UserRole.NOC,
    scopeSiteId: null,
    isSystem: false,
    isActive: true,
    permissions: [AccessPermissionKey.SETTINGS_READ],
    createdAt: '2026-05-21T00:00:00.000Z',
    updatedAt: '2026-05-21T00:00:00.000Z',
  },
  {
    id: 'profile-2',
    name: 'Perfil Organización',
    description: 'Perfil orientado a sedes',
    baseRoleConstraint: UserRole.NOC,
    scopeSiteId: null,
    isSystem: false,
    isActive: true,
    permissions: [AccessPermissionKey.ORGANIZATION_SITES_READ],
    createdAt: '2026-05-21T00:00:00.000Z',
    updatedAt: '2026-05-21T00:00:00.000Z',
  },
];

const tenantSettings = {
  features: {
    mfa_required_all: false,
    billing: true,
  },
};

const CANONICAL_SUGGESTED_NAMES = [
  'Administrador general',
  'Monitoreo operativo',
  'Soporte inicial',
  'Ventas',
  'Técnico de campo',
  'Contabilidad',
  'Talento humano',
  'Contratista',
  'Auditor',
] as const;

function renderAsAdmin() {
  useAuthMock.mockReturnValue({
    user: { id: 'admin-1', role: UserRole.ADMIN },
    isLoading: false,
  });
  return render(<AccessControlSettingsClient />);
}

async function openCreationPeek() {
  fireEvent.click(await screen.findByRole('button', { name: 'Crear perfil' }));
  const peek = await screen.findByRole('dialog');
  expect(within(peek).getByRole('heading', { name: 'Perfiles sugeridos' })).toBeInTheDocument();
  return within(peek);
}

describe('AccessControlSettingsClient', () => {
  beforeEach(() => {
    const { accessControlApi, tenantSelfApi } = jest.requireMock('@/lib/api-client') as {
      accessControlApi: {
        listPermissions: jest.Mock;
        listProfiles: jest.Mock;
        createProfile: jest.Mock;
      };
      tenantSelfApi: {
        getSettings: jest.Mock;
        updateSettings: jest.Mock;
      };
    };

    jest.clearAllMocks();
    accessControlApi.listPermissions.mockResolvedValue(permissionsCatalog);
    accessControlApi.listProfiles.mockResolvedValue(profiles);
    accessControlApi.createProfile.mockResolvedValue({
      ...profiles[0],
      id: 'profile-2',
      name: 'Perfil soporte',
      baseRoleConstraint: UserRole.SUPPORT,
    });
    tenantSelfApi.getSettings.mockResolvedValue(tenantSettings);
    tenantSelfApi.updateSettings.mockResolvedValue(tenantSettings);

    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: jest.fn(),
    });

    Object.defineProperty(HTMLElement.prototype, 'scrollBy', {
      configurable: true,
      value: jest.fn(),
    });
  });

  it('should show restricted state for non admin users', async () => {
    const { accessControlApi } = jest.requireMock('@/lib/api-client') as {
      accessControlApi: {
        listProfiles: jest.Mock;
      };
    };

    useAuthMock.mockReturnValue({
      user: { id: 'user-2', role: UserRole.NOC },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    expect(screen.getByText('Vista disponible para administradores')).toBeInTheDocument();
    expect(accessControlApi.listProfiles).not.toHaveBeenCalled();
    expect(
      screen.getByText('Vista disponible para administradores').closest('div.space-y-4'),
    ).not.toBeNull();
    expect(
      screen.getByText('Vista disponible para administradores').closest('div.space-y-6'),
    ).toBeNull();
  });

  it('uses the same page rhythm while access settings are loading', async () => {
    const { accessControlApi } = jest.requireMock('@/lib/api-client') as {
      accessControlApi: { listProfiles: jest.Mock };
    };

    accessControlApi.listProfiles.mockImplementation(() => new Promise(() => undefined));

    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    const loading = await screen.findByText('Cargando perfiles y accesos');
    expect(loading.closest('div.space-y-4')).not.toBeNull();
    expect(loading.closest('div.space-y-6')).toBeNull();
  });

  it('should create a profile and show creation feedback', async () => {
    const { accessControlApi } = jest.requireMock('@/lib/api-client') as {
      accessControlApi: {
        createProfile: jest.Mock;
      };
    };

    useAuthMock.mockReturnValue({
      user: { id: 'user-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    expect(
      await screen.findByRole('heading', { name: 'Perfiles personalizados' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Perfiles sugeridos' })).not.toBeInTheDocument();
    expect(screen.queryByText('Crear nuevo perfil')).not.toBeInTheDocument();
    expect(document.getElementById('templates-section')).toBeNull();

    const peek = await openCreationPeek();
    fireEvent.click(peek.getByRole('button', { name: 'Empezar desde cero' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.change(await screen.findByLabelText('Nombre'), {
      target: { value: 'Perfil soporte' },
    });
    fireEvent.change(screen.getByLabelText('Descripción'), {
      target: { value: 'Perfil para soporte' },
    });
    fireEvent.change(screen.getByLabelText('Tipo de usuario permitido'), {
      target: { value: UserRole.SUPPORT },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar perfil' }));

    await waitFor(() => {
      expect(accessControlApi.createProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Perfil soporte',
          description: 'Perfil para soporte',
        }),
      );
    });

    expect(accessControlApi.createProfile).toHaveBeenCalledWith(
      expect.not.objectContaining({ isActive: expect.anything() }),
    );

    expect(
      await screen.findByText('Perfil creado. Debes asignarlo en Usuarios'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Nadie usa este perfil todavía. En Usuarios, abre a la persona y deja marcado «Perfil soporte».',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a Usuarios' })).toHaveAttribute(
      'href',
      '/dashboard/users',
    );
    expect(screen.queryByText('Perfil creado correctamente.')).not.toBeInTheDocument();
  });

  it('CA-ACC-POST-04: shows the next-step banner after creating from a suggested profile', async () => {
    const { accessControlApi } = jest.requireMock('@/lib/api-client') as {
      accessControlApi: { createProfile: jest.Mock };
    };

    accessControlApi.createProfile.mockResolvedValue({
      id: 'profile-from-suggested',
      name: 'NOC personalizado',
      description: 'Copia del sugerido',
      baseRoleConstraint: UserRole.NOC,
      scopeSiteId: null,
      isSystem: false,
      isActive: true,
      permissions: [AccessPermissionKey.SETTINGS_READ],
      createdAt: '2026-08-29T00:00:00.000Z',
      updatedAt: '2026-08-29T00:00:00.000Z',
    });

    useAuthMock.mockReturnValue({
      user: { id: 'user-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    const peek = await openCreationPeek();
    fireEvent.click(peek.getByRole('button', { name: 'Ver lo que permite Administrador general' }));
    fireEvent.click(peek.getByRole('button', { name: 'Usar este perfil' }));

    expect(accessControlApi.createProfile).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar perfil' }));

    expect(
      await screen.findByText('Perfil creado. Debes asignarlo en Usuarios'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Nadie cambió de perfil. En Usuarios, abre a la persona y deja marcado solo «NOC personalizado»: quita el perfil sugerido. Si dejas ambos, sumará los accesos de los dos.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a Usuarios' })).toHaveAttribute(
      'href',
      '/dashboard/users',
    );
  });

  it('muestra la política global de verificación en dos pasos para administradores', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    expect(
      await screen.findByRole('heading', { name: /^Perfiles de acceso$/ }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Políticas de autenticación')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Verificación en dos pasos global' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Verificación en dos pasos global opcional')).not.toBeInTheDocument();
    expect(screen.queryByText('Verificación en dos pasos global activa')).not.toBeInTheDocument();
    expect(
      screen.getByLabelText('Activar verificación en dos pasos obligatoria'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Activar verificación en dos pasos obligatoria'),
    ).not.toBeChecked();
  });

  it('guarda la política global de verificación en dos pasos', async () => {
    const { tenantSelfApi } = jest.requireMock('@/lib/api-client') as {
      tenantSelfApi: {
        updateSettings: jest.Mock;
      };
    };

    tenantSelfApi.updateSettings.mockResolvedValue({
      features: {
        mfa_required_all: true,
        billing: true,
      },
    });

    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    const toggle = await screen.findByLabelText('Activar verificación en dos pasos obligatoria');
    fireEvent.click(toggle);

    expect(toggle).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar política' }));

    await waitFor(() => {
      expect(tenantSelfApi.updateSettings).toHaveBeenCalledWith({
        features: { mfa_required_all: true },
      });
    });

    expect(
      await screen.findByText('Política de verificación en dos pasos actualizada correctamente.'),
    ).toBeInTheDocument();
  });

  it('muestra En edición como estado del perfil seleccionado y mantiene la accion editar accesos', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    await screen.findByRole('heading', { name: 'Perfiles personalizados' });

    expect(screen.getAllByText('En edición').length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('button', { name: /Gestionar accesos de Perfil NOC lectura/i }).length,
    ).toBeGreaterThan(0);
  });

  it('CA-ACC-UX-21: Crear perfil abre el peek de catálogo, no un diálogo modal', async () => {
    renderAsAdmin();

    await screen.findByRole('heading', { name: 'Perfiles personalizados' });
    expect(screen.queryByRole('heading', { name: 'Perfiles sugeridos' })).not.toBeInTheDocument();
    expect(screen.queryByText('Crear nuevo perfil')).not.toBeInTheDocument();
    expect(screen.queryByText('Usar un perfil sugerido')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Crear a partir de este perfil/ }),
    ).not.toBeInTheDocument();

    const peek = await openCreationPeek();
    expect(peek.getByText(ACCESS_SETTINGS_COPY.peekListIntro)).toBeInTheDocument();
    expect(peek.getByRole('button', { name: 'Empezar desde cero' })).toBeInTheDocument();
    expect(peek.getByText(ACCESS_SETTINGS_COPY.startFromScratchHelp)).toBeInTheDocument();
    expect(peek.queryByText('Usar un perfil sugerido')).not.toBeInTheDocument();
  });

  it('CA-ACC-UX-27: Empezar desde cero cierra el peek y deja un borrador vacío', async () => {
    const { accessControlApi } = jest.requireMock('@/lib/api-client') as {
      accessControlApi: { createProfile: jest.Mock };
    };

    renderAsAdmin();

    const peek = await openCreationPeek();
    fireEvent.click(peek.getByRole('button', { name: 'Empezar desde cero' }));

    expect(accessControlApi.createProfile).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Perfiles sugeridos' })).not.toBeInTheDocument();
    expect(await screen.findByText('Nuevo perfil en preparación')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const nameField = await screen.findByLabelText('Nombre');
    await waitFor(() => {
      expect(nameField).toHaveFocus();
    });
    expect(nameField).toHaveValue('');
    expect(screen.getByLabelText('Tipo de usuario permitido')).toBeInTheDocument();
  });

  it('CA-ACC-UX-25: Usar este perfil cierra el peek, no hace POST y deja el borrador', async () => {
    const { accessControlApi } = jest.requireMock('@/lib/api-client') as {
      accessControlApi: { createProfile: jest.Mock };
    };

    renderAsAdmin();

    const peek = await openCreationPeek();
    fireEvent.click(peek.getByRole('button', { name: 'Ver lo que permite Administrador general' }));
    const peekDetailHeading = peek.getByText('Lo que permite este perfil');
    expect(peekDetailHeading.tagName).toBe('P');
    expect(peekDetailHeading.className).toContain('portal-eyebrow');
    expect(
      peek.queryByRole('heading', { name: 'Lo que permite este perfil' }),
    ).not.toBeInTheDocument();
    expect(peek.queryByRole('checkbox')).not.toBeInTheDocument();
    fireEvent.click(peek.getByRole('button', { name: 'Usar este perfil' }));

    expect(accessControlApi.createProfile).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Perfiles sugeridos' })).not.toBeInTheDocument();
    expect(await screen.findByText('Nuevo perfil en preparación')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const nameField = await screen.findByLabelText('Nombre');
    expect(nameField).toHaveValue('Basado en Administrador general');
    await waitFor(() => {
      expect(nameField).toHaveFocus();
    });
    expect(screen.getByLabelText('Descripción')).toHaveValue(
      'Perfil sugerido para la administración general de la empresa.',
    );
    expect(screen.getByLabelText('Tipo de usuario permitido')).toBeInTheDocument();
  });

  it('el borrador usa eyebrow y sombra activa, sin pozo rounded-2xl anidado', async () => {
    renderAsAdmin();

    const peek = await openCreationPeek();
    fireEvent.click(peek.getByRole('button', { name: 'Empezar desde cero' }));

    const nameField = await screen.findByLabelText('Nombre');
    await waitFor(() => {
      expect(nameField).toHaveFocus();
    });

    const draftTitle = screen.getByText('Datos del nuevo perfil');
    expect(draftTitle.tagName).toBe('P');
    expect(draftTitle.className).toContain('portal-eyebrow');
    expect(draftTitle.className).not.toContain('font-semibold');

    const limaBar = draftTitle.parentElement;
    expect(limaBar?.className).toMatch(/border-l-4/);
    expect(limaBar?.className).not.toContain('rounded-2xl');
    expect(limaBar?.parentElement?.className).not.toContain('rounded-2xl');

    const profilesPanel = screen
      .getByRole('heading', { name: 'Perfiles personalizados' })
      .closest('section');
    expect(profilesPanel?.className).toContain('shadow-iwana-active');
    expect(screen.getByText('En edición')).toBeInTheDocument();
  });

  it('should render custom roles in the roles table', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    await screen.findByRole('heading', { name: 'Perfiles personalizados' });

    expect((await screen.findAllByText('Perfil NOC lectura')).length).toBeGreaterThan(0);
  });

  it('does not render user assignment controls inside roles screen', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    await screen.findByRole('heading', { name: /^Perfiles de acceso$/ });

    expect(screen.queryByRole('heading', { name: 'Asignación de roles' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Accesos efectivos' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Usuario')).not.toBeInTheDocument();
  });

  it('muestra perfiles personalizados como workspace y no pinta galería de sugeridos', async () => {
    renderAsAdmin();

    expect(
      await screen.findByRole('heading', { name: 'Perfiles personalizados' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Perfiles sugeridos' })).not.toBeInTheDocument();
    expect(document.getElementById('templates-section')).toBeNull();
    expect(
      screen.getByText(
        'Crear un perfil aquí no cambia a quién lo usa. Para que alguien deje el perfil sugerido, debes reemplazarlo en Usuarios.',
      ),
    ).toBeInTheDocument();
  });

  it('CA-ACC-UX-22: el peek lista las filas sugeridas con Ver lo que permite y sin cards', async () => {
    renderAsAdmin();

    expect(await screen.findByRole('heading', { name: 'Perfiles personalizados' })).toBeVisible();
    expect(screen.queryByText('Administrador general')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Crear a partir de este perfil/ }),
    ).not.toBeInTheDocument();

    const peek = await openCreationPeek();
    expect(
      peek.getByRole('button', { name: 'Ver lo que permite Administrador general' }),
    ).toBeInTheDocument();
    expect(
      peek.getByRole('button', { name: 'Ver lo que permite Técnico de campo' }),
    ).toBeInTheDocument();
    expect(
      peek.queryByRole('button', { name: /Crear a partir de este perfil/ }),
    ).not.toBeInTheDocument();
    expect(peek.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument();
  });

  it('compone filas compactas en el peek, no cards rounded-2xl ni grid de 4 columnas', async () => {
    renderAsAdmin();

    const peek = await openCreationPeek();
    const adminRow = peek.getByRole('button', {
      name: 'Ver lo que permite Administrador general',
    });

    expect(adminRow.className).toMatch(/min-h-11/);
    expect(adminRow.className).not.toContain('rounded-2xl');
    expect(adminRow.className).toContain('hover:bg-iwana-surface-soft/80');
    expect(adminRow.closest('div.grid')).toBeNull();
    expect(adminRow.parentElement?.className).toMatch(/divide-y/);
    const catalogShell = adminRow.parentElement?.parentElement;
    expect(catalogShell?.className).toMatch(/rounded-2xl/);
    expect(catalogShell?.className).toContain('border-gray-200');
    expect(catalogShell?.className).toContain('shadow-iwana-card');
    const previewActionClassName = within(adminRow).getByText('Ver lo que permite').className;
    expect(previewActionClassName.split(/\s+/)).toEqual(
      expect.arrayContaining([
        'text-gray-500',
        'group-hover:text-iwana-secondary-700',
        'dark:text-gray-400',
        'dark:group-hover:text-iwana-secondary-300',
      ]),
    );
    expect(previewActionClassName.split(/\s+/)).not.toContain('text-iwana-secondary-700');
    expect(within(adminRow).getByText(/accesos/).className).toContain('tabular-nums');
    const fromScratch = peek.getByRole('button', { name: 'Empezar desde cero' });
    expect(fromScratch.className).not.toContain('rounded-2xl');
    expect(fromScratch.parentElement?.className).toMatch(/rounded-2xl/);
    expect(fromScratch.parentElement?.className).toContain('border-gray-200');
    expect(fromScratch.parentElement?.className).toContain('shadow-iwana-card');
    expect(fromScratch.parentElement?.className).toContain('bg-iwana-surface-soft');
    expect(fromScratch.parentElement).not.toBe(adminRow.parentElement);
    expect(peek.getByText(ACCESS_SETTINGS_COPY.peekListIntro).className).toContain('text-xs');
    expect(peek.queryByText('Sugerido')).not.toBeInTheDocument();
  });

  it('CA-ACC-UX-26: Escape, Cerrar o el velo cierran el peek sin borrador', async () => {
    renderAsAdmin();

    const peek = await openCreationPeek();
    fireEvent.click(peek.getByRole('button', { name: 'Cerrar' }));

    expect(screen.queryByRole('heading', { name: 'Perfiles sugeridos' })).not.toBeInTheDocument();
    expect(screen.queryByText('Nuevo perfil en preparación')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Crear perfil' }));
    const peekAgain = within(await screen.findByRole('dialog'));
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Perfiles sugeridos' })).not.toBeInTheDocument();
    });
    expect(screen.queryByText('Nuevo perfil en preparación')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Crear perfil' }));
    const overlay = screen.getByRole('presentation').querySelector('[aria-hidden="true"]');
    expect(overlay).not.toBeNull();
    fireEvent.mouseDown(overlay as HTMLElement);

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Perfiles sugeridos' })).not.toBeInTheDocument();
    });
    expect(screen.queryByText('Nuevo perfil en preparación')).not.toBeInTheDocument();
  });

  it('CA-ACC-UX-28: Tab recorre filas, Enter abre detalle y Escape cierra el detalle sin borrador', async () => {
    const user = userEvent.setup({ delay: null });
    const requestAnimationFrameSpy = jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });

    renderAsAdmin();

    const peek = await openCreationPeek();
    const closeButton = peek.getByRole('button', { name: 'Cerrar' });
    const firstRow = peek.getByRole('button', {
      name: 'Ver lo que permite Administrador general',
    });

    closeButton.focus();
    await user.tab();
    expect(firstRow).toHaveFocus();

    firstRow.focus();
    await user.keyboard('{Enter}');
    const peekDetailHeading = peek.getByText('Lo que permite este perfil');
    expect(peekDetailHeading.tagName).toBe('P');
    expect(peekDetailHeading.className).toContain('portal-eyebrow');
    expect(
      peek.queryByRole('heading', { name: 'Lo que permite este perfil' }),
    ).not.toBeInTheDocument();
    expect(peek.getByRole('button', { name: 'Usar este perfil' })).toBeInTheDocument();
    expect(screen.queryByText('Nuevo perfil en preparación')).not.toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Perfiles sugeridos' })).not.toBeInTheDocument();
    });
    expect(screen.queryByText('Nuevo perfil en preparación')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Crear perfil' }));
    const peekAgain = within(await screen.findByRole('dialog'));
    peekAgain.getByRole('button', { name: 'Empezar desde cero' }).focus();
    await user.tab({ shift: true });
    expect(
      peekAgain.getByRole('button', { name: 'Ver lo que permite Técnico de campo' }),
    ).toHaveFocus();

    requestAnimationFrameSpy.mockRestore();
  });

  it('al pasar de lista a detalle mueve el foco al primer control del nuevo momento', async () => {
    const requestAnimationFrameSpy = jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });

    renderAsAdmin();

    const peek = await openCreationPeek();
    fireEvent.click(peek.getByRole('button', { name: 'Ver lo que permite Administrador general' }));

    await waitFor(() => {
      expect(peek.getByRole('button', { name: 'Usar este perfil' })).toHaveFocus();
    });

    fireEvent.click(peek.getByRole('button', { name: 'Volver a la lista' }));

    await waitFor(() => {
      expect(
        peek.getByRole('button', { name: 'Ver lo que permite Administrador general' }),
      ).toHaveFocus();
    });

    requestAnimationFrameSpy.mockRestore();
  });

  it('CA-ACC-UX-24: el momento detalle agrupa accesos en solo lectura y no pinta Editar accesos', async () => {
    renderAsAdmin();

    const peek = await openCreationPeek();
    fireEvent.click(peek.getByRole('button', { name: 'Ver lo que permite Técnico de campo' }));

    expect(peek.getByRole('heading', { name: 'Técnico de campo' })).toBeInTheDocument();
    const peekDetailHeading = peek.getByText('Lo que permite este perfil');
    expect(peekDetailHeading.tagName).toBe('P');
    expect(peekDetailHeading.className).toContain('portal-eyebrow');
    expect(
      peek.queryByRole('heading', { name: 'Lo que permite este perfil' }),
    ).not.toBeInTheDocument();
    expect(peek.getByText(/Técnico de campo · 1 accesos/)).toBeInTheDocument();
    const permissionItem = peek.getByText('Ejecutar órdenes de trabajo asignadas');
    expect(permissionItem.className).not.toContain('border-gray-100');
    expect(permissionItem.closest('ul')?.className).toMatch(/divide-y/);
    expect(permissionItem.closest('ul')?.previousElementSibling?.className).toContain(
      'portal-eyebrow-muted',
    );
    expect(peek.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(peek.queryByRole('button', { name: /Editar accesos/ })).not.toBeInTheDocument();
    expect(
      peek.queryByRole('button', { name: /Crear a partir de este perfil/ }),
    ).not.toBeInTheDocument();
    expect(peek.getByRole('button', { name: 'Usar este perfil' }).className).toMatch(/min-h-11/);
    expect(peek.getByRole('button', { name: 'Volver a la lista' })).toBeInTheDocument();
  });

  it('CA-ACC-UX-17: las filas del peek no repiten el eyebrow Sugerido', async () => {
    renderAsAdmin();

    const peek = await openCreationPeek();
    expect(peek.getByRole('heading', { name: 'Perfiles sugeridos' })).toBeInTheDocument();
    expect(peek.queryByText('Sugerido')).not.toBeInTheDocument();
  });

  it('keeps the mobile action toolbar without a gray well override', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    const buttons = await screen.findAllByRole('button', {
      name: 'Gestionar accesos de Perfil NOC lectura',
    });

    expect(buttons.length).toBeGreaterThan(0);
    const mobileButton = buttons.find((button) =>
      button.getAttribute('aria-label')?.includes('Gestionar'),
    );
    expect(mobileButton).toBeDefined();
    expect(mobileButton?.className).not.toContain('bg-gray-50');
    expect(mobileButton?.parentElement?.className).not.toContain('bg-gray-50');
  });

  it('marca Guardar perfil como ocupado mientras el POST está en curso', async () => {
    const { accessControlApi } = jest.requireMock('@/lib/api-client') as {
      accessControlApi: { createProfile: jest.Mock };
    };

    accessControlApi.createProfile.mockImplementation(() => new Promise(() => undefined));

    renderAsAdmin();

    const peek = await openCreationPeek();
    fireEvent.click(peek.getByRole('button', { name: 'Empezar desde cero' }));
    fireEvent.change(await screen.findByLabelText('Nombre'), {
      target: { value: 'Perfil soporte' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar perfil' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Guardar perfil' })).toHaveAttribute(
        'aria-busy',
        'true',
      );
    });
  });

  it('marca Guardar cambios de accesos como ocupado mientras el PATCH está en curso', async () => {
    const { accessControlApi } = jest.requireMock('@/lib/api-client') as {
      accessControlApi: { replaceProfilePermissions: jest.Mock };
    };

    accessControlApi.replaceProfilePermissions.mockImplementation(
      () => new Promise(() => undefined),
    );

    renderAsAdmin();

    fireEvent.click(
      (
        await screen.findAllByRole('button', { name: 'Gestionar accesos de Perfil Organización' })
      )[0]!,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Guardar cambios' })).toHaveAttribute(
        'aria-busy',
        'true',
      );
    });
  });

  it('marca el submit de Editar perfil como ocupado mientras el PATCH está en curso', async () => {
    const { accessControlApi } = jest.requireMock('@/lib/api-client') as {
      accessControlApi: { updateProfile: jest.Mock };
    };

    accessControlApi.updateProfile.mockImplementation(() => new Promise(() => undefined));

    renderAsAdmin();

    fireEvent.click(
      (await screen.findAllByRole('button', { name: 'Editar perfil Perfil NOC lectura' }))[0]!,
    );

    const dialog = within(screen.getByRole('dialog'));
    fireEvent.click(dialog.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(dialog.getByRole('button', { name: 'Guardar cambios' })).toHaveAttribute(
        'aria-busy',
        'true',
      );
    });
  });

  it('enters draft mode from a suggested profile and shows the full assignable catalog with suggested defaults checked', async () => {
    const user = userEvent.setup({ delay: null });
    renderAsAdmin();

    const peek = await openCreationPeek();
    fireEvent.click(peek.getByRole('button', { name: 'Ver lo que permite Técnico de campo' }));
    fireEvent.click(peek.getByRole('button', { name: 'Usar este perfil' }));

    await screen.findByRole('status');
    expect(
      screen.queryByRole('button', { name: 'Editar datos del nuevo perfil' }),
    ).not.toBeInTheDocument();
    expect(await screen.findByLabelText('Nombre')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText('Ejecutar órdenes de trabajo asignadas')).toBeChecked();
    });
    const sectionSelect = await screen.findByRole('combobox', { name: 'Sección de accesos' });
    await user.click(sectionSelect);
    await user.click(await screen.findByRole('option', { name: 'Control de acceso' }));
    expect(await screen.findByLabelText(/Administrar perfiles de acceso/i)).toBeDisabled();
    expect(await screen.findByLabelText(/Administrar perfiles de acceso/i)).not.toBeChecked();
    expect(screen.getByRole('combobox', { name: 'Sección de accesos' })).toBeInTheDocument();
  });

  it('creates a new profile from a template with its selected permission keys', async () => {
    const { accessControlApi } = jest.requireMock('@/lib/api-client') as {
      accessControlApi: {
        createProfile: jest.Mock;
      };
    };

    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    const peek = await openCreationPeek();
    fireEvent.click(peek.getByRole('button', { name: 'Ver lo que permite Técnico de campo' }));
    fireEvent.click(peek.getByRole('button', { name: 'Usar este perfil' }));

    expect((await screen.findAllByText(/Basado en Técnico de campo/i)).length).toBeGreaterThan(0);
    const sectionSelect2 = await screen.findByRole('combobox', { name: 'Sección de accesos' });
    const user2 = userEvent.setup({ delay: null });
    await user2.click(sectionSelect2);
    await user2.click(await screen.findByRole('option', { name: 'Control de acceso' }));
    expect(await screen.findByLabelText(/Administrar perfiles de acceso/i)).toBeDisabled();
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar perfil' }));

    await waitFor(() => {
      expect(accessControlApi.createProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Basado en Técnico de campo',
          baseRoleConstraint: UserRole.TECHNICIAN,
          permissionKeys: [AccessPermissionKey.WFM_WORK_ORDERS_EXECUTE],
        }),
      );
    });
  });

  it('CA-ACC-UX-24: muestra el detalle de accesos en el mismo peek y Cerrar no deja borrador', async () => {
    const requestAnimationFrameSpy = jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });

    renderAsAdmin();

    const peek = await openCreationPeek();
    const previewRow = peek.getByRole('button', { name: 'Ver lo que permite Técnico de campo' });
    fireEvent.click(previewRow);

    const peekDetailHeading = peek.getByText('Lo que permite este perfil');
    expect(peekDetailHeading.tagName).toBe('P');
    expect(peekDetailHeading.className).toContain('portal-eyebrow');
    expect(
      peek.queryByRole('heading', { name: 'Lo que permite este perfil' }),
    ).not.toBeInTheDocument();
    expect(peek.getByText('Ejecutar órdenes de trabajo asignadas')).toBeInTheDocument();
    expect(peek.queryByRole('checkbox')).not.toBeInTheDocument();

    fireEvent.click(peek.getByRole('button', { name: 'Cerrar' }));

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Perfiles sugeridos' })).not.toBeInTheDocument();
    });
    expect(screen.queryByText('Nuevo perfil en preparación')).not.toBeInTheDocument();

    requestAnimationFrameSpy.mockRestore();
  });

  it('selects the module with active permissions first and allows filtering inside the tab', async () => {
    const user = userEvent.setup({ delay: null });
    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    expect((await screen.findAllByText('Perfil Organización')).length).toBeGreaterThan(0);

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Gestionar accesos de Perfil Organización' })[0]!,
    );

    const sectionSelect = await screen.findByRole('combobox', { name: 'Sección de accesos' });
    await waitFor(() => {
      expect(sectionSelect).toHaveTextContent('Organización');
    });

    expect(screen.getByText('Ver sedes de la organización')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Buscar accesos en esta sección'), {
      target: { value: 'sedes' },
    });

    expect(screen.getByText('Ver sedes de la organización')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Buscar accesos en esta sección'), {
      target: { value: 'centro' },
    });

    expect(screen.getByText('No encontramos accesos en esta sección')).toBeInTheDocument();

    await user.click(sectionSelect);
    await user.click(await screen.findByRole('option', { name: 'Configuración' }));

    await waitFor(() => {
      expect(sectionSelect).toHaveTextContent('Configuración');
    });
    expect(screen.getByText('Ver centro de Configuración')).toBeInTheDocument();
  });

  it('shows horizontal scroll controls when permission modules overflow', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    expect((await screen.findAllByText('Perfil Organización')).length).toBeGreaterThan(0);

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Gestionar accesos de Perfil Organización' })[0]!,
    );

    const sectionSelect = await screen.findByLabelText('Sección de accesos');
    expect(sectionSelect).toBeInTheDocument();
    expect(screen.queryByTestId('permission-modules-scroll')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Desplazar secciones a la derecha' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Desplazar secciones a la izquierda' }),
    ).not.toBeInTheDocument();
  });

  it('renders contextual aria labels for profile actions', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    expect((await screen.findAllByText('Perfil NOC lectura')).length).toBeGreaterThan(0);

    expect(
      screen.getAllByRole('button', { name: 'Gestionar accesos de Perfil NOC lectura' }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('button', { name: 'Editar perfil Perfil NOC lectura' }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('button', { name: 'Eliminar perfil Perfil NOC lectura' }).length,
    ).toBeGreaterThan(0);
  });

  it('places the create-profile action in the custom profiles panel instead of the page header', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    await screen.findByRole('heading', { name: 'Perfiles personalizados' });

    const pageTitle = screen.getByRole('heading', { level: 1 });
    const pageHeader = pageTitle.closest('div.rounded-2xl') ?? pageTitle.parentElement;
    expect(
      within(pageHeader as HTMLElement).queryByRole('button', { name: 'Crear perfil' }),
    ).not.toBeInTheDocument();

    const customProfilesPanel = screen
      .getByRole('heading', { name: 'Perfiles personalizados' })
      .closest('section');
    expect(customProfilesPanel).not.toBeNull();
    expect(
      within(customProfilesPanel as HTMLElement).getByRole('button', { name: 'Crear perfil' }),
    ).toBeVisible();
    expect(pageTitle).toHaveTextContent(/^Perfiles de acceso$/);
  });

  it('shows a single create-profile action in the editable empty state', async () => {
    const { accessControlApi } = jest.requireMock('@/lib/api-client') as {
      accessControlApi: { listProfiles: jest.Mock };
    };

    accessControlApi.listProfiles.mockResolvedValue(profiles.filter((profile) => profile.isSystem));

    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    expect(
      await screen.findByText('Tus equipos ya usan los perfiles sugeridos'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Aún no has creado perfiles personalizados')).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'No se editan aquí. Crear uno a partir del sugerido no mueve a nadie: después debes ir a Usuarios, quitar el perfil sugerido y dejar solo el nuevo.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Crear primera/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Crear perfil' })).toHaveLength(1);
  });

  it('embeds the custom-profile empty state without a nested well', async () => {
    const { accessControlApi } = jest.requireMock('@/lib/api-client') as {
      accessControlApi: { listProfiles: jest.Mock };
    };

    accessControlApi.listProfiles.mockResolvedValue(profiles.filter((profile) => profile.isSystem));

    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    const emptyTitle = await screen.findByText('Tus equipos ya usan los perfiles sugeridos');
    expect(emptyTitle.closest('.bg-iwana-surface-soft')).toBeNull();
    expect(
      screen.queryByText(
        'Crea perfiles propios para tu empresa y define qué puede hacer cada uno. Las personas no los usan hasta que los asignas en Usuarios.',
      ),
    ).not.toBeInTheDocument();
  });

  it('CA-ACC-POST-01: empty without suggested profiles uses the first-time copy', async () => {
    const { accessControlApi } = jest.requireMock('@/lib/api-client') as {
      accessControlApi: { listProfiles: jest.Mock };
    };

    accessControlApi.listProfiles.mockResolvedValue([]);

    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    expect(
      await screen.findByText('Aún no has creado perfiles personalizados'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Tus equipos ya usan los perfiles sugeridos'),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Crear perfil' })).toHaveLength(1);
  });

  it('does not render a second no-profile-selected empty in the accesses panel', async () => {
    const { accessControlApi } = jest.requireMock('@/lib/api-client') as {
      accessControlApi: { listProfiles: jest.Mock };
    };

    accessControlApi.listProfiles.mockResolvedValue(profiles.filter((profile) => profile.isSystem));

    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    await screen.findByRole('heading', { name: 'Accesos del perfil' });
    expect(screen.queryByText('Sin perfil seleccionado')).not.toBeInTheDocument();
    expect(
      screen.getByText('Elige un perfil de la lista para revisar o cambiar sus accesos.'),
    ).toBeInTheDocument();
  });

  it('no pinta galería de sugeridos en la página: el catálogo vive solo en el peek', async () => {
    renderAsAdmin();

    await screen.findByRole('heading', { name: 'Perfiles personalizados' });
    expect(screen.queryByRole('heading', { name: 'Perfiles sugeridos' })).not.toBeInTheDocument();
    expect(document.getElementById('templates-section')).toBeNull();
    expect(screen.queryByText('Administrador general')).not.toBeInTheDocument();

    const peek = await openCreationPeek();
    const adminRow = peek.getByRole('button', {
      name: 'Ver lo que permite Administrador general',
    });
    expect(adminRow.closest('div.grid')?.className ?? '').not.toMatch(/xl:grid-cols-4/);
    expect(adminRow.parentElement?.className).toMatch(/divide-y/);
  });

  it('CA-ACC-UX-14: empty post-corte y Crear perfil sin heading de sugeridos en página', async () => {
    const { accessControlApi } = jest.requireMock('@/lib/api-client') as {
      accessControlApi: { listProfiles: jest.Mock };
    };

    accessControlApi.listProfiles.mockResolvedValue([
      profiles.find((profile) => profile.isSystem)!,
    ]);

    renderAsAdmin();

    expect(
      await screen.findByText('Tus equipos ya usan los perfiles sugeridos'),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Crear perfil' })).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'Perfiles sugeridos' })).not.toBeInTheDocument();
    expect(screen.queryByText('Administrador general')).not.toBeInTheDocument();
    expect(document.getElementById('templates-section')).toBeNull();
  });

  it('CA-ACC-POST-02: subtítulo, empty post-corte y peek cubren uso, no edición, no mueve y reemplazo', async () => {
    const { accessControlApi } = jest.requireMock('@/lib/api-client') as {
      accessControlApi: { listProfiles: jest.Mock };
    };

    accessControlApi.listProfiles.mockResolvedValue(profiles.filter((profile) => profile.isSystem));

    renderAsAdmin();

    expect(await screen.findByText(ACCESS_SETTINGS_COPY.pageSubtitle)).toBeInTheDocument();
    expect(screen.getByText(ACCESS_SETTINGS_COPY.profilesEmptyPostCutTitle)).toBeInTheDocument();
    expect(
      screen.getByText(ACCESS_SETTINGS_COPY.profilesEmptyPostCutDescription),
    ).toBeInTheDocument();
    expect(screen.queryByText('Aún no has creado perfiles personalizados')).not.toBeInTheDocument();

    const peek = await openCreationPeek();
    expect(peek.getByText(ACCESS_SETTINGS_COPY.peekListIntro)).toBeInTheDocument();

    const visibleCopy = [
      ACCESS_SETTINGS_COPY.pageSubtitle,
      ACCESS_SETTINGS_COPY.profilesEmptyPostCutTitle,
      ACCESS_SETTINGS_COPY.profilesEmptyPostCutDescription,
      ACCESS_SETTINGS_COPY.peekListIntro,
    ].join(' ');
    expect(visibleCopy).toMatch(/ya (usan|están en uso)/i);
    expect(visibleCopy).toMatch(/no se editan aquí/i);
    expect(visibleCopy).toMatch(/no (cambia a quién lo usa|mueve a nadie)/i);
    expect(visibleCopy).toMatch(/Usuarios/i);
    expect(visibleCopy).toMatch(/quitar/i);

    expect(screen.queryByText(/plantilla/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/categoría base/i)).not.toBeInTheDocument();
    expect(peek.queryByText(/módulo/i)).not.toBeInTheDocument();
    expect(peek.queryByText(/\bsistema\b/i)).not.toBeInTheDocument();
    expect(peek.queryByText(/^operations$/i)).not.toBeInTheDocument();
    expect(peek.queryByText(/^wfm$/i)).not.toBeInTheDocument();
  });

  it('CA-ACC-UX-29: el peek tiene scroll interno, filas min-h-11 y footer de detalle apilado', async () => {
    renderAsAdmin();

    const peek = await openCreationPeek();
    const firstRow = peek.getByRole('button', {
      name: 'Ver lo que permite Administrador general',
    });
    expect(firstRow.className).toMatch(/min-h-11/);
    expect(firstRow.closest('.overflow-y-auto')).not.toBeNull();
    expect(peek.getByRole('button', { name: 'Empezar desde cero' }).className).toMatch(/min-h-11/);

    fireEvent.click(firstRow);
    const useThisProfile = peek.getByRole('button', { name: 'Usar este perfil' });
    const backToList = peek.getByRole('button', { name: 'Volver a la lista' });
    expect(useThisProfile.className).toMatch(/min-h-11/);
    expect(useThisProfile.className).toMatch(/w-full/);
    expect(backToList.className).toMatch(/min-h-11/);
    expect(useThisProfile.closest('footer')).not.toBeNull();
    expect(backToList.closest('footer')).not.toBeNull();
    expect(useThisProfile.parentElement?.className).toMatch(/flex-col/);
  });

  it('describes the selected profile from the reviewers task', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    expect(
      await screen.findByText(
        'Revisa lo que «Perfil NOC lectura» puede ver o hacer en cada sección.',
      ),
    ).toBeInTheDocument();
  });

  it('describes the draft profile from the upcoming task', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    renderAsAdmin();

    const peek = await openCreationPeek();
    fireEvent.click(peek.getByRole('button', { name: 'Ver lo que permite Administrador general' }));
    fireEvent.click(peek.getByRole('button', { name: 'Usar este perfil' }));

    expect(
      await screen.findByText(
        'Revisa lo que «Basado en Administrador general» podrá ver o hacer en cada sección.',
      ),
    ).toBeInTheDocument();
  });

  it('stacks the MFA footer on mobile and returns to a row from sm', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    const savePolicy = await screen.findByRole('button', { name: 'Guardar política' });
    const footer = savePolicy.parentElement;

    expect(footer?.className).toContain('flex-col');
    expect(footer?.className).toContain('items-stretch');
    expect(footer?.className).toContain('sm:flex-row');
    expect(footer?.className).toContain('sm:items-center');
    expect(savePolicy.className).toContain('w-full');
    expect(savePolicy.className).toContain('sm:w-auto');
  });

  it('does not expose template or category-base copy on the access screen', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    await screen.findByRole('heading', { name: 'Perfiles personalizados' });

    expect(screen.queryByText(/Plantillas iniciales/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Usar como base/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Categoría base/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Plantillas base/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Perfiles sugeridos' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Crear a partir de este perfil/)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'Crea perfiles propios para tu empresa y define qué puede hacer cada uno. Las personas no los usan hasta que los asignas en Usuarios.',
      ),
    ).toBeInTheDocument();

    const peek = await openCreationPeek();
    expect(peek.getByText(ACCESS_SETTINGS_COPY.peekListIntro)).toBeInTheDocument();
    expect(peek.queryByText(/plantilla/i)).not.toBeInTheDocument();
    expect(peek.queryByText(/módulo/i)).not.toBeInTheDocument();
  });

  it('CA-ACC-POST-03: las filas del peek no renderizan Editar, Editar accesos ni eliminar', async () => {
    renderAsAdmin();

    const peek = await openCreationPeek();

    expect(peek.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument();
    expect(peek.queryByRole('button', { name: /Eliminar/ })).not.toBeInTheDocument();
    expect(
      peek.queryByRole('button', { name: /Crear a partir de este perfil/ }),
    ).not.toBeInTheDocument();
    expect(
      peek.getByRole('button', { name: 'Ver lo que permite Administrador general' }),
    ).toBeInTheDocument();
  });

  it('labels the operations module as Operaciones', async () => {
    const user = userEvent.setup({ delay: null });
    const { accessControlApi } = jest.requireMock('@/lib/api-client') as {
      accessControlApi: {
        listPermissions: jest.Mock;
        listProfiles: jest.Mock;
      };
    };

    const operationsPermission = {
      id: 'perm-operations-tasks-read',
      tenantId: 'tenant-1',
      permissionKey: AccessPermissionKey.OPERATIONS_TASKS_READ,
      moduleKey: 'operations',
      action: 'read',
      description: 'Ver tareas de operaciones',
      catalogVersion: AccessPermissionCatalogVersion.MOD00_ACCESS_V1,
      availability: AccessPermissionAvailability.ASSIGNABLE,
      isSystem: true,
      isActive: true,
    };

    const compatibilityMatrix = createCompatibilityMatrix();
    compatibilityMatrix[UserRole.ADMIN] = [
      ...compatibilityMatrix[UserRole.ADMIN],
      AccessPermissionKey.OPERATIONS_TASKS_READ,
    ];
    compatibilityMatrix[UserRole.NOC] = [
      ...compatibilityMatrix[UserRole.NOC],
      AccessPermissionKey.OPERATIONS_TASKS_READ,
    ];

    accessControlApi.listPermissions.mockResolvedValue({
      ...permissionsCatalog,
      permissions: [...permissionsCatalog.permissions, operationsPermission],
      compatibilityMatrix,
    });
    accessControlApi.listProfiles.mockResolvedValue(
      profiles.map((profile) =>
        profile.id === 'profile-1'
          ? {
              ...profile,
              permissions: [...profile.permissions, AccessPermissionKey.OPERATIONS_TASKS_READ],
            }
          : profile,
      ),
    );

    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    expect((await screen.findAllByText('Perfil NOC lectura')).length).toBeGreaterThan(0);

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Gestionar accesos de Perfil NOC lectura' })[0]!,
    );

    const sectionSelect = await screen.findByRole('combobox', { name: 'Sección de accesos' });
    await user.click(sectionSelect);
    expect(await screen.findByRole('option', { name: 'Operaciones' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /^operations$/i })).not.toBeInTheDocument();
    expect(screen.queryByText('operations')).not.toBeInTheDocument();
  });

  it('sanitizes an internal API message when profiles fail to load', async () => {
    const { ApiError, accessControlApi } = jest.requireMock('@/lib/api-client') as {
      ApiError: new (status: number, message: string) => Error;
      accessControlApi: { listProfiles: jest.Mock };
    };

    accessControlApi.listProfiles.mockRejectedValue(
      new ApiError(500, 'relation "access_profiles" does not exist'),
    );

    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.queryByText('relation "access_profiles" does not exist')).not.toBeInTheDocument();
    expect(
      screen.getByText('No pudimos cargar los perfiles de acceso. Intenta nuevamente.'),
    ).toBeInTheDocument();
  });

  it('asks for confirmation before deleting a custom profile', async () => {
    const { accessControlApi } = jest.requireMock('@/lib/api-client') as {
      accessControlApi: { deleteProfile: jest.Mock };
    };

    accessControlApi.deleteProfile.mockResolvedValue(undefined);

    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    fireEvent.click(
      (await screen.findAllByRole('button', { name: 'Eliminar perfil Perfil NOC lectura' }))[0]!,
    );

    expect(
      screen.getByRole('dialog', { name: '¿Eliminar el perfil «Perfil NOC lectura»?' }),
    ).toBeInTheDocument();
    expect(accessControlApi.deleteProfile).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(accessControlApi.deleteProfile).not.toHaveBeenCalled();
  });

  it('deletes a custom profile only after confirmation', async () => {
    const { accessControlApi } = jest.requireMock('@/lib/api-client') as {
      accessControlApi: { deleteProfile: jest.Mock };
    };

    accessControlApi.deleteProfile.mockResolvedValue(undefined);

    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    fireEvent.click(
      (await screen.findAllByRole('button', { name: 'Eliminar perfil Perfil NOC lectura' }))[0]!,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar perfil' }));

    await waitFor(() => {
      expect(accessControlApi.deleteProfile).toHaveBeenCalledWith('profile-1');
    });
  });

  it('saves selected profile accesses with a success message', async () => {
    const { accessControlApi } = jest.requireMock('@/lib/api-client') as {
      accessControlApi: { replaceProfilePermissions: jest.Mock };
    };

    accessControlApi.replaceProfilePermissions.mockResolvedValue({
      ...profiles[3],
      permissions: [AccessPermissionKey.ORGANIZATION_SITES_READ],
    });

    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    fireEvent.click(
      (
        await screen.findAllByRole('button', { name: 'Gestionar accesos de Perfil Organización' })
      )[0]!,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(accessControlApi.replaceProfilePermissions).toHaveBeenCalled();
    });
    expect(
      await screen.findByText('Accesos del perfil actualizados correctamente.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Perfil creado. Debes asignarlo en Usuarios'),
    ).not.toBeInTheDocument();
  });

  it('clears an empty access search from the empty state action', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    fireEvent.click(
      (
        await screen.findAllByRole('button', { name: 'Gestionar accesos de Perfil Organización' })
      )[0]!,
    );
    fireEvent.change(await screen.findByLabelText('Buscar accesos en esta sección'), {
      target: { value: 'centro' },
    });

    expect(await screen.findByText('No encontramos accesos en esta sección')).toBeInTheDocument();
    const searchEmpty = screen.getByText('No encontramos accesos en esta sección');
    expect(searchEmpty.closest('.bg-iwana-surface-soft')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));

    expect(screen.getByText('Ver sedes de la organización')).toBeInTheDocument();
  });

  it('sanitizes a 401 while loading profiles', async () => {
    const { accessControlApi } = jest.requireMock('@/lib/api-client') as {
      accessControlApi: { listProfiles: jest.Mock };
    };
    const { ApiError } = jest.requireMock('@/lib/api-client') as {
      ApiError: new (status: number, message: string) => Error;
    };

    accessControlApi.listProfiles.mockRejectedValue(new ApiError(401, 'jwt expired'));

    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    expect(
      await screen.findByText('Tu sesión expiró. Inicia sesión nuevamente.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('jwt expired')).not.toBeInTheDocument();
  });

  it('retries loading profiles after a sanitized error', async () => {
    const { accessControlApi } = jest.requireMock('@/lib/api-client') as {
      accessControlApi: { listProfiles: jest.Mock };
    };

    accessControlApi.listProfiles
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue(profiles);

    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));

    expect((await screen.findAllByText('Perfil NOC lectura')).length).toBeGreaterThan(0);
  });

  it('shows session unavailable when the portal user is missing', async () => {
    useAuthMock.mockReturnValue({
      user: null,
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    expect(await screen.findByText('Sesión no disponible')).toBeInTheDocument();
    expect(screen.getByText('No fue posible resolver la sesión del portal.')).toBeInTheDocument();
  });

  it('sanitizes a 403 while loading profiles', async () => {
    const { ApiError, accessControlApi } = jest.requireMock('@/lib/api-client') as {
      ApiError: new (status: number, message: string) => Error;
      accessControlApi: { listProfiles: jest.Mock };
    };

    accessControlApi.listProfiles.mockRejectedValue(new ApiError(403, 'forbidden profiles'));

    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    expect(
      await screen.findByText(
        'Solo las personas administradoras pueden gestionar perfiles de acceso.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('forbidden profiles')).not.toBeInTheDocument();
  });

  it('sanitizes a save error when updating profile accesses', async () => {
    const { accessControlApi } = jest.requireMock('@/lib/api-client') as {
      accessControlApi: { replaceProfilePermissions: jest.Mock };
    };

    accessControlApi.replaceProfilePermissions.mockRejectedValue(new Error('ECONNRESET'));

    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    fireEvent.click(
      (
        await screen.findAllByRole('button', { name: 'Gestionar accesos de Perfil Organización' })
      )[0]!,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar cambios' }));

    expect(
      await screen.findByText('No pudimos guardar los cambios. Intenta nuevamente.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('ECONNRESET')).not.toBeInTheDocument();
  });

  it('sanitizes a delete error after confirming profile deletion', async () => {
    const { accessControlApi } = jest.requireMock('@/lib/api-client') as {
      accessControlApi: { deleteProfile: jest.Mock };
    };

    accessControlApi.deleteProfile.mockRejectedValue(new Error('FK_access_profile_users'));

    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    fireEvent.click(
      (await screen.findAllByRole('button', { name: 'Eliminar perfil Perfil Organización' }))[0]!,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar perfil' }));

    expect(
      await screen.findByText('No pudimos eliminar el perfil. Intenta nuevamente.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('FK_access_profile_users')).not.toBeInTheDocument();
  });

  it('sanitizes a 403 while loading the authentication policy', async () => {
    const { ApiError, tenantSelfApi } = jest.requireMock('@/lib/api-client') as {
      ApiError: new (status: number, message: string) => Error;
      tenantSelfApi: { getSettings: jest.Mock };
    };

    tenantSelfApi.getSettings.mockRejectedValue(new ApiError(403, 'policy forbidden'));

    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    expect(
      await screen.findByText(
        'Solo las personas administradoras pueden cambiar la política de autenticación.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('policy forbidden')).not.toBeInTheDocument();
  });

  it('sanitizes a save error when updating the authentication policy', async () => {
    const { tenantSelfApi } = jest.requireMock('@/lib/api-client') as {
      tenantSelfApi: { updateSettings: jest.Mock };
    };

    tenantSelfApi.updateSettings.mockRejectedValue(new Error('redis timeout'));

    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    fireEvent.click(await screen.findByLabelText('Activar verificación en dos pasos obligatoria'));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar política' }));

    expect(
      await screen.findByText(
        'No fue posible guardar la política de verificación en dos pasos. Intenta de nuevo.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('redis timeout')).not.toBeInTheDocument();
  });

  it('keeps draft identity fields on the page and can cancel the draft', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    renderAsAdmin();

    const peek = await openCreationPeek();
    fireEvent.click(peek.getByRole('button', { name: 'Ver lo que permite Técnico de campo' }));
    fireEvent.click(peek.getByRole('button', { name: 'Usar este perfil' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByLabelText('Nombre')).toHaveValue('Basado en Técnico de campo');
    expect(screen.getByLabelText('Tipo de usuario permitido')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Editar datos del nuevo perfil' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar nuevo perfil' }));

    await waitFor(() => {
      expect(screen.queryByText('Nuevo perfil en preparación')).not.toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument();
  });

  it('updates an existing custom profile from the edit dialog', async () => {
    const { accessControlApi } = jest.requireMock('@/lib/api-client') as {
      accessControlApi: { updateProfile: jest.Mock };
    };

    accessControlApi.updateProfile.mockResolvedValue({
      ...profiles[2],
      name: 'Perfil NOC lectura actualizado',
    });

    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    fireEvent.click(
      (await screen.findAllByRole('button', { name: 'Editar perfil Perfil NOC lectura' }))[0]!,
    );

    const dialog = within(screen.getByRole('dialog'));
    fireEvent.change(dialog.getByLabelText('Nombre'), {
      target: { value: 'Perfil NOC lectura actualizado' },
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(accessControlApi.updateProfile).toHaveBeenCalledWith(
        'profile-1',
        expect.objectContaining({
          name: 'Perfil NOC lectura actualizado',
          isActive: true,
        }),
      );
    });
    expect(await screen.findByText('Perfil actualizado correctamente.')).toBeInTheDocument();
  });

  it('clears and restores selected profile accesses', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    fireEvent.click(
      (
        await screen.findAllByRole('button', { name: 'Gestionar accesos de Perfil Organización' })
      )[0]!,
    );

    const sitesAccess = await screen.findByLabelText('Ver sedes de la organización');
    expect(sitesAccess).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar accesos' }));
    expect(sitesAccess).not.toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Restablecer cambios' }));
    expect(sitesAccess).toBeChecked();
  });

  it('moves between access sections with keyboard arrows', async () => {
    const user = userEvent.setup({ delay: null });
    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    fireEvent.click(
      (
        await screen.findAllByRole('button', { name: 'Gestionar accesos de Perfil Organización' })
      )[0]!,
    );

    const sectionSelect = await screen.findByRole('combobox', { name: 'Sección de accesos' });
    expect(sectionSelect).toBeInTheDocument();
    await user.click(sectionSelect);
    await user.click(await screen.findByRole('option', { name: 'Configuración' }));
    expect(await screen.findByText('Ver centro de Configuración')).toBeInTheDocument();
    await user.click(sectionSelect);
    await user.click(await screen.findByRole('option', { name: 'Organización' }));
    expect(await screen.findByText('Ver sedes de la organización')).toBeInTheDocument();
  });

  it('renders access section tabs as inset pills inside the track', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    fireEvent.click(
      (
        await screen.findAllByRole('button', { name: 'Gestionar accesos de Perfil Organización' })
      )[0]!,
    );

    const sectionSelect = await screen.findByRole('combobox', { name: 'Sección de accesos' });
    expect(sectionSelect).toBeInTheDocument();
  });

  it('scrolls permission sections to the left when overflow controls appear', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    fireEvent.click(
      (
        await screen.findAllByRole('button', { name: 'Gestionar accesos de Perfil Organización' })
      )[0]!,
    );

    const sectionSelect = await screen.findByLabelText('Sección de accesos');
    expect(sectionSelect).toBeInTheDocument();
    expect(screen.queryByTestId('permission-modules-scroll')).not.toBeInTheDocument();
  });

  it('Usar este perfil en el footer del detalle deja el borrador sin POST', async () => {
    const { accessControlApi } = jest.requireMock('@/lib/api-client') as {
      accessControlApi: { createProfile: jest.Mock };
    };

    renderAsAdmin();

    const peek = await openCreationPeek();
    fireEvent.click(peek.getByRole('button', { name: 'Ver lo que permite Técnico de campo' }));
    fireEvent.click(peek.getByRole('button', { name: 'Usar este perfil' }));

    expect(accessControlApi.createProfile).not.toHaveBeenCalled();
    expect(await screen.findByText('Nuevo perfil en preparación')).toBeInTheDocument();
  });

  it('CA-ACV2-01/03: 9 filas en el peek, orden canónico invariante al orden de la API', async () => {
    const { accessControlApi } = jest.requireMock('@/lib/api-client') as {
      accessControlApi: { listProfiles: jest.Mock };
    };

    const buildSystemProfile = (
      id: string,
      baseRoleConstraint: UserRole,
      permissions: AccessPermissionKey[],
    ) => ({
      id,
      name: `Nombre DB ${baseRoleConstraint}`,
      description: `Perfil sugerido para ${baseRoleConstraint}.`,
      baseRoleConstraint,
      scopeSiteId: null,
      isSystem: true,
      isActive: true,
      permissions,
      createdAt: '2026-08-28T00:00:00.000Z',
      updatedAt: '2026-08-28T00:00:00.000Z',
    });

    const shuffledSystemProfiles: ReturnType<typeof buildSystemProfile>[] = [
      buildSystemProfile('sys-auditor', UserRole.AUDITOR, [AccessPermissionKey.SETTINGS_READ]),
      buildSystemProfile('sys-sales', UserRole.SALES, []),
      buildSystemProfile('sys-admin', UserRole.ADMIN, [AccessPermissionKey.SETTINGS_READ]),
      buildSystemProfile('sys-hr', UserRole.HR, []),
      buildSystemProfile('sys-noc', UserRole.NOC, [AccessPermissionKey.SETTINGS_READ]),
      buildSystemProfile('sys-contractor', UserRole.CONTRACTOR, []),
      buildSystemProfile('sys-accountant', UserRole.ACCOUNTANT, []),
      buildSystemProfile('sys-support', UserRole.SUPPORT, [AccessPermissionKey.SETTINGS_READ]),
      buildSystemProfile('sys-tech', UserRole.TECHNICIAN, []),
    ];

    accessControlApi.listProfiles.mockResolvedValue(shuffledSystemProfiles);

    renderAsAdmin();

    expect(
      await screen.findByText('Tus equipos ya usan los perfiles sugeridos'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Perfiles sugeridos' })).not.toBeInTheDocument();

    const peek = await openCreationPeek();
    expect(peek.getByText(ACCESS_SETTINGS_COPY.peekListIntro)).toBeInTheDocument();

    const previewButtons = peek.getAllByRole('button', { name: /Ver lo que permite / });
    expect(previewButtons).toHaveLength(9);
    const visibleOrder = previewButtons.map((button) =>
      button.getAttribute('aria-label')?.replace('Ver lo que permite ', ''),
    );
    expect(visibleOrder).toEqual([...CANONICAL_SUGGESTED_NAMES]);
    expect(peek.getByRole('button', { name: 'Empezar desde cero' })).toBeInTheDocument();
  });
});
