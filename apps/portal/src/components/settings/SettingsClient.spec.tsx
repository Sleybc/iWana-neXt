import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  AccessPermissionKey,
  SettingsSectionKey,
  SettingsSectionStatus,
  UserRole,
} from '@iwana/shared';
import type { SettingsSection } from '@/lib/api-client';
import { SETTINGS_HUB_COPY } from './mod00-settings-labels';
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
    settingsPriority: {
      get: jest.fn(),
    },
  },
  accessControlApi: {
    getMyEffectivePermissions: jest.fn(),
  },
  dashboardApi: {
    getSummary: jest.fn(),
  },
}));

const settingsSectionsFixture: SettingsSection[] = [
  {
    key: SettingsSectionKey.ORGANIZATION,
    label: 'Perfil empresarial y organización',
    description: 'Concentra perfil empresarial, configuración operativa base y sedes registradas.',
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
  {
    key: SettingsSectionKey.CALENDAR,
    label: 'Calendario operativo y jornadas',
    description: 'Horarios de empresa y eventualidades operativas.',
    ownerModule: 'MOD00 / Organización + MOD09 / WFM',
    status: SettingsSectionStatus.AVAILABLE,
    route: '/dashboard/settings/calendar',
    requiredPermissions: [AccessPermissionKey.SETTINGS_READ],
  },
  {
    key: SettingsSectionKey.BRANDING,
    label: 'Marca',
    description: 'Imagen institucional y activos visuales de la empresa.',
    ownerModule: 'Tenant / Branding',
    status: SettingsSectionStatus.AVAILABLE,
    route: '/dashboard/settings/branding',
    requiredPermissions: [AccessPermissionKey.SETTINGS_READ],
  },
];

const defaultSettingsPriority = {
  state: 'ACTION_REQUIRED',
  item: {
    key: 'MFA_POLICY_DISABLED',
    level: 'HIGH',
    sectionKey: SettingsSectionKey.ACCESS,
    targetPath: '/dashboard/settings/access#politicas-de-autenticacion',
  },
  evaluation: 'COMPLETE',
  unknownSources: [],
} as const;

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
    configurationApi.settingsSections.list.mockResolvedValue(settingsSectionsFixture);
    configurationApi.settingsPriority.get.mockResolvedValue(defaultSettingsPriority);
  });

  it('should render available sections with real routes and future states', async () => {
    render(<SettingsClient />);

    expect(await screen.findByText('Secciones de configuración')).toBeInTheDocument();
    expect(screen.getByText('Recomendado ahora')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Configurar verificación' })).toHaveAttribute(
      'href',
      '/dashboard/settings/access#politicas-de-autenticacion',
    );
    expect(screen.getByText('Activa la verificación en dos pasos')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Protege el acceso de toda la empresa haciendo obligatoria la verificación en dos pasos.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Secciones de configuración')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Organización/i })).toHaveAttribute(
      'href',
      '/dashboard/settings/organization',
    );
    expect(screen.queryByRole('link', { name: /Operación de campo/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Perfiles y autenticación/i })).toHaveAttribute(
      'href',
      '/dashboard/settings/access',
    );
    expect(screen.getByText('Facturación')).toBeInTheDocument();
    expect(screen.queryByText('Billing')).not.toBeInTheDocument();
    expect(screen.getByText('Próximamente')).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByText('Guardar perfil empresarial')).not.toBeInTheDocument();
    expect(screen.queryByText('Guardar configuración operativa')).not.toBeInTheDocument();
  });

  it.each([
    {
      key: 'MFA_POLICY_DISABLED',
      level: 'HIGH',
      sectionKey: SettingsSectionKey.ACCESS,
      targetPath: '/dashboard/settings/access#politicas-de-autenticacion',
      title: 'Activa la verificación en dos pasos',
      description:
        'Protege el acceso de toda la empresa haciendo obligatoria la verificación en dos pasos.',
      action: 'Configurar verificación',
    },
    {
      key: 'MFA_ENROLLMENT_INCOMPLETE',
      level: 'HIGH',
      sectionKey: SettingsSectionKey.ACCESS,
      targetPath: '/dashboard/settings/access#politicas-de-autenticacion',
      title: 'Completa la verificación del equipo',
      description: 'Aún hay personas activas sin verificación en dos pasos.',
      action: 'Revisar autenticación',
    },
    {
      key: 'NO_ACTIVE_ORGANIZATION_SITE',
      level: 'MEDIUM',
      sectionKey: SettingsSectionKey.ORGANIZATION,
      targetPath: '/dashboard/settings/organization#sedes',
      title: 'Registra una sede activa',
      description: 'La empresa necesita al menos una sede activa para organizar su operación.',
      action: 'Revisar sedes',
    },
    {
      key: 'COMPANY_HOURS_NOT_CONFIGURED',
      level: 'MEDIUM',
      sectionKey: SettingsSectionKey.CALENDAR,
      targetPath: '/dashboard/settings/calendar#horario-base',
      title: 'Define el horario de la empresa',
      description: 'Configura al menos un día abierto para orientar jornadas y atención.',
      action: 'Configurar horario',
    },
    {
      key: 'BRANDING_NOT_CUSTOMIZED',
      level: 'LOW',
      sectionKey: SettingsSectionKey.BRANDING,
      targetPath: '/dashboard/settings/branding',
      title: 'Personaliza la marca de tu empresa',
      description: 'Añade los recursos visuales que identificarán a tu empresa en el portal.',
      action: 'Revisar marca',
    },
  ])('renders the actionable priority $key once', async (priority) => {
    const { configurationApi } = jest.requireMock('@/lib/api-client');
    configurationApi.settingsPriority.get.mockResolvedValue({
      state: 'ACTION_REQUIRED',
      item: {
        key: priority.key,
        level: priority.level,
        sectionKey: priority.sectionKey,
        targetPath: priority.targetPath,
      },
      evaluation: 'COMPLETE',
      unknownSources: [],
    });

    render(<SettingsClient />);

    expect(await screen.findByText(priority.title)).toBeInTheDocument();
    expect(screen.getByText(priority.description)).toBeInTheDocument();
    expect(screen.getAllByText('Recomendado ahora')).toHaveLength(1);
    expect(screen.getByRole('link', { name: priority.action })).toHaveAttribute(
      'href',
      priority.targetPath,
    );
  });

  it.each([
    { state: 'NONE', evaluation: 'COMPLETE', unknownSources: [] },
    { state: 'UNKNOWN', evaluation: 'PARTIAL', unknownSources: ['TENANT'] },
  ])('keeps the hub usable without a recommendation for $state', async (priority) => {
    const { configurationApi } = jest.requireMock('@/lib/api-client');
    configurationApi.settingsPriority.get.mockResolvedValue({ ...priority, item: null });

    render(<SettingsClient />);

    expect(await screen.findByText('Secciones de configuración')).toBeInTheDocument();
    expect(screen.queryByText('Recomendado ahora')).not.toBeInTheDocument();
  });

  it('preserves a known recommendation when evaluation is partial', async () => {
    const { configurationApi } = jest.requireMock('@/lib/api-client');
    configurationApi.settingsPriority.get.mockResolvedValue({
      ...defaultSettingsPriority,
      evaluation: 'PARTIAL',
      unknownSources: ['ORGANIZATION'],
    });

    render(<SettingsClient />);

    expect(await screen.findByText('Activa la verificación en dos pasos')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Configurar verificación' })).toBeInTheDocument();
  });

  it('keeps the hub usable when priority evaluation fails', async () => {
    const { configurationApi } = jest.requireMock('@/lib/api-client');
    configurationApi.settingsPriority.get.mockRejectedValue(new Error('Priority unavailable'));

    render(<SettingsClient />);

    expect(await screen.findByText('Secciones de configuración')).toBeInTheDocument();
    expect(screen.queryByText('Recomendado ahora')).not.toBeInTheDocument();
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
    expect(
      screen.queryByRole('link', { name: /Perfiles y autenticación/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Recomendado ahora')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Configurar verificación' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Perfil empresarial y organización/i }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText('Acceso restringido')).toHaveLength(2);
    expect(screen.getAllByText(/Solicita apoyo a una persona administradora/i)).toHaveLength(2);
  });

  it('does not promote an access section that is not available', async () => {
    const { configurationApi } = jest.requireMock('@/lib/api-client');
    configurationApi.settingsSections.list.mockResolvedValue(
      settingsSectionsFixture.map((section) =>
        section.key === SettingsSectionKey.ACCESS
          ? { ...section, status: SettingsSectionStatus.COMING_SOON }
          : section,
      ),
    );

    render(<SettingsClient />);

    expect(await screen.findByText('Secciones de configuración')).toBeInTheDocument();
    expect(screen.queryByText('Recomendado ahora')).not.toBeInTheDocument();
  });

  it('renders a named loading state while authentication is pending', () => {
    useAuthMock.mockReturnValue({ user: null, isLoading: true });

    render(<SettingsClient />);

    expect(screen.getByText('Cargando opciones de configuración')).toBeInTheDocument();
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it('shows the controlled session error when no authenticated user is available', async () => {
    useAuthMock.mockReturnValue({ user: null, isLoading: false });

    render(<SettingsClient />);

    expect(await screen.findByRole('status')).toHaveTextContent(
      'No pudimos validar tu sesión en el portal.',
    );
  });

  it('retries the registry request after a transient failure', async () => {
    const { configurationApi } = jest.requireMock('@/lib/api-client');
    configurationApi.settingsSections.list
      .mockRejectedValueOnce(new Error('Fallo temporal de prueba'))
      .mockResolvedValueOnce(settingsSectionsFixture);

    render(<SettingsClient />);

    expect(await screen.findByText(SETTINGS_HUB_COPY.registryUnavailable)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Secciones de configuración')).toBeInTheDocument();
    await waitFor(() => expect(configurationApi.settingsSections.list).toHaveBeenCalledTimes(2));
  });

  it('renders the empty registry state without fake navigation', async () => {
    const { configurationApi } = jest.requireMock('@/lib/api-client');
    configurationApi.settingsSections.list.mockResolvedValue([]);

    render(<SettingsClient />);

    expect(await screen.findByText('Aún no hay secciones disponibles')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Abrir sección/i })).not.toBeInTheDocument();
  });
});
