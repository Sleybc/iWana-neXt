import '@testing-library/jest-dom';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardClient } from './DashboardClient';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...props
  }: {
    children?: ReactNode;
    href: string;
  } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
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
    actions?: ReactNode;
  }) => (
    <header>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
      {actions}
    </header>
  ),
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

function makeTenant(
  overrides: Partial<{
    id: string;
    name: string;
    slug: string;
    status: string;
    updatedAt: string;
  }>,
) {
  return {
    id: 'tenant-1',
    name: 'Empresa Demo',
    slug: 'demo',
    status: 'ACTIVE',
    contactEmail: 'ops@demo.co',
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-24T10:00:00.000Z',
    ...overrides,
  };
}

function makeAuditEntry(
  overrides: Partial<{
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    displayName: string;
    createdAt: string;
  }> = {},
) {
  return {
    id: overrides.id ?? 'audit-1',
    action: overrides.action ?? 'UPDATE',
    entityType: overrides.entityType ?? 'tenant',
    entityId: overrides.entityId ?? 'tenant-1',
    userId: 'user-1',
    actor: { displayName: overrides.displayName ?? 'María Admin' },
    oldValue: null,
    newValue: null,
    ipAddress: null,
    userAgent: null,
    requestId: null,
    createdAt: overrides.createdAt ?? new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  };
}

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
    healthApi.get.mockResolvedValue({
      status: 'ok',
      db: 'ok',
      redis: 'ok',
      timestamp: '2026-06-26T10:00:00.000Z',
    });
    platformAuditApi.list.mockResolvedValue({ data: [] });
    tenantApi.list.mockResolvedValue([]);
  });

  it('CA-PS-03: no pinta ceros en chips ni en el desglose mientras carga', async () => {
    const tenantsDeferred = createDeferred<unknown>();
    const auditDeferred = createDeferred<unknown>();
    const healthDeferred = createDeferred<unknown>();
    tenantApi.list.mockReturnValue(tenantsDeferred.promise);
    platformAuditApi.list.mockReturnValue(auditDeferred.promise);
    healthApi.get.mockReturnValue(healthDeferred.promise);

    render(<DashboardClient />);

    expect(await screen.findByText('Cargando el centro de control')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.queryByText('Activas')).not.toBeInTheDocument();

    tenantsDeferred.resolve([]);
    auditDeferred.resolve({ data: [] });
    healthDeferred.resolve({
      status: 'ok',
      db: 'ok',
      redis: 'ok',
      timestamp: '2026-06-26T10:00:00.000Z',
    });

    await waitFor(() => {
      expect(screen.getByText('Activas')).toBeInTheDocument();
    });
  });

  it('CA-PS-01/02/04/05/07/08/09: portada de señal sin tabla y con destinos canónicos', async () => {
    const recentIso = new Date().toISOString();
    tenantApi.list.mockResolvedValue([
      makeTenant({
        id: 't-active-1',
        name: 'Empresa Activa',
        slug: 'activa',
        status: 'ACTIVE',
        updatedAt: recentIso,
      }),
      makeTenant({
        id: 't-active-2',
        name: 'Empresa Sur',
        slug: 'sur',
        status: 'ACTIVE',
        updatedAt: '2025-01-01T10:00:00.000Z',
      }),
      makeTenant({
        id: 't-prov',
        name: 'Empresa Alta',
        slug: 'alta',
        status: 'PROVISIONING',
        updatedAt: '2025-01-01T10:00:00.000Z',
      }),
      makeTenant({
        id: 't-failed',
        name: 'Empresa Error',
        slug: 'error',
        status: 'PROVISIONING_FAILED',
        updatedAt: '2025-01-01T10:00:00.000Z',
      }),
      makeTenant({
        id: 't-suspended',
        name: 'Empresa Pausa',
        slug: 'pausa',
        status: 'SUSPENDED',
        updatedAt: '2025-01-01T10:00:00.000Z',
      }),
      makeTenant({
        id: 't-inactive',
        name: 'Empresa Inactiva',
        slug: 'inactiva',
        status: 'INACTIVE',
        updatedAt: '2025-01-01T10:00:00.000Z',
      }),
      makeTenant({
        id: 't-delete',
        name: 'Empresa Baja',
        slug: 'baja',
        status: 'MARKED_FOR_DELETION',
        updatedAt: '2025-01-01T10:00:00.000Z',
      }),
    ]);

    platformAuditApi.list.mockResolvedValue({
      data: Array.from({ length: 6 }, (_, index) =>
        makeAuditEntry({
          id: `audit-${index + 1}`,
          displayName: `Operador ${index + 1}`,
          entityId: `tenant-${index + 1}`,
          createdAt: new Date(Date.now() - (index + 1) * 60 * 1000).toISOString(),
        }),
      ),
    });

    render(<DashboardClient />);

    expect(await screen.findByText('Centro de control')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Ver empresas activas' })).toBeInTheDocument();
    expect(
      screen.getByText('Salud de plataforma, altas en curso y lo que requiere atención.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Resumen operativo')).toBeInTheDocument();

    expect(screen.queryByRole('link', { name: 'Revisar empresas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ver historial' })).not.toBeInTheDocument();
    expect(screen.queryByText('Tabla empresas')).not.toBeInTheDocument();
    expect(screen.queryByText('Directorio de empresas')).not.toBeInTheDocument();
    expect(screen.queryByText('Directorio por estado')).not.toBeInTheDocument();
    expect(screen.queryByText('Empresas visibles')).not.toBeInTheDocument();
    expect(screen.queryByText(/Usa esta portada para priorizar/)).not.toBeInTheDocument();

    expect(screen.getAllByText('Activas').length).toBeGreaterThan(0);
    expect(screen.getAllByText('En configuración').length).toBeGreaterThan(0);
    expect(screen.getByText('Requieren atención')).toBeInTheDocument();
    expect(screen.getByText('Cambios esta semana')).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Ver empresas activas' })).toHaveAttribute(
      'href',
      '/tenants?status=ACTIVE',
    );
    expect(screen.getByRole('link', { name: 'Ver empresas en configuración' })).toHaveAttribute(
      'href',
      '/tenants?status=PROVISIONING',
    );
    expect(screen.queryByRole('link', { name: /cambios esta semana/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Ver el desglose por estado' }),
    ).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Ver el desglose por estado' }));
    expect(document.activeElement).toHaveTextContent('Empresas por estado');
    expect(document.activeElement).toHaveAttribute('tabindex', '-1');

    const expectStatusLinks = (name: string, href: string) => {
      const links = screen.getAllByRole('link', { name });
      expect(links.length).toBeGreaterThan(0);
      links.forEach((link) => {
        expect(link).toHaveAttribute('href', href);
      });
    };

    expectStatusLinks('Activas: 2', '/tenants?status=ACTIVE');
    expectStatusLinks('En configuración: 1', '/tenants?status=PROVISIONING');
    expectStatusLinks('Con error: 1', '/tenants?status=PROVISIONING_FAILED');
    expectStatusLinks('Suspendidas: 1', '/tenants?status=SUSPENDED');
    expectStatusLinks('Inactivas: 1', '/tenants?status=INACTIVE');
    expectStatusLinks('En eliminación: 1', '/tenants?status=MARKED_FOR_DELETION');
    expect(screen.getByRole('link', { name: 'Ver todas las empresas' })).toHaveAttribute(
      'href',
      '/tenants',
    );
    expect(
      screen.getByText(
        '2 empresas operan con normalidad. 1 sigue en configuración y 3 requieren revisión.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('En el directorio')).toBeInTheDocument();
    expect(screen.getByText('7 empresas')).toBeInTheDocument();
    expect(screen.getByText('Ya operan con normalidad.')).toBeInTheDocument();
    expect(screen.getByText('La puesta en marcha no terminó.')).toBeInTheDocument();

    const statusBar = screen.getByRole('img', { name: /activas/i });
    expect(within(statusBar).queryAllByRole('link')).toHaveLength(0);

    expect(platformAuditApi.list).toHaveBeenCalledWith({ limit: 5 });
    const activity = screen.getByRole('region', { name: 'Actividad reciente' });
    expect(within(activity).getAllByRole('listitem')).toHaveLength(5);
    const timestamps = within(activity).getAllByRole('time');
    expect(timestamps).toHaveLength(5);
    expect(timestamps[0]).toHaveAttribute('dateTime');
    expect(within(activity).queryByText(/tenant-\d/)).not.toBeInTheDocument();
    expect(within(activity).queryByText('UPDATE')).not.toBeInTheDocument();
    expect(
      within(activity).getByText(/María Admin actualizó|Operador 1 actualizó/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir historial' })).toHaveAttribute(
      'href',
      '/audit-logs',
    );

    const healthSection = screen.getByText('Salud de plataforma').closest('section');
    expect(healthSection).toBeTruthy();
    const healthLines = Array.from(healthSection!.querySelectorAll('p'))
      .map((node) => node.textContent ?? '')
      .filter((text) => text.includes(':'));
    expect(healthLines).toHaveLength(4);
    expect(healthLines[0]).toMatch(/^Atención operativa:/);
    expect(healthLines[1]).toMatch(/^API de plataforma:/);
    expect(healthLines[2]).toMatch(/^Base de datos:/);
    expect(healthLines[3]).toMatch(/^Redis y colas:/);

    expect(screen.getByTestId('control-center-split')).toHaveClass('xl:grid-cols-12');
    expect(screen.getByTestId('control-center-monitoring')).toHaveClass('xl:col-span-7', 'h-full');
    expect(screen.getByTestId('control-center-distribution')).toHaveClass(
      'xl:col-span-5',
      'h-full',
    );
    expect(screen.getByRole('region', { name: 'Empresas por estado' })).toHaveClass('h-full');
    expect(activity).toHaveClass('w-full');

    expect(screen.queryByText('Puestas en marcha')).not.toBeInTheDocument();
  });

  it('CA-PS-06: parque vacío muestra empty de D y CTA a alta, sin tabla', async () => {
    tenantApi.list.mockResolvedValue([]);
    platformAuditApi.list.mockResolvedValue({ data: [] });

    render(<DashboardClient />);

    expect(await screen.findByText('Aún no hay empresas registradas.')).toBeInTheDocument();
    expect(screen.queryByText('Cargando el centro de control')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Registrar primera empresa' })).toHaveAttribute(
      'href',
      '/tenants/new',
    );
    expect(screen.getByText('Aún no hay cambios recientes para mostrar.')).toBeInTheDocument();
    expect(screen.queryByText('Directorio de empresas')).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /activas/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ver empresas activas' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Ver el desglose por estado' }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
  });

  it('CA-PS-05: tramo en cero no es control y D-5/D-6 se omiten', async () => {
    tenantApi.list.mockResolvedValue([
      makeTenant({ id: 'only-active', name: 'Solo activa', status: 'ACTIVE' }),
    ]);

    render(<DashboardClient />);

    expect(await screen.findByRole('link', { name: 'Ver empresas activas' })).toBeInTheDocument();
    expect(screen.getByText('Empresas por estado')).toBeInTheDocument();
    expect(screen.getByText('Con error')).toBeInTheDocument();
    expect(screen.getByText('Suspendidas')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Con error: 0' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Suspendidas: 0' })).not.toBeInTheDocument();
    expect(screen.queryByText('Inactivas')).not.toBeInTheDocument();
    expect(screen.queryByText('En eliminación')).not.toBeInTheDocument();
  });

  it('CA-PS-10: un contrato caído no sustituye la página', async () => {
    tenantApi.list.mockRejectedValue(
      new ApiError(503, 'UNAVAILABLE', 'Servicio de empresas no disponible.'),
    );
    platformAuditApi.list.mockResolvedValue({
      data: [makeAuditEntry()],
    });
    healthApi.get.mockResolvedValue({
      status: 'ok',
      db: 'ok',
      redis: 'ok',
      timestamp: '2026-06-26T10:00:00.000Z',
    });

    render(<DashboardClient />);

    expect(
      await screen.findAllByText('No pudimos cargar el directorio. Reintenta en unos minutos.'),
    ).not.toHaveLength(0);
    expect(screen.getByText('Salud de plataforma')).toBeInTheDocument();
    expect(
      screen.getByText('API, base de datos y Redis responden correctamente.'),
    ).toBeInTheDocument();
    expect(screen.getByText('María Admin actualizó una empresa')).toBeInTheDocument();
    expect(screen.queryByText('Directorio de empresas')).not.toBeInTheDocument();
  });

  it('CA-PS-10: el fallo de health degrada solo el monitoreo', async () => {
    tenantApi.list.mockResolvedValue([
      makeTenant({ id: 't-1', name: 'Empresa Demo', status: 'ACTIVE' }),
    ]);
    platformAuditApi.list.mockResolvedValue({
      data: [makeAuditEntry()],
    });
    healthApi.get.mockRejectedValue(new ApiError(503, 'UNAVAILABLE', ''));

    render(<DashboardClient />);

    expect(
      await screen.findByText('No pudimos validar API, base de datos y Redis en este momento.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver empresas activas' })).toBeInTheDocument();
    expect(screen.getByText('Empresas por estado')).toBeInTheDocument();
    expect(screen.getByText('María Admin actualizó una empresa')).toBeInTheDocument();
    expect(screen.getByText('Salud de plataforma')).toBeInTheDocument();
    expect(
      screen.queryByText('API, base de datos y Redis responden correctamente.'),
    ).not.toBeInTheDocument();
  });

  it('CA-PS-10: el fallo de auditoría degrada solo la actividad', async () => {
    tenantApi.list.mockResolvedValue([
      makeTenant({ id: 't-1', name: 'Empresa Demo', status: 'ACTIVE' }),
    ]);
    platformAuditApi.list.mockRejectedValue(new Error('Audit timeout'));

    render(<DashboardClient />);

    expect(await screen.findByText('No pudimos cargar la actividad reciente.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver empresas activas' })).toBeInTheDocument();
    expect(screen.getByText('Empresas por estado')).toBeInTheDocument();
    expect(screen.getByText('Salud de plataforma')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
