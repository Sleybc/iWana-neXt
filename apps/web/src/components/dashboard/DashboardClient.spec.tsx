import '@testing-library/jest-dom';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TenantStatus } from '@iwana/shared';
import { makeTenantStatusSummary } from '@/test-utils/tenant-status-summary';
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
    },
    platformAuditApi: {
      list: jest.fn(),
    },
    healthApi: {
      get: jest.fn(),
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
  const { tenantApi, platformAuditApi, healthApi, ApiError } = jest.requireMock(
    '@/lib/api-client',
  ) as {
    ApiError: new (status: number, code: string, message: string) => Error;
    tenantApi: { summary: jest.Mock; list: jest.Mock };
    platformAuditApi: { list: jest.Mock };
    healthApi: { get: jest.Mock };
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
    healthApi.get.mockResolvedValue(HEALTH_OK);
    platformAuditApi.list.mockResolvedValue({ data: [] });
    tenantApi.summary.mockResolvedValue(makeTenantStatusSummary());
    tenantApi.list.mockResolvedValue([]);
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
    const health = within(strip).getByRole('link', { name: 'Salud de plataforma' });
    expect(health).toHaveTextContent('3 de 3');
    expect(health).toHaveTextContent('Operativa');
    expect(health).toHaveTextContent('API · base de datos · Redis');
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
    render(<DashboardClient />);
    expect(await screen.findByText('Todo al día')).toBeInTheDocument();
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
    expect(within(pulse()).getByRole('link', { name: 'Salud de plataforma' })).toHaveTextContent(
      '3 de 3',
    );
  });

  it('CA-PP-04: /health caído degrada solo su celda y su panel, con un único error canónico', async () => {
    healthApi.get.mockRejectedValue(new ApiError(503, 'UNKNOWN', 'Error del servidor'));
    tenantApi.summary.mockResolvedValue(makeTenantStatusSummary({ ACTIVE: 1 }));

    render(<DashboardClient />);

    expect(await screen.findByText(HEALTH_ERROR)).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Empresas activas' })).toHaveTextContent('1');
    expect(screen.getAllByText(HEALTH_ERROR)).toHaveLength(1);
    expect(screen.queryByText(/Error del servidor/)).not.toBeInTheDocument();
    expect(within(pulse()).getByText('No disponible')).toBeInTheDocument();
    expect(
      within(pulse()).queryByRole('link', { name: 'Salud de plataforma' }),
    ).not.toBeInTheDocument();
  });

  it('B2: una lectura degradada se muestra como degradada, no como error de lectura', async () => {
    healthApi.get.mockResolvedValue({ ...HEALTH_OK, status: 'degraded', db: 'error' });
    await renderReady();

    expect(within(pulse()).getByRole('link', { name: 'Salud de plataforma' })).toHaveTextContent(
      'Degradada',
    );
    const panel = document.getElementById('salud-de-plataforma') as HTMLElement;
    expect(within(panel).getByText('Base de datos').parentElement).toHaveTextContent('Error');
    expect(within(panel).getByText('Redis y colas').parentElement).toHaveTextContent('Operativo');
    expect(screen.queryByText(HEALTH_ERROR)).not.toBeInTheDocument();
  });

  it('CA-PP-06: actividad pide 20, descarta sesión y pinta máx. 5 con <time dateTime>', async () => {
    platformAuditApi.list.mockResolvedValue({
      data: [
        makeAuditEntry({ id: 'login', action: 'LOGIN' }),
        makeAuditEntry({ id: 'refresh', action: 'REFRESH' }),
        ...Array.from({ length: 7 }, (_, index) =>
          makeAuditEntry({ id: `audit-${index}`, displayName: `Operador ${index + 1}` }),
        ),
      ],
    });
    await renderReady();

    expect(platformAuditApi.list).toHaveBeenCalledWith({ limit: 20 });
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

  it('CA-PP-05: no monta bloques de P1–P4 ni piezas retiradas', async () => {
    await renderReady();

    [
      /Disponibilidad/,
      /Equipo interno/,
      /Usuarios internos/,
      /Uso por empresa/,
      /Cambios esta semana/,
      /Atención operativa/,
    ].forEach((text) => expect(screen.queryByText(text)).not.toBeInTheDocument());
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

  it('CA-PP-06: descarta las cuatro acciones de sesión', async () => {
    platformAuditApi.list.mockResolvedValue({
      data: [
        ...['LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'REFRESH'].map((action) =>
          makeAuditEntry({ id: `s-${action}`, action, displayName: `Sesión ${action}` }),
        ),
        makeAuditEntry({ id: 'keep', displayName: 'Operadora' }),
      ],
    });
    await renderReady();

    const activity = screen.getByRole('region', { name: 'Actividad reciente' });
    expect(await within(activity).findAllByRole('listitem')).toHaveLength(1);
    expect(within(activity).getByText('Operadora actualizó una empresa')).toBeInTheDocument();
    expect(activity.textContent).not.toMatch(/Sesión/);
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

    it('B0: «Actualizar» vuelve a pedir las cuatro fuentes y la cabecera dice la última lectura', async () => {
      const user = userEvent.setup();
      await renderReady();
      expect(screen.getByText(/^Última lectura /)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Actualizar' }));

      await waitFor(() => expect(tenantApi.summary).toHaveBeenCalledTimes(2));
      expect(tenantApi.list).toHaveBeenCalledTimes(2);
      expect(platformAuditApi.list).toHaveBeenCalledTimes(2);
      expect(healthApi.get).toHaveBeenCalledTimes(2);
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
});
