import { fireEvent, render, screen } from '@testing-library/react';
import {
  AccessPermissionKey,
  SettingsSectionKey,
  SettingsSectionStatus,
  UserRole,
} from '@iwana/shared';
import { SettingsSubTabs } from './SettingsSubTabs';
import { SettingsClient } from './SettingsClient';

const useAuthMock = jest.fn();

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={typeof href === 'string' ? href : '#'} {...props}>
      {children}
    </a>
  ),
}));

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => useAuthMock(),
}));

jest.mock('./WfmOperatingHoursManager', () => ({
  WfmOperatingHoursManager: ({ canEdit }: { canEdit: boolean }) => (
    <div>Horarios operativos {canEdit ? 'editable' : 'solo lectura'}</div>
  ),
}));

jest.mock('@/lib/api-client', () => ({
  ApiError: class MockApiError extends Error {
    status: number;
    code: string;
    details?: unknown;

    constructor(status: number, code: string, message: string, details?: unknown) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.code = code;
      this.details = details;
    }
  },
  tenantSelfApi: {
    getProfile: jest.fn(),
    getSettings: jest.fn(),
  },
  configurationApi: {
    settingsSections: {
      list: jest.fn(),
    },
  },
  accessControlApi: {
    getMyEffectivePermissions: jest.fn(),
  },
  dashboardApi: {
    getSummary: jest.fn(),
  },
}));

describe('SettingsSubTabs', () => {
  it('should render branding sub-sections and switch active item', () => {
    const onChange = jest.fn();

    render(
      <SettingsSubTabs
        items={[
          { id: 'identity', label: 'Identidad visual' },
          { id: 'plans', label: 'Planes' },
          { id: 'products', label: 'Productos' },
          { id: 'coverage', label: 'Cobertura' },
        ]}
        activeTab="identity"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Planes' }));
    expect(onChange).toHaveBeenCalledWith('plans');
  });
});

describe('SettingsClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthMock.mockReturnValue({
      user: { id: 'user-1', name: 'Test User', email: 'user@test.com', role: UserRole.ADMIN },
      isLoading: false,
    });

    const { accessControlApi, configurationApi } = jest.requireMock('@/lib/api-client');
    accessControlApi.getMyEffectivePermissions.mockResolvedValue({
      userId: 'user-1',
      role: UserRole.ADMIN,
      effectivePermissions: [
        AccessPermissionKey.SETTINGS_READ,
        AccessPermissionKey.ORGANIZATION_SITES_READ,
        AccessPermissionKey.ACCESS_PERMISSIONS_READ,
      ],
      recoveryPermissions: [],
      profileSources: [],
    });
    configurationApi.settingsSections.list.mockResolvedValue([
      {
        key: SettingsSectionKey.ORGANIZATION,
        label: 'Perfil empresarial y organización',
        description:
          'Concentra perfil empresarial, configuración operativa base y sedes registradas.',
        ownerModule: 'MOD00 / Organización',
        status: SettingsSectionStatus.AVAILABLE,
        route: '/dashboard/settings/organization',
        requiredPermissions: [
          AccessPermissionKey.SETTINGS_READ,
          AccessPermissionKey.ORGANIZATION_SITES_READ,
        ],
      },
      {
        key: SettingsSectionKey.ACCESS,
        label: 'Perfiles de acceso',
        description: 'Perfiles de acceso, accesos y plantillas iniciales.',
        ownerModule: 'Configuración / Accesos',
        status: SettingsSectionStatus.AVAILABLE,
        route: '/dashboard/settings/access',
        requiredPermissions: [
          AccessPermissionKey.SETTINGS_READ,
          AccessPermissionKey.ACCESS_PERMISSIONS_READ,
        ],
      },
      {
        key: SettingsSectionKey.BILLING,
        label: 'Billing',
        description: 'Futuro.',
        ownerModule: 'Billing futuro',
        status: SettingsSectionStatus.COMING_SOON,
        route: null,
        requiredPermissions: [],
      },
    ]);
  });

  it('should render available sections with real routes and future states', async () => {
    render(<SettingsClient />);

    expect(await screen.findByText('Secciones de configuración')).toBeInTheDocument();
    expect(screen.getByText('Secciones de configuración')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Organización/i })).toHaveAttribute(
      'href',
      '/dashboard/settings/organization',
    );
    expect(screen.queryByRole('link', { name: /Operación de campo/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Perfiles de acceso/i })).toHaveAttribute(
      'href',
      '/dashboard/settings/access',
    );
    expect(screen.getByText('Próximamente')).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByText('Guardar perfil empresarial')).not.toBeInTheDocument();
    expect(screen.queryByText('Guardar configuración operativa')).not.toBeInTheDocument();
  });

  it('should degrade unavailable links when requiredPermissions are missing', async () => {
    const { accessControlApi } = jest.requireMock('@/lib/api-client');
    accessControlApi.getMyEffectivePermissions.mockResolvedValue({
      userId: 'user-1',
      role: UserRole.ADMIN,
      effectivePermissions: [AccessPermissionKey.SETTINGS_READ],
      recoveryPermissions: [],
      profileSources: [],
    });

    render(<SettingsClient />);

    expect(await screen.findByText('Secciones de configuración')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Operación de campo/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Perfiles de acceso/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Perfil empresarial y organización/i }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText('Acceso restringido')).toHaveLength(2);
    expect(screen.getAllByText(/Tu perfil no tiene acceso a esta sección/i)).toHaveLength(2);
  });
});
