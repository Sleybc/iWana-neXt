import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  AccessPermissionKey,
  BusinessHoursWeekday,
  OrganizationSiteCapability,
  OrganizationSiteType,
  UserRole,
} from '@iwana/shared';
import { OrganizationSettingsClient } from './OrganizationSettingsClient';

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
  organizationApi: {
    list: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
    replaceBusinessHours: jest.fn(),
    replaceAssignments: jest.fn(),
    replaceResponsibilities: jest.fn(),
  },
  accessControlApi: {
    getMyEffectivePermissions: jest.fn(),
  },
  tenantSelfApi: {
    getProfile: jest.fn(),
    getSettings: jest.fn(),
  },
}));

const tenantProfile = {
  id: 'tenant-1',
  name: 'ISP Demo',
  slug: 'isp-demo',
  status: 'ACTIVE' as const,
  contactEmail: 'admin@isp-demo.com',
  legalName: 'ISP Demo S.A.S.',
  nit: '900123456',
  nitDv: '1',
  city: 'Bogotá',
  department: 'Cundinamarca',
  countryCode: 'CO',
  phone: '+573001112233',
  website: null,
  createdAt: '2026-05-21T00:00:00.000Z',
  logoLightUrl: null,
  logoLightAssetId: null,
  logoDarkUrl: null,
  logoDarkAssetId: null,
  sealLightUrl: null,
  sealLightAssetId: null,
  sealDarkUrl: null,
  sealDarkAssetId: null,
  faviconLightUrl: null,
  faviconLightAssetId: null,
  faviconDarkUrl: null,
  faviconDarkAssetId: null,
  loginBackgroundLightUrl: null,
  loginBackgroundLightAssetId: null,
  loginBackgroundDarkUrl: null,
  loginBackgroundDarkAssetId: null,
};

const tenantSettings = {
  timezone: 'America/Bogota',
  currency: 'COP',
  language: 'es-CO',
  country: 'CO',
  features: {
    billing: false,
    mfa_required_all: true,
  },
};

const organizationSummary = [
  {
    id: 'site-1',
    name: 'Sede centro',
    code: 'CENTRO',
    siteType: OrganizationSiteType.OFFICE,
    address: 'Cra 10 # 10-10',
    municipality: 'Bogotá',
    department: 'Cundinamarca',
    capabilities: [OrganizationSiteCapability.ADMIN_OFFICE],
    isActive: true,
  },
];

const organizationDetail = {
  ...organizationSummary[0],
  siteType: OrganizationSiteType.OFFICE,
  address: 'Cra 10 # 10-10',
  municipality: 'Bogotá',
  department: 'Cundinamarca',
  country: 'CO',
  latitude: 4.583729568298588,
  longitude: -74.44546953713595,
  contactName: null,
  contactPhone: null,
  isPrimary: true,
  businessHoursMode: 'BASE' as const,
  businessHours: [
    {
      weekday: BusinessHoursWeekday.MONDAY,
      isOpen: true,
      opensAt: '08:00:00',
      closesAt: '18:00:00',
    },
  ],
  businessHoursResolved: [
    {
      weekday: BusinessHoursWeekday.MONDAY,
      isOpen: true,
      opensAt: '08:00:00',
      closesAt: '18:00:00',
    },
  ],
  assignments: [],
  responsibilities: [],
  createdAt: '2026-05-21T00:00:00.000Z',
  updatedAt: '2026-05-21T00:00:00.000Z',
};

