import '@testing-library/jest-dom';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TenantStatus } from '@iwana/shared';
import { makeHealthDays, makePlatformHealthHistory } from '@/test-utils/platform-health-history';
import { makePlatformUsersSummary } from '@/test-utils/platform-users-summary';
import { makeMonthlySeries, makeTenantStatusSummary } from '@/test-utils/tenant-status-summary';
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

let mockRole = 'IWANA_SUPPORT';
jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { role: mockRole } }),
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
      summary: jest.fn(),
      list: jest.fn(),
      usage: jest.fn(),
    },
    platformAuditApi: {
      list: jest.fn(),
    },
    platformUsersApi: {
      summary: jest.fn(),
    },
    healthApi: {
      get: jest.fn(),
    },
    platformHealthApi: {
      history: jest.fn(),
    },
  };
});

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

const DIRECTORY_ERROR = 'No pudimos cargar el directorio. Reintenta en unos minutos.';
const ACTIVITY_ERROR = 'No pudimos cargar la actividad reciente.';
const FIXED_NOW = Date.parse('2026-06-26T12:00:00.000Z');
const minutesAgo = (minutes: number) => new Date(FIXED_NOW - minutes * 60 * 1000).toISOString();

describe('DashboardClient', () => {
  const { tenantApi, platformAuditApi, platformUsersApi, healthApi, platformHealthApi, ApiError } =
    jest.requireMock('@/lib/api-client') as {
      ApiError: new (status: number, code: string, message: string) => Error;
      tenantApi: { summary: jest.Mock; list: jest.Mock; usage: jest.Mock };
      platformAuditApi: { list: jest.Mock };
      platformUsersApi: { summary: jest.Mock };
      healthApi: { get: jest.Mock };
      platformHealthApi: { history: jest.Mock };
    };

  const HEALTH_OK = {
    status: 'ok',
    db: 'ok',
    redis: 'ok',
    timestamp: '2026-06-26T10:00:00.000Z',
  } as const;
  const HEALTH_ERROR = 'No pudimos validar API, base de datos y Redis en este momento.';

  beforeEach(() => {
    jest.clearAllMocks();
    mockRole = 'IWANA_SUPPORT';
    tenantApi.usage.mockResolvedValue({ items: [], generatedAt: new Date().toISOString() });
    healthApi.get.mockResolvedValue(HEALTH_OK);
    platformAuditApi.list.mockResolvedValue({ data: [] });
    tenantApi.summary.mockResolvedValue(makeTenantStatusSummary());
    tenantApi.list.mockResolvedValue([]);
    platformUsersApi.summary.mockResolvedValue(makePlatformUsersSummary());
    platformHealthApi.history.mockResolvedValue(makePlatformHealthHistory());
  });

  const pulse = () => screen.getByRole('region', { name: 'Pulso de plataforma' });
  const companies = () => screen.getByRole('region', { name: 'Empresas' });

  async function renderReady() {
    render(<DashboardClient />);
    await screen.findByRole('link', { name: 'Empresas activas' });
  }

  it('CA-PP-04: no pinta ceros ni filas mientras carga', async () => {
    const summaryDeferred = createDeferred<unknown>();
    const healthDeferred = createDeferred<unknown>();
    tenantApi.summary.mockReturnValue(summaryDeferred.promise);
    healthApi.get.mockReturnValue(healthDeferred.promise);

    render(<DashboardClient />);

    expect(await screen.findByText('Cargando el centro de control')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.queryByText('Todo al día')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Empresas activas' })).not.toBeInTheDocument();

    summaryDeferred.resolve(makeTenantStatusSummary({ ACTIVE: 3 }));
    healthDeferred.resolve(HEALTH_OK);

    expect(await screen.findByRole('link', { name: 'Empresas activas' })).toHaveTextContent('3');
    expect(screen.queryByText('Cargando el centro de control')).not.toBeInTheDocument();
  });

  it('B1: cuatro celdas con destino canónico, cifras del resumen completo y salud de 3 servicios', async () => {
    tenantApi.summary.mockResolvedValue(
      makeTenantStatusSummary({
        ACTIVE: 180,
        PROVISIONING: 40,
        SUSPENDED: 13,
        PROVISIONING_FAILED: 2,
      }),
    );
    await renderReady();

    const strip = pulse();
    const active = within(strip).getByRole('link', { name: 'Empresas activas' });
    expect(active).toHaveAttribute('href', '/tenants?status=ACTIVE');
    expect(active).toHaveTextContent('180');
    expect(within(strip).getByRole('link', { name: 'Altas en curso' })).toHaveAttribute(
      'href',
      '/tenants?status=PROVISIONING',
    );
    const attention = within(strip).getByRole('button', { name: 'Requieren atención' });
    expect(attention).toHaveTextContent('15');
    expect(attention).toHaveTextContent('2 con error · 13 suspendidas');
    // Fase 3: la celda de salud pasa a «Disponibilidad, 30 días» (dirección §4 B1).
    const availability = within(strip).getByRole('link', { name: 'Disponibilidad, 30 días' });
    expect(availability).toHaveAttribute('href', '#salud-de-plataforma');
    expect(availability).toHaveTextContent('100 %');
    expect(availability).toHaveTextContent('Operativa');
  });

  it('B1: «Requieren atención» lleva el foco al encabezado del área Empresas', async () => {
    tenantApi.summary.mockResolvedValue(makeTenantStatusSummary({ SUSPENDED: 1 }));
    const user = userEvent.setup();
    await renderReady();

    await user.click(within(pulse()).getByRole('button', { name: 'Requieren atención' }));

    expect(screen.getByRole('heading', { name: 'Empresas' })).toHaveFocus();
  });

  it('CA-PP-02: cada conteo por estado está en el pulso y en Empresas, y en ningún otro bloque', async () => {
    tenantApi.summary.mockResolvedValue(makeTenantStatusSummary({ ACTIVE: 187, PROVISIONING: 41 }));
    await renderReady();

    expect(screen.getAllByText('187')).toHaveLength(2);
    expect(within(pulse()).getByText('187')).toBeInTheDocument();
    expect(within(companies()).getByText('187')).toBeInTheDocument();
    expect(screen.getAllByText('41')).toHaveLength(2);
  });

  it('B2: Empresas compacta omite Inactivas y En eliminación en cero y totaliza el directorio', async () => {
    tenantApi.summary.mockResolvedValue(makeTenantStatusSummary({ ACTIVE: 2, SUSPENDED: 1 }));
    await renderReady();

    const area = companies();
    expect(within(area).getByText('Con error')).toBeInTheDocument();
    expect(within(area).queryByText('Inactivas')).not.toBeInTheDocument();
    expect(within(area).queryByText('En eliminación')).not.toBeInTheDocument();
    expect(within(area).getByText('3 en el directorio')).toBeInTheDocument();
    expect(within(area).getByRole('link', { name: 'Ver empresas' })).toHaveAttribute(
      'href',
      '/tenants',
    );
  });

  it('CA-PP-03: En riesgo antes que Atención y cada fila abre su empresa', async () => {
    const now = new Date().toISOString();
    tenantApi.summary.mockResolvedValue(
      makeTenantStatusSummary(
        { SUSPENDED: 1, PROVISIONING_FAILED: 1 },
        {
          attention: [
            { id: 't-sus', name: 'Red Norte', status: TenantStatus.SUSPENDED, updatedAt: now },
            {
              id: 't-err',
              name: 'Fibra Sur',
              status: TenantStatus.PROVISIONING_FAILED,
              updatedAt: now,
            },
          ],
        },
      ),
    );
    await renderReady();

    const failed = screen.getByRole('link', {
      name: /^En riesgo: Puesta en marcha con error\. Fibra Sur/,
    });
    const suspended = screen.getByRole('link', {
      name: /^Atención: Empresa suspendida\. Red Norte/,
    });
    expect(failed).toHaveAttribute('href', '/tenants/t-err/settings');
    expect(suspended).toHaveAttribute('href', '/tenants/t-sus/settings');
    // En riesgo precede a Atención en el orden del documento.
    expect(
      failed.compareDocumentPosition(suspended) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Requiere tu atención' })).toBeInTheDocument();
    expect(screen.queryByText('Todo al día')).not.toBeInTheDocument();
  });

  it('CA-PP-03: un servicio caído entra como En riesgo; sin filas, «Todo al día»', async () => {
    healthApi.get.mockResolvedValue({ ...HEALTH_OK, status: 'degraded', db: 'error' });
    const { unmount } = render(<DashboardClient />);

    expect(
      await screen.findByRole('link', {
        name: 'En riesgo: Base de datos sin servicio. Salud de plataforma',
      }),
    ).toHaveAttribute('href', '#salud-de-plataforma');
    unmount();

    healthApi.get.mockResolvedValue(HEALTH_OK);
    // «Todo al día» exige colas sin novedad y todo el equipo con verificación en dos pasos.
    platformUsersApi.summary.mockResolvedValue(makePlatformUsersSummary({ withoutMfa: 0 }));
    platformHealthApi.history.mockResolvedValue(
      makePlatformHealthHistory({
        queues: [{ name: 'search-index', waiting: 0, failed: 0, oldestWaitingSeconds: null }],
      }),
    );
    render(<DashboardClient />);
    expect(await screen.findByText('Todo al día')).toBeInTheDocument();
  });

  it('F2-D3: usuarios internos sin verificación en dos pasos entran como Atención', async () => {
    platformUsersApi.summary.mockResolvedValue(makePlatformUsersSummary({ withoutMfa: 3 }));
    const { unmount } = render(<DashboardClient />);
    expect(
      await screen.findByRole('link', {
        name: 'Atención: 3 usuarios sin verificación en dos pasos. Usuarios internos',
      }),
    ).toHaveAttribute('href', '/platform-users');
    unmount();

    platformUsersApi.summary.mockResolvedValue(makePlatformUsersSummary({ withoutMfa: 0 }));
    platformHealthApi.history.mockResolvedValue(makePlatformHealthHistory({ queues: [] }));
    render(<DashboardClient />);
    expect(await screen.findByText('Todo al día')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /sin verificación en dos pasos\. Usuarios internos/ }),
    ).toBeNull();
  });

  it('F2-D3: con el resumen de usuarios caído la cola no dice «Todo al día»', async () => {
    platformUsersApi.summary.mockRejectedValue(new Error('caído'));
    platformHealthApi.history.mockResolvedValue(makePlatformHealthHistory({ queues: [] }));
    render(<DashboardClient />);
    expect(await screen.findByText('No pudimos revisar todas las fuentes.')).toBeInTheDocument();
    expect(screen.queryByText('Todo al día')).not.toBeInTheDocument();
  });

  it('CA-PP-04: el resumen caído degrada pulso, Empresas y cola, sin ceros ni «Todo al día»', async () => {
    tenantApi.summary.mockRejectedValue(new ApiError(503, 'UNAVAILABLE', 'Servicio caído crudo'));
    platformAuditApi.list.mockResolvedValue({ data: [makeAuditEntry()] });

    render(<DashboardClient />);

    expect(await screen.findByText(DIRECTORY_ERROR)).toBeInTheDocument();
    expect(await screen.findByText('María Admin actualizó una empresa')).toBeInTheDocument();
    expect(within(pulse()).getAllByText('No disponible')).toHaveLength(3);
    expect(within(pulse()).queryByText('0')).not.toBeInTheDocument();
    expect(screen.getByText('No pudimos revisar todas las fuentes.')).toBeInTheDocument();
    expect(screen.queryByText('Todo al día')).not.toBeInTheDocument();
    expect(screen.queryByText(/Servicio caído crudo/)).not.toBeInTheDocument();
    expect(
      within(pulse()).getByRole('link', { name: 'Disponibilidad, 30 días' }),
    ).toHaveTextContent('100 %');
  });

  it('CA-PP-04: /health caído degrada solo su celda y su panel, con un único error canónico', async () => {
    healthApi.get.mockRejectedValue(new ApiError(503, 'UNKNOWN', 'Error del servidor'));
    tenantApi.summary.mockResolvedValue(makeTenantStatusSummary({ ACTIVE: 1 }));

    render(<DashboardClient />);

    expect(await screen.findByText(HEALTH_ERROR)).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Empresas activas' })).toHaveTextContent('1');
    expect(screen.getAllByText(HEALTH_ERROR)).toHaveLength(1);
    expect(screen.queryByText(/Error del servidor/)).not.toBeInTheDocument();
    // La disponibilidad viene del historial, no de /health: su celda sigue intacta.
    expect(within(pulse()).queryByText('No disponible')).not.toBeInTheDocument();
    expect(
      within(pulse()).getByRole('link', { name: 'Disponibilidad, 30 días' }),
    ).toBeInTheDocument();
  });

  it('B2: una lectura degradada se muestra como degradada, no como error de lectura', async () => {
    healthApi.get.mockResolvedValue({ ...HEALTH_OK, status: 'degraded', db: 'error' });
    await renderReady();

    const panel = document.getElementById('salud-de-plataforma') as HTMLElement;
    expect(within(panel).getByText('Base de datos').parentElement).toHaveTextContent('Error');
    expect(within(panel).getByText('Redis y colas').parentElement).toHaveTextContent('Operativo');
    expect(screen.queryByText(HEALTH_ERROR)).not.toBeInTheDocument();
  });

  it('CA-PP2-04: actividad pide 5 sin eventos de sesión al servidor y pinta máx. 5 con <time dateTime>', async () => {
    platformAuditApi.list.mockResolvedValue({
      data: [
        ...Array.from({ length: 7 }, (_, index) =>
          makeAuditEntry({ id: `audit-${index}`, displayName: `Operador ${index + 1}` }),
        ),
      ],
    });
    await renderReady();

    expect(platformAuditApi.list).toHaveBeenCalledWith({
      excludeSessionEvents: true,
      excludeAccessEvents: true,
      limit: 5,
    });
    const activity = screen.getByRole('region', { name: 'Actividad reciente' });
    expect(await within(activity).findAllByRole('listitem')).toHaveLength(5);
    expect(within(activity).getByText('Operador 1 actualizó una empresa')).toBeInTheDocument();
    expect(within(activity).queryByText(/sesión/i)).not.toBeInTheDocument();
    within(activity)
      .getAllByRole('time')
      .forEach((time) => expect(time).toHaveAttribute('dateTime'));
  });

  it('B4: últimas empresas lee 5 y enlaza cada fila; su fallo degrada solo su bloque', async () => {
    tenantApi.list.mockResolvedValue([
      {
        id: 't-1',
        name: 'Wisp Llanos',
        status: 'PROVISIONING',
        createdAt: '2026-11-21T08:00:00.000Z',
        updatedAt: new Date().toISOString(),
      },
    ]);
    const { unmount } = render(<DashboardClient />);

    const latest = await screen.findByRole('region', { name: 'Últimas empresas' });
    expect(tenantApi.list).toHaveBeenCalledWith({ limit: 5 });
    expect(await within(latest).findByRole('link', { name: 'Wisp Llanos' })).toHaveAttribute(
      'href',
      '/tenants/t-1/settings',
    );
    expect(within(latest).getByText('En configuración')).toBeInTheDocument();
    unmount();

    tenantApi.list.mockRejectedValue(new Error('timeout'));
    render(<DashboardClient />);
    expect(await screen.findByText('No pudimos cargar las últimas empresas.')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Empresas activas' })).toBeInTheDocument();
  });

  it('CA-PP2-05 / CA-PP3-05: no monta P4 ni piezas retiradas', async () => {
    await renderReady();

    [/Uso por empresa/, /Cambios esta semana/, /Atención operativa/].forEach((text) =>
      expect(screen.queryByText(text)).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('region', { name: 'Resumen operativo' })).not.toBeInTheDocument();
  });

  it.each([
    ['ACTIVE', 'Activas'],
    ['PROVISIONING', 'En configuración'],
    ['PROVISIONING_FAILED', 'Con error'],
    ['SUSPENDED', 'Suspendidas'],
    ['INACTIVE', 'Inactivas'],
    ['MARKED_FOR_DELETION', 'En eliminación'],
  ] as const)(
    'B2: la leyenda de Empresas enlaza %s a su filtro del directorio',
    async (status, label) => {
      tenantApi.summary.mockResolvedValue(makeTenantStatusSummary({ [status]: 2 }));
      await renderReady();

      expect(within(companies()).getByRole('link', { name: `${label}: 2` })).toHaveAttribute(
        'href',
        `/tenants?status=${status}`,
      );
    },
  );

  it('B2: directorio vacío muestra el vacío con CTA de alta y un 0 real ya cargado', async () => {
    await renderReady();

    const area = companies();
    expect(within(area).getByText('Aún no hay empresas registradas.')).toBeInTheDocument();
    expect(within(area).getByRole('link', { name: 'Registrar primera empresa' })).toHaveAttribute(
      'href',
      '/tenants/new',
    );
    expect(within(pulse()).getByRole('link', { name: 'Empresas activas' })).toHaveTextContent(
      /^Empresas activas0/,
    );
  });

  it('CA-PP-02: los conteos de todos los estados están en Empresas y en ningún otro bloque', async () => {
    tenantApi.summary.mockResolvedValue(
      makeTenantStatusSummary({
        ACTIVE: 101,
        PROVISIONING: 102,
        PROVISIONING_FAILED: 103,
        SUSPENDED: 104,
        INACTIVE: 105,
        MARKED_FOR_DELETION: 106,
      }),
    );
    await renderReady();

    // Activas y Altas en curso: cifra propia en el pulso y en Empresas.
    ['101', '102'].forEach((n) => {
      expect(screen.getAllByText(n)).toHaveLength(2);
      expect(within(pulse()).getByText(n)).toBeInTheDocument();
    });
    // Estados de atención: en Empresas como cifra y en el pulso solo dentro de la frase.
    ['103', '104', '105', '106'].forEach((n) => {
      expect(screen.getAllByText(n)).toHaveLength(1);
      expect(within(companies()).getByText(n)).toBeInTheDocument();
    });
    const attention = within(pulse()).getByRole('button', { name: 'Requieren atención' });
    expect(attention).toHaveTextContent('103 con error · 104 suspendidas · 106 en eliminación');
    expect(within(pulse()).queryByText(/105/)).not.toBeInTheDocument();
    const outside = [
      screen.getByRole('region', { name: 'Últimas empresas' }),
      screen.getByRole('region', { name: 'Actividad reciente' }),
      document.getElementById('salud-de-plataforma') as HTMLElement,
    ];
    outside.forEach((block) => expect(block.textContent).not.toMatch(/10[1-6]/));
  });

  it('CA-PP-06: la actividad no muestra ids ni enums, enlaza al historial y usa dateTime ISO', async () => {
    const createdAt = '2026-11-21T09:30:00.000Z';
    platformAuditApi.list.mockResolvedValue({
      data: [makeAuditEntry({ id: 'audit-xyz', entityId: 'tenant-uuid-77', createdAt })],
    });
    await renderReady();

    const activity = screen.getByRole('region', { name: 'Actividad reciente' });
    expect(
      await within(activity).findByText('María Admin actualizó una empresa'),
    ).toBeInTheDocument();
    expect(activity.textContent).not.toMatch(/tenant-uuid-77|audit-xyz|UPDATE|tenant\b/);
    expect(within(activity).getByRole('time')).toHaveAttribute('dateTime', createdAt);
    expect(within(activity).getByRole('link', { name: 'Abrir historial' })).toHaveAttribute(
      'href',
      '/audit-logs',
    );
  });

  it('CA-PP2-04: el filtro de sesión vive en el servidor; el cliente pinta lo que recibe', async () => {
    platformAuditApi.list.mockResolvedValue({
      data: [
        makeAuditEntry({ id: 'a', displayName: 'Operadora' }),
        makeAuditEntry({ id: 'b', displayName: 'Operador' }),
      ],
    });
    await renderReady();

    expect(platformAuditApi.list).toHaveBeenCalledWith(
      expect.objectContaining({ excludeSessionEvents: true }),
    );
    const activity = screen.getByRole('region', { name: 'Actividad reciente' });
    expect(await within(activity).findAllByRole('listitem')).toHaveLength(2);
  });

  it('CA-PP-04: la auditoría caída deja intactos pulso, Empresas y Salud', async () => {
    tenantApi.summary.mockResolvedValue(makeTenantStatusSummary({ ACTIVE: 1 }));
    platformAuditApi.list.mockRejectedValue(new Error('Audit timeout'));
    render(<DashboardClient />);

    expect(await screen.findByText(ACTIVITY_ERROR)).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Empresas activas' })).toHaveTextContent('1');
    expect(within(companies()).getByRole('link', { name: 'Activas: 1' })).toBeInTheDocument();
    const health = document.getElementById('salud-de-plataforma') as HTMLElement;
    expect(within(health).getByText('API de plataforma')).toBeInTheDocument();
    expect(within(health).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('L-10: el resumen caído deja intactos los indicadores de salud', async () => {
    tenantApi.summary.mockRejectedValue(new Error('boom'));
    render(<DashboardClient />);

    await screen.findByText(DIRECTORY_ERROR);
    const health = document.getElementById('salud-de-plataforma') as HTMLElement;
    expect(await within(health).findByText('API de plataforma')).toBeInTheDocument();
    expect(within(health).getByText('Base de datos').parentElement).toHaveTextContent('Operativo');
    expect(within(health).getByText('Redis y colas').parentElement).toHaveTextContent('Operativo');
  });

  it('E1: con /health caído el panel tiene un solo alert, Reintentar y ningún servicio', async () => {
    healthApi.get.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<DashboardClient />);

    await screen.findByText(HEALTH_ERROR);
    const health = document.getElementById('salud-de-plataforma') as HTMLElement;
    expect(within(health).getAllByRole('alert')).toHaveLength(1);
    expect(within(health).getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(within(health).queryByText('API de plataforma')).not.toBeInTheDocument();
  });

  describe('Fase 2 · P1 y P3', () => {
    const team = () => screen.getByRole('region', { name: 'Usuarios internos' });
    const trend = () => screen.getByRole('region', { name: 'Tendencia' });

    it('CA-PP2-02: neto positivo del mes en lima con altas y bajas en la frase', async () => {
      const monthly = makeMonthlySeries({ '2026-11': { created: 4, removed: 1 } });
      tenantApi.summary.mockResolvedValue(makeTenantStatusSummary({ ACTIVE: 48 }, { monthly }));
      await renderReady();

      const active = within(pulse()).getByRole('link', { name: 'Empresas activas' });
      expect(within(active).getByText('+3 este mes')).toHaveClass('bg-iwana-secondary-100');
      expect(active).toHaveTextContent('4 altas · 1 baja este mes');
    });

    it('CA-PP2-02: neto negativo sin lima y neto cero sin señal', async () => {
      const negative = makeMonthlySeries({ '2026-11': { created: 0, removed: 2 } });
      tenantApi.summary.mockResolvedValue(
        makeTenantStatusSummary({ ACTIVE: 5 }, { monthly: negative }),
      );
      const { unmount } = render(<DashboardClient />);
      const signal = await screen.findByText('-2 este mes');
      expect(signal).not.toHaveClass('bg-iwana-secondary-100');
      unmount();

      tenantApi.summary.mockResolvedValue(makeTenantStatusSummary({ ACTIVE: 5 }));
      await renderReady();
      expect(screen.queryByText(/^[+-]?[0-9]+ este mes$/)).not.toBeInTheDocument();
    });

    it('B1: «Altas en curso» dice la antigüedad del alta más vieja', async () => {
      tenantApi.summary.mockResolvedValue(
        makeTenantStatusSummary(
          { PROVISIONING: 3 },
          { oldestProvisioningAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
        ),
      );
      await renderReady();

      expect(within(pulse()).getByRole('link', { name: 'Altas en curso' })).toHaveTextContent(
        /La más antigua empezó hace 2 h/,
      );
    });

    it('CA-PP2-01: la tendencia pinta 12 meses del resumen y degrada con él', async () => {
      const monthly = makeMonthlySeries({ '2026-10': { created: 2, removed: 1 } });
      tenantApi.summary.mockResolvedValue(makeTenantStatusSummary({ ACTIVE: 1 }, { monthly }));
      const { unmount } = render(<DashboardClient />);
      await screen.findByRole('link', { name: 'Empresas activas' });

      expect(monthly).toHaveLength(12);
      expect(within(trend()).getByRole('img')).toHaveAccessibleName(/2 altas y 1 bajas en total/);
      unmount();

      tenantApi.summary.mockRejectedValue(new Error('timeout'));
      render(<DashboardClient />);
      expect(await screen.findByText('No pudimos cargar la tendencia.')).toBeInTheDocument();
      expect(within(trend()).queryByRole('img')).not.toBeInTheDocument();
    });

    it('CA-PP2-01: 12 meses en cero muestran el vacío, no una gráfica de ceros', async () => {
      tenantApi.summary.mockResolvedValue(makeTenantStatusSummary({ ACTIVE: 1 }));
      await renderReady();

      expect(
        within(trend()).getByText('Sin altas ni bajas en los últimos 12 meses'),
      ).toBeInTheDocument();
      expect(within(trend()).queryByRole('img')).not.toBeInTheDocument();
    });

    it('B1 y B3: «Equipo interno» y Usuarios internos leen el resumen del equipo', async () => {
      await renderReady();

      const cell = within(pulse()).getByRole('link', { name: 'Equipo interno' });
      expect(cell).toHaveAttribute('href', '/platform-users');
      expect(cell).toHaveTextContent('9');
      expect(cell).toHaveTextContent('2 sin verificación en dos pasos');
      expect(
        within(cell).getByLabelText('78 % del equipo con verificación en dos pasos'),
      ).toBeInTheDocument();

      const area = await screen.findByRole('region', { name: 'Usuarios internos' });
      expect(within(area).getByText('Administrador de plataforma').nextSibling).toHaveTextContent(
        '4',
      );
      expect(within(area).getByText('Soporte iWana').nextSibling).toHaveTextContent('5');
      expect(within(area).getByText('Sin verificación en dos pasos').nextSibling).toHaveTextContent(
        '2',
      );
      expect(within(area).getByText('Sin acceso en 30 días').nextSibling).toHaveTextContent('1');
      expect(within(area).getByRole('link', { name: 'Ver usuarios' })).toHaveAttribute(
        'href',
        '/platform-users',
      );
    });

    it('CA-PP2-03: el resumen del equipo caído degrada solo su celda y su área, sin ceros', async () => {
      const user = userEvent.setup();
      platformUsersApi.summary
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce(makePlatformUsersSummary());
      tenantApi.summary.mockResolvedValue(makeTenantStatusSummary({ ACTIVE: 7 }));
      await renderReady();

      const strip = pulse();
      expect(within(strip).queryByRole('link', { name: 'Equipo interno' })).not.toBeInTheDocument();
      expect(within(strip).getByText('Equipo interno').closest('article')).toHaveTextContent(
        'No disponible',
      );
      expect(
        await within(team()).findByText('No pudimos cargar el equipo interno.'),
      ).toBeInTheDocument();
      expect(within(team()).queryByText('0')).not.toBeInTheDocument();
      expect(within(strip).getByRole('link', { name: 'Empresas activas' })).toHaveTextContent('7');

      await user.click(within(team()).getByRole('button', { name: 'Reintentar' }));
      expect(
        await within(pulse()).findByRole('link', { name: 'Equipo interno' }),
      ).toBeInTheDocument();
      expect(tenantApi.summary).toHaveBeenCalledTimes(1);
    });
  });

  describe('reintento y actualización', () => {
    it('«Reintentar» en una celda vuelve a pedir solo su fuente', async () => {
      tenantApi.summary
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(makeTenantStatusSummary({ ACTIVE: 4 }));
      const user = userEvent.setup();

      render(<DashboardClient />);
      await screen.findByText(DIRECTORY_ERROR);
      await user.click(within(pulse()).getAllByRole('button', { name: 'Reintentar' })[0]!);

      expect(await screen.findByRole('link', { name: 'Empresas activas' })).toHaveTextContent('4');
      expect(tenantApi.summary).toHaveBeenCalledTimes(2);
      expect(healthApi.get).toHaveBeenCalledTimes(1);
      expect(platformAuditApi.list).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(DIRECTORY_ERROR)).not.toBeInTheDocument();
    });

    it('el reintento desde la actividad recupera las entradas', async () => {
      platformAuditApi.list
        .mockRejectedValueOnce(new Error('Audit timeout'))
        .mockResolvedValueOnce({ data: [makeAuditEntry()] });
      const user = userEvent.setup();

      render(<DashboardClient />);
      await screen.findByText(ACTIVITY_ERROR);
      const activity = screen.getByRole('region', { name: 'Actividad reciente' });

      await user.click(within(activity).getByRole('button', { name: 'Reintentar' }));

      expect(await screen.findByText('María Admin actualizó una empresa')).toBeInTheDocument();
      expect(screen.queryByText(ACTIVITY_ERROR)).not.toBeInTheDocument();
    });

    it('B0: «Actualizar» vuelve a pedir las cinco fuentes y la cabecera dice la última lectura', async () => {
      const user = userEvent.setup();
      await renderReady();
      expect(screen.getByText(/^Última lectura /)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Actualizar' }));

      await waitFor(() => expect(tenantApi.summary).toHaveBeenCalledTimes(2));
      expect(tenantApi.list).toHaveBeenCalledTimes(2);
      expect(platformAuditApi.list).toHaveBeenCalledTimes(2);
      expect(healthApi.get).toHaveBeenCalledTimes(2);
      expect(platformUsersApi.summary).toHaveBeenCalledTimes(2);
    });
  });

  describe('formatRelativeTime (vía la actividad)', () => {
    beforeEach(() => {
      jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it.each([
      ['segundos', minutesAgo(0.5), 'ahora'],
      ['59 minutos', minutesAgo(59), 'hace 59 minutos'],
      ['60 minutos', minutesAgo(60), 'hace 1 hora'],
      ['23 h 59 min', minutesAgo(23 * 60 + 59), 'hace 23 horas'],
      ['24 horas', minutesAgo(24 * 60), 'ayer'],
      ['3 días', minutesAgo(3 * 24 * 60), 'hace 3 días'],
      ['fecha inválida', 'no-es-fecha', 'Reciente'],
    ])('%s se muestra con su tramo', async (_label, createdAt, expected) => {
      platformAuditApi.list.mockResolvedValue({ data: [makeAuditEntry({ createdAt })] });

      render(<DashboardClient />);

      const activity = await screen.findByRole('region', { name: 'Actividad reciente' });
      expect(await within(activity).findByRole('time')).toHaveTextContent(expected);
    });
  });

  describe('Fase 3 · disponibilidad y colas (P2)', () => {
    const none = { samples: 0, availability: null };

    it('CA-PP3-01: un día sin muestras se pinta sin dato, nunca verde', async () => {
      platformHealthApi.history.mockResolvedValue(
        makePlatformHealthHistory({
          days: makeHealthDays({ 3: { api: none, db: none, redis: none }, 7: { db: none } }),
        }),
      );
      await renderReady();

      const cell = within(pulse()).getByRole('link', { name: 'Disponibilidad, 30 días' });
      expect(cell).toHaveTextContent('100 %');
      expect(cell).toHaveTextContent('2 días sin dato');
      const tracker = within(cell).getByRole('img');
      expect(tracker).toHaveAccessibleName(
        'Disponibilidad diaria de los últimos 30 días: 28 sin fallas, 0 con fallas, 2 sin dato',
      );
      const bars = tracker.querySelectorAll('[data-tone]');
      expect(bars).toHaveLength(30);
      expect(bars[3]).toHaveAttribute('data-tone', 'neutral');
      expect(bars[7]).toHaveAttribute('data-tone', 'neutral');
    });

    it('CA-PP3-02: disponibilidad solo con muestras reales y peor componente', async () => {
      platformHealthApi.history.mockResolvedValue(
        makePlatformHealthHistory({
          days: makeHealthDays({ 29: { redis: { samples: 100, availability: 0.5 } } }),
        }),
      );
      await renderReady();

      const cell = within(pulse()).getByRole('link', { name: 'Disponibilidad, 30 días' });
      // Redis: (29·288 + 50) / (29·288 + 100) = 0,99408…, truncado a 99,4 %.
      expect(cell).toHaveTextContent('99,4 %');
      expect(cell).toHaveTextContent('Con fallas');
      expect(cell).toHaveTextContent('Peor componente: Redis');
    });

    it('CA-PP3-02: sin ninguna muestra no inventa disponibilidad', async () => {
      platformHealthApi.history.mockResolvedValue(
        makePlatformHealthHistory({
          days: makeHealthDays(
            Object.fromEntries(
              Array.from({ length: 30 }, (_, i) => [i, { api: none, db: none, redis: none }]),
            ),
          ),
          queues: [],
          queuesSampledAt: null,
        }),
      );
      await renderReady();

      const cell = within(pulse()).getByRole('link', { name: 'Disponibilidad, 30 días' });
      expect(cell).toHaveTextContent('Sin muestras en 30 días');
      expect(cell).not.toHaveTextContent('%');
      expect(screen.getByText('Aún no hay muestras de las colas.')).toBeInTheDocument();
    });

    it('CA-PP3-02: el historial caído degrada solo su celda, el tracker y Colas, con Reintentar', async () => {
      platformHealthApi.history
        .mockRejectedValueOnce(new ApiError(500, 'UNKNOWN', 'Error crudo'))
        .mockResolvedValue(makePlatformHealthHistory());
      const user = userEvent.setup();
      await renderReady();

      expect(
        await screen.findByText('No pudimos cargar las colas de trabajo.'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('No pudimos cargar la disponibilidad de 30 días.'),
      ).toBeInTheDocument();
      expect(within(pulse()).getByText('No disponible')).toBeInTheDocument();
      expect(screen.queryByText(/Error crudo/)).not.toBeInTheDocument();
      expect(within(pulse()).getByRole('link', { name: 'Empresas activas' })).toBeInTheDocument();

      const queues = screen.getByRole('region', { name: 'Colas de trabajo' });
      await user.click(within(queues).getByRole('button', { name: 'Reintentar' }));
      expect(
        await within(pulse()).findByRole('link', { name: 'Disponibilidad, 30 días' }),
      ).toHaveTextContent('100 %');
      expect(platformHealthApi.history).toHaveBeenCalledTimes(2);
    });

    it('CA-PP3-03: solo colas con novedad, resumen de las demás y «Ver todas»', async () => {
      platformHealthApi.history.mockResolvedValue(
        makePlatformHealthHistory({
          queues: [
            { name: 'search-index', waiting: 3, failed: 1, oldestWaitingSeconds: 420 },
            { name: 'cola-nueva-x', waiting: 0, failed: 0, oldestWaitingSeconds: null },
            { name: 'tenant-provisioning', waiting: 0, failed: 0, oldestWaitingSeconds: null },
          ],
        }),
      );
      const user = userEvent.setup();
      await renderReady();

      const queues = screen.getByRole('region', { name: 'Colas de trabajo' });
      const row = within(queues).getByRole('row', { name: /Índice de búsqueda/ });
      expect(row).toHaveTextContent('Índice de búsqueda317 min');
      expect(within(queues).queryByRole('row', { name: /Proceso interno/ })).toBeNull();
      expect(queues).toHaveTextContent('2 colas sin novedad');
      await user.click(within(queues).getByRole('button', { name: 'Ver todas' }));
      expect(within(queues).getByRole('row', { name: /Proceso interno/ })).toHaveTextContent(
        'Sin espera',
      );
      expect(queues).not.toHaveTextContent('search-index');
      expect(queues).not.toHaveTextContent('cola-nueva-x');
    });

    it('defecto 2: fallidos sin espera se rotulan «Con fallos» y entran en «Requiere tu atención»', async () => {
      platformHealthApi.history.mockResolvedValue(
        makePlatformHealthHistory({
          queues: [
            { name: 'search-index', waiting: 0, failed: 14, oldestWaitingSeconds: null },
            { name: 'tenant-provisioning', waiting: 0, failed: 0, oldestWaitingSeconds: null },
          ],
        }),
      );
      await renderReady();

      const queues = screen.getByRole('region', { name: 'Colas de trabajo' });
      expect(within(queues).getByText('Con fallos')).toBeInTheDocument();
      expect(within(queues).queryByText('Acumulación')).toBeNull();
      expect(
        await screen.findByRole('link', {
          name: 'Atención: 14 trabajos fallidos. Colas de trabajo · 1 cola',
        }),
      ).toHaveAttribute('href', '#colas-de-trabajo');
      expect(screen.queryByText('Todo al día')).not.toBeInTheDocument();
    });

    it('C-D2: una espera reciente (< 5 min) se lista pero no avisa ni entra en atención', async () => {
      platformHealthApi.history.mockResolvedValue(
        makePlatformHealthHistory({
          queues: [{ name: 'search-index', waiting: 2, failed: 0, oldestWaitingSeconds: 30 }],
        }),
      );
      // Sin usuarios sin verificación: esa fila (F2-D3) también impediría «Todo al día».
      platformUsersApi.summary.mockResolvedValue(makePlatformUsersSummary({ withoutMfa: 0 }));
      await renderReady();

      const queues = screen.getByRole('region', { name: 'Colas de trabajo' });
      expect(within(queues).getByRole('row', { name: /Índice de búsqueda/ })).toBeInTheDocument();
      expect(within(queues).queryByText('Acumulación')).toBeNull();
      expect(await screen.findByText('Todo al día')).toBeInTheDocument();
    });

    it('C-D2: una espera de 5 min o más avisa «Acumulación» y entra en atención', async () => {
      platformHealthApi.history.mockResolvedValue(
        makePlatformHealthHistory({
          queues: [{ name: 'search-index', waiting: 2, failed: 0, oldestWaitingSeconds: 300 }],
        }),
      );
      await renderReady();

      const queues = screen.getByRole('region', { name: 'Colas de trabajo' });
      expect(within(queues).getByText('Acumulación')).toBeInTheDocument();
      expect(
        await screen.findByRole('link', {
          name: 'Atención: 2 trabajos en espera. Colas de trabajo · 1 cola',
        }),
      ).toHaveAttribute('href', '#colas-de-trabajo');
    });

    it('defecto 3: sin colas con novedad, una línea «sin novedad» y sin rótulo de aviso', async () => {
      platformHealthApi.history.mockResolvedValue(
        makePlatformHealthHistory({
          queues: [
            { name: 'search-index', waiting: 0, failed: 0, oldestWaitingSeconds: null },
            { name: 'tenant-provisioning', waiting: 0, failed: 0, oldestWaitingSeconds: null },
          ],
        }),
      );
      await renderReady();

      const queues = screen.getByRole('region', { name: 'Colas de trabajo' });
      expect(queues).toHaveTextContent('Sin novedad en las 2 colas.');
      expect(within(queues).queryByRole('table')).toBeNull();
      expect(within(queues).queryByText('Con fallos')).toBeNull();
      expect(within(queues).queryByText('Acumulación')).toBeNull();
    });
  });

  describe('P4 · Uso por empresa', () => {
    const usageRegion = () => screen.queryByRole('region', { name: 'Uso por empresa' });
    const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();

    it('CA-PP4-01: IWANA_SUPPORT no ve el área ni la pide', async () => {
      await renderReady();
      expect(usageRegion()).not.toBeInTheDocument();
      expect(tenantApi.usage).not.toHaveBeenCalled();
    });

    it('CA-PP4-01/02/03: SYSTEM_ADMIN ve barra, sin cupo, «Sin dato» y desactualizada', async () => {
      mockRole = 'SYSTEM_ADMIN';
      tenantApi.usage.mockResolvedValue({
        generatedAt: hoursAgo(0),
        items: [
          {
            tenantId: 't1',
            name: 'NetCaribe',
            activeSubscribers: 64,
            maxSubscribers: 100,
            measuredAt: hoursAgo(1),
          },
          {
            tenantId: 't2',
            name: 'Redes del Sur',
            activeSubscribers: 96,
            maxSubscribers: 100,
            measuredAt: hoursAgo(3),
          },
          {
            tenantId: 't3',
            name: 'Sin Cupo',
            activeSubscribers: 1200,
            maxSubscribers: null,
            measuredAt: hoursAgo(1),
          },
          {
            tenantId: 't4',
            name: 'Nueva',
            activeSubscribers: null,
            maxSubscribers: 50,
            measuredAt: null,
          },
        ],
      });
      await renderReady();
      const region = await screen.findByRole('region', { name: 'Uso por empresa' });
      const area = within(region);
      expect(tenantApi.usage).toHaveBeenCalledTimes(1);
      expect(await area.findByText('96 %')).toBeInTheDocument();
      expect(area.getByText('64 %')).toBeInTheDocument();
      expect(area.getByText('1.200 suscriptores')).toBeInTheDocument();
      expect(area.getByText('Sin dato')).toBeInTheDocument();
      expect(area.queryByText('0 %')).not.toBeInTheDocument();
      expect(area.getAllByText('Desactualizada')).toHaveLength(1);
      expect(area.getByText('Cerca del cupo')).toBeInTheDocument();
      const items = area.getAllByRole('listitem').map((li) => li.textContent);
      expect(items[0]).toContain('Redes del Sur');
      expect(items[3]).toContain('Nueva');
    });

    it('cupo 0: cifra con aviso «No admite nuevos suscriptores», sin porcentaje', async () => {
      mockRole = 'SYSTEM_ADMIN';
      tenantApi.usage.mockResolvedValue({
        generatedAt: hoursAgo(0),
        items: [
          {
            tenantId: 't1',
            name: 'Cerrada',
            activeSubscribers: 7,
            maxSubscribers: 0,
            measuredAt: hoursAgo(1),
          },
          {
            tenantId: 't2',
            name: 'Vacía',
            activeSubscribers: 0,
            maxSubscribers: 0,
            measuredAt: hoursAgo(1),
          },
        ],
      });
      await renderReady();
      const area = within(await screen.findByRole('region', { name: 'Uso por empresa' }));
      expect(await area.findByText('7 suscriptores')).toBeInTheDocument();
      expect(area.getByText('0 suscriptores')).toBeInTheDocument();
      expect(area.getAllByText('No admite nuevos suscriptores')).toHaveLength(2);
      expect(area.queryByText(/%/)).not.toBeInTheDocument();
      expect(area.queryByRole('img')).not.toBeInTheDocument();
    });

    it('CA-PP4-04: en error solo el área degrada y Reintentar la recupera', async () => {
      mockRole = 'SYSTEM_ADMIN';
      tenantApi.usage.mockRejectedValueOnce(new ApiError(500, 'X', 'fallo'));
      await renderReady();
      const region = await screen.findByRole('region', { name: 'Uso por empresa' });
      expect(
        await within(region).findByText('No pudimos cargar el uso por empresa.'),
      ).toBeInTheDocument();
      expect(companies()).toBeInTheDocument();
      expect(screen.queryByText(DIRECTORY_ERROR)).not.toBeInTheDocument();
      await userEvent.click(within(region).getByRole('button', { name: 'Reintentar' }));
      await waitFor(() => expect(tenantApi.usage).toHaveBeenCalledTimes(2));
      expect(await within(region).findByText('Aún no hay empresas activas.')).toBeInTheDocument();
    });
  });
});
