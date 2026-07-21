import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { DashboardClient } from './DashboardClient';

let searchParamsMock = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsMock,
  usePathname: () => '/dashboard',
  useRouter: () => ({
    replace: jest.fn(),
    push: jest.fn(),
  }),
}));

jest.mock('@/components/layout/PageHeader', () => ({
  PageHeader: ({
    title,
    subtitle,
    actions,
  }: {
    title: string;
    subtitle?: string;
    actions?: React.ReactNode;
  }) => (
    <header>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
      {actions}
    </header>
  ),
}));

jest.mock('@/components/dashboard/TenantsTable', () => ({
  TenantsTable: ({
    tenants,
    error,
    searchQuery,
  }: {
    tenants: Array<{ name: string; slug?: string; status?: string }>;
    error?: string | null;
    searchQuery?: string;
  }) => {
    const q = (searchQuery ?? '').trim().toLowerCase();
    const visible = q
      ? tenants.filter(
          (tenant) =>
            tenant.name.toLowerCase().includes(q) ||
            (tenant.slug ?? '').toLowerCase().includes(q) ||
            (tenant.status ?? '').toLowerCase().includes(q),
        )
      : tenants;

    return (
      <section>
        <p>Tabla empresas</p>
        <p>Filtro global: {searchQuery ?? ''}</p>
        <p>Total visible: {visible.length}</p>
        {visible.map((tenant) => (
          <p key={tenant.name}>{tenant.name}</p>
        ))}
        {error ? <p>{error}</p> : null}
      </section>
    );
  },
}));

jest.mock('@/components/dashboard/SystemStatusPanel', () => ({
  SystemStatusPanel: ({
    summary,
    indicators,
  }: {
    summary?: string;
    indicators: Array<{ label: string; detail?: string }>;
  }) => (
    <section>
      <p>Salud de plataforma</p>
      {summary ? <p>{summary}</p> : null}
      {indicators.map((indicator) => (
        <p key={indicator.label}>
          {indicator.label}: {indicator.detail}
        </p>
      ))}
    </section>
  ),
}));

jest.mock('@/components/dashboard/PanelCard', () => ({
  PanelCard: ({
    title,
    rows,
    footerLabel,
  }: {
    title: string;
    rows: Array<{ label: string; value: string | number }>;
    footerLabel?: string;
  }) => (
    <section>
      <p>{title}</p>
      {rows.map((row) => (
        <p key={`${title}-${row.label}`}>
          {row.label} | {row.value}
        </p>
      ))}
      {footerLabel ? <p>{footerLabel}</p> : null}
    </section>
  ),
}));

jest.mock('@/lib/platform-ui-copy', () => ({
  PLATFORM_UI_COPY: {
    dashboard: {
      title: 'Centro de control',
    },
    audit: {
      actionLabels: {
        create: 'Creación',
        update: 'Actualización',
        delete: 'Eliminación',
      },
      entityTypeLabels: {
        tenant: 'empresa',
        user: 'usuario',
      },
    },
  },
}));

jest.mock('@/lib/api-client', () => {
  class ApiError extends Error {
    constructor(
      public readonly status: number,
      public readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = 'ApiError';
    }
  }

  return {
    ApiError,
    tenantApi: {
      list: jest.fn(),
    },
    platformAuditApi: {
      list: jest.fn(),
    },
    healthApi: {
      get: jest.fn(),
    },
  };
});

describe('DashboardClient', () => {
  const { tenantApi, platformAuditApi, healthApi, ApiError } = jest.requireMock(
    '@/lib/api-client',
  ) as {
    ApiError: new (status: number, code: string, message: string) => Error;
    tenantApi: { list: jest.Mock };
    platformAuditApi: { list: jest.Mock };
    healthApi: { get: jest.Mock };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    searchParamsMock = new URLSearchParams('q=demo');
  });

  it('muestra resumen operativo y aplica el filtro global del buscador', async () => {
    tenantApi.list.mockResolvedValue([
      {
        id: 'tenant-1',
        name: 'Empresa Demo',
        slug: 'demo',
        status: 'ACTIVE',
        contactEmail: 'ops@demo.co',
        createdAt: '2026-06-01T10:00:00.000Z',
        updatedAt: '2026-06-24T10:00:00.000Z',
      },
      {
        id: 'tenant-2',
        name: 'Empresa Norte',
        slug: 'norte',
        status: 'SUSPENDED',
        contactEmail: 'ops@norte.co',
        createdAt: '2026-05-01T10:00:00.000Z',
        updatedAt: '2026-05-24T10:00:00.000Z',
      },
    ]);

    platformAuditApi.list.mockResolvedValue({
      data: [
        {
          id: 'audit-1',
          action: 'UPDATE',
          entityType: 'tenant',
          entityId: 'tenant-1',
          userId: 'user-1',
          actor: { displayName: 'María Admin' },
          oldValue: null,
          newValue: null,
          ipAddress: null,
          userAgent: null,
          requestId: null,
          createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        },
      ],
    });

    healthApi.get.mockResolvedValue({
      status: 'ok',
      db: 'ok',
      redis: 'ok',
      timestamp: '2026-06-26T10:00:00.000Z',
    });

    render(<DashboardClient />);

    expect(await screen.findByText('Centro de control')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Filtro global: demo')).toBeInTheDocument();
      expect(screen.getByText('Total visible: 1')).toBeInTheDocument();
    });

    expect(screen.getByText('Empresa Demo')).toBeInTheDocument();
    expect(screen.getByText('Resumen operativo')).toBeInTheDocument();
    expect(screen.getByText('1 empresas activas y 1 en seguimiento directo')).toBeInTheDocument();
    expect(screen.getByText('Empresas visibles')).toBeInTheDocument();
    expect(screen.getByText('Cambios esta semana')).toBeInTheDocument();
    expect(
      screen.getByText('API, base de datos y Redis responden correctamente.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Actividad reciente')).toBeInTheDocument();
    expect(screen.getByText('Directorio por estado')).toBeInTheDocument();
    expect(screen.getByText(/María Admin · Actualización en empresa/i)).toBeInTheDocument();
    expect(screen.queryByText('Puestas en marcha')).not.toBeInTheDocument();

    const healthSection = screen.getByText('Salud de plataforma').closest('section');
    expect(healthSection).toBeTruthy();
    const healthLines = Array.from(healthSection!.querySelectorAll('p'))
      .map((node) => node.textContent ?? '')
      .filter((text) => text.includes(':'));
    expect(healthLines[0]).toMatch(/^Atención operativa:/);
  });

  it('muestra degradación parcial cuando fallan directorio, salud y auditoría', async () => {
    searchParamsMock = new URLSearchParams();

    tenantApi.list.mockRejectedValue(
      new ApiError(503, 'UNAVAILABLE', 'Servicio de empresas no disponible.'),
    );
    platformAuditApi.list.mockRejectedValue(new Error('Audit timeout'));
    healthApi.get.mockRejectedValue(new Error('Health timeout'));

    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByText('Servicio de empresas no disponible.')).toBeInTheDocument();
    });

    expect(
      screen.getByText('No pudimos validar API, base de datos y Redis en este momento.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/No pudimos cargar la actividad reciente\./)).toBeInTheDocument();
    expect(
      screen.getByText('API de plataforma: No pudimos cargar el directorio principal.'),
    ).toBeInTheDocument();
  });
});