describe('OrganizationSettingsClient', () => {
  beforeEach(() => {
    const { accessControlApi, organizationApi, tenantSelfApi } = jest.requireMock(
      '@/lib/api-client',
    ) as {
      accessControlApi: {
        getMyEffectivePermissions: jest.Mock;
      };
      organizationApi: {
        list: jest.Mock;
        get: jest.Mock;
        create: jest.Mock;
        delete: jest.Mock;
        update: jest.Mock;
      };
      tenantSelfApi: {
        getProfile: jest.Mock;
        getSettings: jest.Mock;
      };
    };

    jest.clearAllMocks();
    useAuthMock.mockReturnValue({
      user: { id: 'user-1', role: UserRole.ADMIN },
      isLoading: false,
    });
    accessControlApi.getMyEffectivePermissions.mockResolvedValue({
      userId: 'user-1',
      role: UserRole.ADMIN,
      effectivePermissions: [
        AccessPermissionKey.ORGANIZATION_SITES_READ,
        AccessPermissionKey.ORGANIZATION_SITES_MANAGE,
      ],
      recoveryPermissions: [],
      profileSources: [],
    });
    tenantSelfApi.getProfile.mockResolvedValue(tenantProfile);
    tenantSelfApi.getSettings.mockResolvedValue(tenantSettings);
    organizationApi.list.mockResolvedValue(organizationSummary);
    organizationApi.get.mockResolvedValue(organizationDetail);
    organizationApi.create.mockResolvedValue({
      ...organizationDetail,
      id: 'site-2',
      name: 'Sede norte',
      code: 'NORTE',
      capabilities: [],
    });
    organizationApi.update.mockResolvedValue({
      ...organizationDetail,
      capabilities: [OrganizationSiteCapability.ADMIN_OFFICE, OrganizationSiteCapability.NOC],
    });
    organizationApi.delete.mockResolvedValue(undefined);
  });

  it('should render a compact site table with row actions and no detail panel', async () => {
    render(<OrganizationSettingsClient />);

    const row = await screen.findByRole('row', {
      name: /Sede centro CENTRO Oficina Cra 10 # 10-10 Bogotá, Cundinamarca/i,
    });

    expect(within(row).getByText('Oficina')).toBeInTheDocument();
    expect(within(row).getByText('Cra 10 # 10-10')).toBeInTheDocument();
    expect(within(row).getByText('Bogotá, Cundinamarca')).toBeInTheDocument();
    expect(
      within(row).getByRole('button', { name: /Editar sede Sede centro/i }),
    ).toBeInTheDocument();
    expect(
      within(row).getByRole('button', { name: /Dar de baja sede Sede centro/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Detalle de sede')).not.toBeInTheDocument();
    expect(screen.queryByText('Servicios de la sede')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ver detalle/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar servicios' })).not.toBeInTheDocument();
    expect(screen.queryByText('Ir a Calendario operativo y jornadas →')).not.toBeInTheDocument();
  });

  it('should render the compact site table in read-only mode without edit or delete actions', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'user-2', role: UserRole.SUPPORT },
      isLoading: false,
    });

    render(<OrganizationSettingsClient />);

    const row = await screen.findByRole('row', {
      name: /Sede centro CENTRO Oficina Cra 10 # 10-10 Bogotá, Cundinamarca/i,
    });

    expect(screen.getByText('Sedes registradas')).toBeInTheDocument();
    expect(within(row).getByText('Oficina')).toBeInTheDocument();
    expect(within(row).getByText('Cra 10 # 10-10')).toBeInTheDocument();
    expect(within(row).getByText('Bogotá, Cundinamarca')).toBeInTheDocument();
    expect(within(row).getByText('Sin acciones disponibles')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crear sede' })).not.toBeInTheDocument();
    expect(
      within(row).queryByRole('button', { name: /Editar sede Sede centro/i }),
    ).not.toBeInTheDocument();
    expect(
      within(row).queryByRole('button', { name: /Dar de baja sede Sede centro/i }),
    ).not.toBeInTheDocument();
  });

  it('should reset capabilities on create and submit them in the same payload', async () => {
    const { organizationApi } = jest.requireMock('@/lib/api-client') as {
      organizationApi: {
        get: jest.Mock;
        create: jest.Mock;
      };
    };

    render(<OrganizationSettingsClient />);

    fireEvent.click(await screen.findByRole('button', { name: /Editar sede Sede centro/i }));

    let dialog = within(await screen.findByRole('dialog'));

    fireEvent.click(dialog.getByRole('tab', { name: 'Servicios' }));

    expect(dialog.getByRole('checkbox', { name: 'Gestión administrativa' })).toBeChecked();

    fireEvent.click(dialog.getByRole('button', { name: 'Cancelar' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Crear sede' }));

    dialog = within(screen.getByRole('dialog'));

    expect(dialog.getByRole('tab', { name: 'Información de la sede' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    fireEvent.click(dialog.getByRole('tab', { name: 'Servicios' }));

    expect(dialog.getByRole('checkbox', { name: 'Gestión administrativa' })).not.toBeChecked();
    expect(dialog.getByRole('checkbox', { name: 'Operación NOC' })).not.toBeChecked();

    fireEvent.click(dialog.getByRole('tab', { name: 'Información de la sede' }));

    fireEvent.change(dialog.getByLabelText('Nombre'), { target: { value: 'Sede norte' } });
    fireEvent.change(dialog.getByLabelText('Código'), { target: { value: 'NORTE' } });
    fireEvent.change(dialog.getByLabelText('Coordenadas'), {
      target: { value: '4.6486259, -74.0651466' },
    });
    fireEvent.change(dialog.getByLabelText('Nombre de contacto'), {
      target: { value: 'Contacto Test' },
    });
    fireEvent.change(dialog.getByLabelText('Teléfono de contacto'), {
      target: { value: '+573001112233' },
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Crear sede' }));

    await waitFor(() => {
      expect(organizationApi.get).toHaveBeenCalledWith('site-1');
      expect(organizationApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Sede norte',
          code: 'NORTE',
          siteType: OrganizationSiteType.OFFICE,
          capabilities: [],
          latitude: 4.6486259,
          longitude: -74.0651466,
          contactName: 'Contacto Test',
          contactPhone: '+573001112233',
        }),
      );
    });
  });

  it('should hydrate capabilities on edit and submit them with update', async () => {
    const { organizationApi } = jest.requireMock('@/lib/api-client') as {
      organizationApi: {
        get: jest.Mock;
        update: jest.Mock;
      };
    };

    render(<OrganizationSettingsClient />);

    fireEvent.click(await screen.findByRole('button', { name: /Editar sede Sede centro/i }));

    const dialog = within(await screen.findByRole('dialog'));

    fireEvent.change(dialog.getByLabelText('Nombre de contacto'), {
      target: { value: 'Contacto Test' },
    });
    fireEvent.change(dialog.getByLabelText('Teléfono de contacto'), {
      target: { value: '+573001112233' },
    });

    fireEvent.click(dialog.getByRole('tab', { name: 'Servicios' }));

    expect(dialog.getByRole('checkbox', { name: 'Gestión administrativa' })).toBeChecked();
    expect(dialog.getByRole('checkbox', { name: 'Operación NOC' })).not.toBeChecked();

    fireEvent.click(dialog.getByRole('checkbox', { name: 'Operación NOC' }));
    fireEvent.click(dialog.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(organizationApi.get).toHaveBeenCalledWith('site-1');
      expect(organizationApi.update).toHaveBeenCalledWith(
        'site-1',
        expect.objectContaining({
          capabilities: [OrganizationSiteCapability.ADMIN_OFFICE, OrganizationSiteCapability.NOC],
        }),
      );
    });
  });

  it('should submit rounded coordinates from the combined field during update', async () => {
    const { organizationApi } = jest.requireMock('@/lib/api-client') as {
      organizationApi: {
        update: jest.Mock;
      };
    };

    render(<OrganizationSettingsClient />);

    fireEvent.click(await screen.findByRole('button', { name: /Editar sede Sede centro/i }));

    const dialog = within(await screen.findByRole('dialog'));

    expect(dialog.getByLabelText('Coordenadas')).toHaveValue('4.5837296, -74.4454695');

    fireEvent.change(dialog.getByLabelText('Nombre de contacto'), {
      target: { value: 'Angelica Cruz' },
    });
    fireEvent.change(dialog.getByLabelText('Teléfono de contacto'), {
      target: { value: '3229411662' },
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(organizationApi.update).toHaveBeenCalledWith(
        'site-1',
        expect.objectContaining({
          latitude: 4.5837296,
          longitude: -74.4454695,
          contactName: 'Angelica Cruz',
          contactPhone: '3229411662',
        }),
      );
    });
  });

  it('should allow clearing all services from the same edit dialog', async () => {
    const { organizationApi } = jest.requireMock('@/lib/api-client') as {
      organizationApi: {
        update: jest.Mock;
      };
    };

    organizationApi.update.mockResolvedValue({
      ...organizationDetail,
      capabilities: [],
    });

    render(<OrganizationSettingsClient />);

    fireEvent.click(await screen.findByRole('button', { name: /Editar sede Sede centro/i }));

    const dialog = within(await screen.findByRole('dialog'));

    fireEvent.change(dialog.getByLabelText('Nombre de contacto'), {
      target: { value: 'Contacto Test' },
    });
    fireEvent.change(dialog.getByLabelText('Teléfono de contacto'), {
      target: { value: '+573001112233' },
    });

    fireEvent.click(dialog.getByRole('tab', { name: 'Servicios' }));
    fireEvent.click(dialog.getByRole('checkbox', { name: 'Gestión administrativa' }));
    fireEvent.click(dialog.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(organizationApi.update).toHaveBeenCalledWith(
        'site-1',
        expect.objectContaining({
          capabilities: [],
        }),
      );
    });
  });

  it('should keep profile and operational settings visible when organization sites return 403', async () => {
    const { organizationApi } = jest.requireMock('@/lib/api-client') as {
      organizationApi: {
        list: jest.Mock;
      };
    };

    organizationApi.list.mockRejectedValue(
      new (jest.requireMock('@/lib/api-client').ApiError)(403, 'Forbidden resource'),
    );

    render(<OrganizationSettingsClient />);

    expect(await screen.findByText('Perfil empresarial')).toBeInTheDocument();
    expect(screen.getByText('Configuración operativa')).toBeInTheDocument();
    expect(screen.getByText('Sedes no disponibles')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crear sede' })).not.toBeInTheDocument();
    expect(screen.queryByText('Sedes registradas')).not.toBeInTheDocument();
  });

  it('should keep the compact table visible for admin read-only without row actions', async () => {
    const { accessControlApi } = jest.requireMock('@/lib/api-client') as {
      accessControlApi: {
        getMyEffectivePermissions: jest.Mock;
      };
    };

    accessControlApi.getMyEffectivePermissions.mockResolvedValue({
      userId: 'user-1',
      role: UserRole.ADMIN,
      effectivePermissions: [AccessPermissionKey.ORGANIZATION_SITES_READ],
      recoveryPermissions: [],
      profileSources: [],
    });

    render(<OrganizationSettingsClient />);

    expect(await screen.findByText('Sedes registradas')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crear sede' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Editar sede Sede centro/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Dar de baja sede Sede centro/i }),
    ).not.toBeInTheDocument();
  });

  it('should skip loading organization sites when effective permissions do not grant access', async () => {
    const { accessControlApi, organizationApi } = jest.requireMock('@/lib/api-client') as {
      accessControlApi: {
        getMyEffectivePermissions: jest.Mock;
      };
      organizationApi: {
        list: jest.Mock;
      };
    };

    accessControlApi.getMyEffectivePermissions.mockResolvedValue({
      userId: 'user-1',
      role: UserRole.ADMIN,
      effectivePermissions: [],
      recoveryPermissions: [],
      profileSources: [],
    });

    render(<OrganizationSettingsClient />);

    expect(await screen.findByText('Perfil empresarial')).toBeInTheDocument();
    expect(screen.getByText('Sedes no disponibles')).toBeInTheDocument();
    expect(organizationApi.list).not.toHaveBeenCalled();
  });

  it('should soft-delete the site from its row action and refresh the list', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const { organizationApi } = jest.requireMock('@/lib/api-client') as {
      organizationApi: {
        list: jest.Mock;
        delete: jest.Mock;
      };
    };
    let deleted = false;

    organizationApi.list.mockImplementation(async () => (deleted ? [] : organizationSummary));
    organizationApi.delete.mockImplementation(async () => {
      deleted = true;
    });

    render(<OrganizationSettingsClient />);

    fireEvent.click(await screen.findByRole('button', { name: /Dar de baja sede Sede centro/i }));

    await waitFor(() => {
      expect(organizationApi.delete).toHaveBeenCalledWith('site-1');
    });

    await waitFor(() => {
      expect(organizationApi.list.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    expect(await screen.findByText('Sede dada de baja correctamente.')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Dar de baja sede Sede centro/i }),
    ).not.toBeInTheDocument();

    confirmSpy.mockRestore();
  });
});
