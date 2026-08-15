import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  AccessPermissionAvailability,
  AccessPermissionCatalogVersion,
  AccessPermissionKey,
  UserRole,
} from '@iwana/shared';
import { AccessControlSettingsClient } from './AccessControlSettingsClient';

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
    description: 'Plantilla inicial para la administración general de la empresa.',
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
    description: 'Plantilla inicial para agenda y ejecucion de trabajo de campo.',
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

    expect(await screen.findByRole('heading', { name: 'Perfiles sugeridos' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Perfiles personalizados' })).toBeInTheDocument();
    expect(screen.getByText('Administrador general')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Crear perfil' }));
    fireEvent.click(screen.getByText('Empezar desde cero'));

    const dialog = within(screen.getByRole('dialog'));

    fireEvent.change(dialog.getByLabelText('Nombre'), { target: { value: 'Perfil soporte' } });
    fireEvent.change(dialog.getByLabelText('Descripción'), {
      target: { value: 'Perfil para soporte' },
    });
    fireEvent.change(dialog.getByLabelText('Tipo de usuario permitido'), {
      target: { value: UserRole.SUPPORT },
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Crear perfil' }));

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

    expect(await screen.findByText('Perfil creado correctamente.')).toBeInTheDocument();
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
    expect(screen.getByText('Verificación en dos pasos global opcional')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Activar verificación en dos pasos obligatoria'),
    ).toBeInTheDocument();
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

    expect(screen.getByText('Verificación en dos pasos global activa')).toBeInTheDocument();

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
      screen.getAllByRole('button', { name: /Editar accesos de Perfil NOC lectura/i }).length,
    ).toBeGreaterThan(0);
  });

  it('opens a creation selector with template and blank-start options', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    await screen.findByRole('heading', { name: 'Perfiles personalizados' });

    fireEvent.click(screen.getByRole('button', { name: 'Crear perfil' }));

    expect(screen.getByText('Usar un perfil sugerido')).toBeInTheDocument();
    expect(screen.getByText('Empezar desde cero')).toBeInTheDocument();
  });

  it('opens dialog pre-filled when Empezar desde cero is chosen', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    await screen.findByRole('heading', { name: 'Perfiles personalizados' });

    fireEvent.click(screen.getByRole('button', { name: 'Crear perfil' }));
    fireEvent.click(screen.getByText('Empezar desde cero'));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('opens profile data dialog when a system template is chosen as base', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    await screen.findByRole('heading', { name: 'Perfiles personalizados' });

    fireEvent.click(
      within(
        screen.getByText('Administrador general').closest('div.rounded-2xl') as HTMLElement,
      ).getByRole('button', { name: /Crear a partir de este perfil/ }),
    );

    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByLabelText('Nombre')).toHaveValue('Basado en Administrador general');
    expect(within(dialog).getByLabelText('Descripción')).toHaveValue(
      'Plantilla inicial para la administración general de la empresa.',
    );
  });

  it('should render custom roles in the roles table', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    await screen.findByRole('heading', { name: 'Perfiles sugeridos' });

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

  it('shows templates and custom roles as the primary entry points', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    expect(await screen.findByRole('heading', { name: 'Perfiles sugeridos' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Perfiles personalizados' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Crea perfiles de acceso, define lo que puede usar cada uno y apóyate en perfiles sugeridos para empezar más rápido.',
      ),
    ).toBeInTheDocument();
  });

  it('renders actionable system templates', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    expect(await screen.findByText('Administrador general')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Ver lo que permite/ }).length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('button', { name: /Crear a partir de este perfil/ }).length,
    ).toBeGreaterThan(0);
  });

  it('enters draft mode from a system template and shows the full assignable catalog with template defaults checked', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    await screen.findByText('Técnico de campo');
    await screen.findByRole('heading', { name: 'Perfiles personalizados' });

    fireEvent.click(
      within(
        screen.getByText('Técnico de campo').closest('div.rounded-2xl') as HTMLElement,
      ).getByRole('button', { name: /Crear a partir de este perfil/ }),
    );

    await screen.findByRole('status');
    expect(
      await screen.findByRole('button', { name: 'Editar datos del nuevo perfil' }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText('Ejecutar órdenes de trabajo asignadas')).toBeChecked();
    });
    fireEvent.click(await screen.findByRole('tab', { name: /Control de acceso/i }));
    expect(await screen.findByLabelText(/Administrar perfiles de acceso/i)).toBeDisabled();
    expect(await screen.findByLabelText(/Administrar perfiles de acceso/i)).not.toBeChecked();
    expect(await screen.findByRole('tab', { name: /Control de acceso/i })).toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: /Operaciones de campo/i })).toBeInTheDocument();
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

    await screen.findByText('Técnico de campo');
    await screen.findByRole('heading', { name: 'Perfiles personalizados' });

    fireEvent.click(
      within(
        screen.getByText('Técnico de campo').closest('div.rounded-2xl') as HTMLElement,
      ).getByRole('button', { name: /Crear a partir de este perfil/ }),
    );

    expect((await screen.findAllByText(/Basado en Técnico de campo/i)).length).toBeGreaterThan(0);
    fireEvent.click(await screen.findByRole('tab', { name: /Control de acceso/i }));
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

  it('shows template permissions preview when Ver accesos is clicked', async () => {
    const requestAnimationFrameSpy = jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });

    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    const technicianCard = (await screen.findByText('Técnico de campo')).closest(
      'div.rounded-2xl',
    ) as HTMLElement;
    const verAccesosButton = within(technicianCard).getByRole('button', {
      name: /Ver lo que permite/,
    });

    fireEvent.click(verAccesosButton);

    expect(screen.getByText(/Lo que permite este perfil/i)).toBeInTheDocument();
    expect(screen.getByText('Ejecutar órdenes de trabajo asignadas')).toBeInTheDocument();

    const closeButton = screen.getByRole('button', { name: 'Cerrar' });
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(verAccesosButton).toHaveFocus();
    });

    requestAnimationFrameSpy.mockRestore();
  });

  it('selects the module with active permissions first and allows filtering inside the tab', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    expect((await screen.findAllByText('Perfil Organización')).length).toBeGreaterThan(0);

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Editar accesos de Perfil Organización' })[0]!,
    );

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Organización/i })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });

    expect(screen.getByRole('tab', { name: /Configuración/i })).toBeInTheDocument();
    expect(screen.queryByText('Catálogo de accesos')).not.toBeInTheDocument();
    expect(screen.getByText('Ver sedes de la organización')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Buscar acceso dentro de esta sección'), {
      target: { value: 'sedes' },
    });

    expect(screen.getByText('Ver sedes de la organización')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Buscar acceso dentro de esta sección'), {
      target: { value: 'centro' },
    });

    expect(screen.getByText('No encontramos accesos en esta sección')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Configuración/i }));

    expect(screen.getByRole('tab', { name: /Configuración/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('Ver centro de Configuración')).toBeInTheDocument();
  });

  it('shows horizontal scroll controls when permission modules overflow', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    const scrollByMock = jest.fn(function scrollByMock(
      this: HTMLElement,
      options?: ScrollToOptions,
    ) {
      const nextLeft = typeof options?.left === 'number' ? options.left : 0;
      Object.defineProperty(this, 'scrollLeft', {
        configurable: true,
        value: Math.max(0, nextLeft),
        writable: true,
      });
      fireEvent.scroll(this);
    });

    Object.defineProperty(HTMLElement.prototype, 'scrollBy', {
      configurable: true,
      value: scrollByMock,
    });

    render(<AccessControlSettingsClient />);

    expect((await screen.findAllByText('Perfil Organización')).length).toBeGreaterThan(0);

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Editar accesos de Perfil Organización' })[0]!,
    );

    const scrollContainer = await screen.findByTestId('permission-modules-scroll');

    Object.defineProperty(scrollContainer, 'clientWidth', {
      configurable: true,
      value: 240,
    });
    Object.defineProperty(scrollContainer, 'scrollWidth', {
      configurable: true,
      value: 640,
    });
    Object.defineProperty(scrollContainer, 'scrollLeft', {
      configurable: true,
      value: 0,
      writable: true,
    });

    fireEvent(window, new Event('resize'));
    fireEvent.scroll(scrollContainer);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Desplazar secciones a la derecha' }),
      ).toBeInTheDocument();
    });

    const scrollRightButton = screen.getByRole('button', {
      name: 'Desplazar secciones a la derecha',
    });
    fireEvent.click(scrollRightButton);

    expect(scrollByMock).toHaveBeenCalled();
  });

  it('renders contextual aria labels for profile actions', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'admin-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    expect((await screen.findAllByText('Perfil NOC lectura')).length).toBeGreaterThan(0);

    expect(
      screen.getAllByRole('button', { name: 'Editar accesos de Perfil NOC lectura' }).length,
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
      await screen.findByText('Aún no has creado perfiles personalizados'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Crear primera/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Crear perfil' })).toHaveLength(1);
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
    expect(screen.getByRole('heading', { name: 'Perfiles sugeridos' })).toBeVisible();
  });

  it('labels the operations module as Operaciones', async () => {
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
      screen.getAllByRole('button', { name: 'Editar accesos de Perfil NOC lectura' })[0]!,
    );

    await screen.findByRole('tablist', { name: 'Secciones de acceso' });

    expect(screen.getByRole('tab', { name: /^Operaciones \d/ })).toBeVisible();
    expect(screen.queryByRole('tab', { name: /^operations \d/ })).not.toBeInTheDocument();
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
});
