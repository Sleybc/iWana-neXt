import '@testing-library/jest-dom';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

// Doble ligero del panel; `useRealStatusPanel` monta el componente real (v1.2 §4.1, §8.4).
let useRealStatusPanel = false;
jest.mock('@/components/dashboard/SystemStatusPanel', () => {
  const actual = jest.requireActual<typeof import('@/components/dashboard/SystemStatusPanel')>(
    '@/components/dashboard/SystemStatusPanel',
  );
  return {
    ...actual,
    SystemStatusPanel: (props: Parameters<typeof actual.SystemStatusPanel>[0]) =>
      useRealStatusPanel ? (
        <actual.SystemStatusPanel {...props} />
      ) : (
        <section>
          <p>Salud de plataforma</p>
          {props.summary && !props.error ? <p>{props.summary}</p> : null}
          {/* v1.2 E1: el error de /health sale una vez, en el lugar de los servicios. */}
          {props.error ? <p>{props.error}</p> : null}
          {props.indicators.map((indicator) => (
            <p key={indicator.label}>
              {indicator.label}: {indicator.detail}
            </p>
          ))}
        </section>
      ),
  };
});

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
    tenantApi: { summary: jest.Mock };
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
    tenantApi.summary.mockResolvedValue(makeTenantStatusSummary());
  });

  /** Parque con los seis estados y cinco entradas de actividad (fixture de CA-PS-01..09). */
  async function renderPopulated() {
    tenantApi.summary.mockResolvedValue(
      makeTenantStatusSummary(
        {
          ACTIVE: 2,
          PROVISIONING: 1,
          PROVISIONING_FAILED: 1,
          SUSPENDED: 1,
          INACTIVE: 1,
          MARKED_FOR_DELETION: 1,
        },
        { updatedLast7Days: 1 },
      ),
    );
    platformAuditApi.list.mockResolvedValue({
      data: Array.from({ length: 5 }, (_, index) =>
        makeAuditEntry({
          id: `audit-${index + 1}`,
          displayName: `Operador ${index + 1}`,
          entityId: `tenant-${index + 1}`,
          createdAt: new Date(Date.now() - (index + 1) * 60 * 1000).toISOString(),
        }),
      ),
    });

    render(<DashboardClient />);
    await screen.findByRole('link', { name: 'Ver empresas activas' });
  }

  it('CA-PS-03: no pinta ceros en chips ni en el desglose mientras carga', async () => {
    const tenantsDeferred = createDeferred<unknown>();
    const auditDeferred = createDeferred<unknown>();
    const healthDeferred = createDeferred<unknown>();
    tenantApi.summary.mockReturnValue(tenantsDeferred.promise);
    platformAuditApi.list.mockReturnValue(auditDeferred.promise);
    healthApi.get.mockReturnValue(healthDeferred.promise);

    render(<DashboardClient />);

    expect(await screen.findByText('Cargando el centro de control')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.queryByText('Activas')).not.toBeInTheDocument();

    tenantsDeferred.resolve(makeTenantStatusSummary());
    auditDeferred.resolve({ data: [] });
    healthDeferred.resolve({
      status: 'ok',
      db: 'ok',
      redis: 'ok',
      timestamp: '2026-06-26T10:00:00.000Z',
    });

    await waitFor(() => {
      expect(screen.queryByText('Cargando el centro de control')).not.toBeInTheDocument();
    });
    const summaryRegion = screen.getByRole('region', { name: 'Resumen operativo' });
    ['Activas', 'En configuración', 'Requieren atención', 'Cambios esta semana'].forEach(
      (label) => {
        const chipLabel = within(summaryRegion).getByText(label);
        // Anatomía de MetricCard (contrato DS 2026-11-21 §3): la cifra precede al título.
        expect(chipLabel.previousElementSibling).toHaveTextContent(/^0$/);
      },
    );
  });

  describe('portada de señal con parque poblado', () => {
    it('CA-PS-01: muestra título, subtítulo y resumen operativo', async () => {
      await renderPopulated();

      expect(
        screen.getByRole('heading', { level: 1, name: 'Centro de control' }),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Salud de plataforma, altas en curso y lo que requiere atención.'),
      ).toBeInTheDocument();
      expect(screen.getByText('Resumen operativo')).toBeInTheDocument();
      expect(
        screen.getByText(
          '2 empresas operan con normalidad. 1 sigue en configuración y 3 requieren revisión.',
        ),
      ).toBeInTheDocument();
    });

    it('CA-PS-02: no hay tabla, directorio ni textos retirados', async () => {
      await renderPopulated();

      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Revisar empresas' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Ver historial' })).not.toBeInTheDocument();
      expect(screen.queryByText('Tabla empresas')).not.toBeInTheDocument();
      expect(screen.queryByText('Directorio de empresas')).not.toBeInTheDocument();
      expect(screen.queryByText('Directorio por estado')).not.toBeInTheDocument();
      expect(screen.queryByText('Empresas visibles')).not.toBeInTheDocument();
      expect(screen.queryByText(/Usa esta portada para priorizar/)).not.toBeInTheDocument();
      expect(screen.queryByText('Puestas en marcha')).not.toBeInTheDocument();
    });

    it('CA-PS-04: los chips llevan a destinos canónicos y el resumen se lee una vez', async () => {
      await renderPopulated();

      const active = screen.getByRole('link', { name: 'Ver empresas activas' });
      expect(active).toHaveAttribute('href', '/tenants?status=ACTIVE');
      expect(active).toHaveTextContent('2');
      const provisioning = screen.getByRole('link', { name: 'Ver empresas en configuración' });
      expect(provisioning).toHaveAttribute('href', '/tenants?status=PROVISIONING');
      expect(provisioning).toHaveTextContent('1');
      expect(screen.getByText('Cambios esta semana')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /cambios esta semana/i })).not.toBeInTheDocument();
      expect(tenantApi.summary).toHaveBeenCalledTimes(1);
    });

    it('G0-2: «Requieren atención» suma los estados de atención sin INACTIVE y es un botón', async () => {
      await renderPopulated();

      expect(screen.getByText('Requieren atención')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Ver el desglose por estado' })).toHaveTextContent(
        '3',
      );
      expect(
        screen.queryByRole('link', { name: 'Ver el desglose por estado' }),
      ).not.toBeInTheDocument();
    });

    it('CA-PS-04: S-3 «Requieren atención» mueve el foco al encabezado del desglose', async () => {
      await renderPopulated();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: 'Ver el desglose por estado' }));

      expect(document.activeElement).toHaveTextContent('Empresas por estado');
      expect(document.activeElement).toHaveAttribute('tabindex', '-1');
    });

    it.each([
      ['Activas: 2', '/tenants?status=ACTIVE'],
      ['En configuración: 1', '/tenants?status=PROVISIONING'],
      ['Con error: 1', '/tenants?status=PROVISIONING_FAILED'],
      ['Suspendidas: 1', '/tenants?status=SUSPENDED'],
      ['Inactivas: 1', '/tenants?status=INACTIVE'],
      ['En eliminación: 1', '/tenants?status=MARKED_FOR_DELETION'],
    ])('CA-PS-05: el tramo «%s» del desglose enlaza a %s', async (name, href) => {
      await renderPopulated();

      const links = screen.getAllByRole('link', { name });
      expect(links).not.toHaveLength(0);
      links.forEach((link) => expect(link).toHaveAttribute('href', href));
    });

    it('CA-PS-05: el desglose totaliza el parque y la barra no contiene enlaces', async () => {
      await renderPopulated();

      expect(screen.getByRole('link', { name: 'Ver todas las empresas' })).toHaveAttribute(
        'href',
        '/tenants',
      );
      expect(screen.getByText('En el directorio')).toBeInTheDocument();
      expect(screen.getByText('7 empresas')).toBeInTheDocument();
      expect(screen.getByText('Ya operan con normalidad.')).toBeInTheDocument();
      expect(screen.getByText('La puesta en marcha no terminó.')).toBeInTheDocument();
      const statusBar = screen.getByRole('img', { name: /activas/i });
      expect(within(statusBar).queryAllByRole('link')).toHaveLength(0);
    });

    it('CA-PS-07: la actividad muestra 5 entradas legibles sin ids ni acciones crudas', async () => {
      await renderPopulated();

      expect(platformAuditApi.list).toHaveBeenCalledWith({ limit: 5 });
      const activity = screen.getByRole('region', { name: 'Actividad reciente' });
      expect(within(activity).getAllByRole('listitem')).toHaveLength(5);
      const timestamps = within(activity).getAllByRole('time');
      expect(timestamps).toHaveLength(5);
      timestamps.forEach((node) =>
        expect(node.getAttribute('dateTime')).toMatch(/^\d{4}-\d{2}-\d{2}T/),
      );
      expect(within(activity).getByText('Operador 1 actualizó una empresa')).toBeInTheDocument();
      expect(within(activity).queryByText(/tenant-\d/)).not.toBeInTheDocument();
      expect(within(activity).queryByText('UPDATE')).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Abrir historial' })).toHaveAttribute(
        'href',
        '/audit-logs',
      );
    });

    it('CA-PS-08: el monitoreo lista los cuatro indicadores en orden', async () => {
      await renderPopulated();

      const healthSection = screen.getByText('Salud de plataforma').closest('section');
      expect(healthSection).not.toBeNull();
      const healthLines = Array.from(healthSection!.querySelectorAll('p'))
        .map((node) => node.textContent ?? '')
        .filter((text) => text.includes(':'));
      expect(healthLines).toEqual([
        expect.stringMatching(/^Atención operativa:/),
        expect.stringMatching(/^API de plataforma:/),
        expect.stringMatching(/^Base de datos:/),
        expect.stringMatching(/^Redis y colas:/),
      ]);
    });
  });

  it('CA-PS-06: parque vacío muestra empty de D y CTA a alta, sin tabla', async () => {
    tenantApi.summary.mockResolvedValue(makeTenantStatusSummary());
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
  });

  it('CA-PS-05: tramo en cero no es control y D-5/D-6 se omiten', async () => {
    tenantApi.summary.mockResolvedValue(makeTenantStatusSummary({ ACTIVE: 1 }));

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
    tenantApi.summary.mockRejectedValue(
      new ApiError(503, 'UNAVAILABLE', 'Servicio de empresas no disponible.'),
    );
    platformAuditApi.list.mockResolvedValue({
      data: [makeAuditEntry()],
    });

    render(<DashboardClient />);

    expect(await screen.findAllByText(DIRECTORY_ERROR)).not.toHaveLength(0);
    expect(screen.queryByRole('link', { name: 'Ver empresas activas' })).not.toBeInTheDocument();
    expect(screen.getByText('Salud de plataforma')).toBeInTheDocument();
    expect(
      screen.getByText('API, base de datos y Redis responden correctamente.'),
    ).toBeInTheDocument();
    expect(screen.getByText('María Admin actualizó una empresa')).toBeInTheDocument();
    expect(screen.queryByText('Directorio de empresas')).not.toBeInTheDocument();
  });

  // Ola 2 §D: un 503 de /health con cuerpo PublicHealth ya no es un fallo (healthApi lo
  // resuelve como lectura `degraded`); el fallo de lectura se ejercita con un error de red real.
  it('CA-PS-10: el fallo de red de health degrada solo el monitoreo', async () => {
    tenantApi.summary.mockResolvedValue(makeTenantStatusSummary({ ACTIVE: 1 }));
    platformAuditApi.list.mockResolvedValue({
      data: [makeAuditEntry()],
    });
    healthApi.get.mockRejectedValue(new TypeError('Failed to fetch'));

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

  it('CA-PS-10: un ApiError de health muestra el copy canónico, nunca el mensaje crudo', async () => {
    healthApi.get.mockRejectedValue(new ApiError(503, 'UNKNOWN', 'Error del servidor'));

    render(<DashboardClient />);

    expect(
      await screen.findByText('No pudimos validar API, base de datos y Redis en este momento.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Error del servidor/)).not.toBeInTheDocument();
  });

  it('v1.2 §4.1: con /health caído, el panel real muestra un solo error y conserva Atención operativa', async () => {
    useRealStatusPanel = true;
    try {
      tenantApi.summary.mockResolvedValue(makeTenantStatusSummary({ ACTIVE: 1 }));
      platformAuditApi.list.mockResolvedValue({ data: [makeAuditEntry()] });
      healthApi.get.mockRejectedValue(new TypeError('Failed to fetch'));

      render(<DashboardClient />);

      const message = 'No pudimos validar API, base de datos y Redis en este momento.';
      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.getAllByText(message)).toHaveLength(1);
      expect(
        screen.getAllByRole('alert').filter((el) => el.textContent?.includes(message)),
      ).toHaveLength(1);
      expect(screen.getByText('Atención operativa')).toBeInTheDocument();
      expect(screen.queryByText('API de plataforma')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    } finally {
      useRealStatusPanel = false;
    }
  });

  it('CA-PS-10: una lectura degradada (503 de /health) se muestra como degradada, no como error', async () => {
    healthApi.get.mockResolvedValue({
      status: 'degraded',
      db: 'error',
      redis: 'ok',
      timestamp: '2026-06-26T10:00:00.000Z',
    });

    render(<DashboardClient />);

    expect(
      await screen.findByText(
        'La plataforma responde, pero hay servicios que requieren seguimiento.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Base de datos: No disponible.')).toBeInTheDocument();
    expect(screen.getByText('Redis y colas: Sin acumulación visible.')).toBeInTheDocument();
    expect(
      screen.getByText('API de plataforma: Disponible con validaciones pendientes.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('No pudimos validar API, base de datos y Redis en este momento.'),
    ).not.toBeInTheDocument();
  });

  it('CA-PS-10: el fallo de auditoría degrada solo la actividad', async () => {
    tenantApi.summary.mockResolvedValue(makeTenantStatusSummary({ ACTIVE: 1 }));
    platformAuditApi.list.mockRejectedValue(new Error('Audit timeout'));

    render(<DashboardClient />);

    expect(await screen.findByText(ACTIVITY_ERROR)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver empresas activas' })).toBeInTheDocument();
    expect(screen.getByText('Empresas por estado')).toBeInTheDocument();
    expect(screen.getByText('Salud de plataforma')).toBeInTheDocument();
    const activity = screen.getByRole('region', { name: 'Actividad reciente' });
    expect(within(activity).getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('E-1: los chips y el desglose leen el resumen completo, no una página de 100', async () => {
    tenantApi.summary.mockResolvedValue(
      makeTenantStatusSummary(
        { ACTIVE: 180, PROVISIONING: 40, SUSPENDED: 13 },
        { updatedLast7Days: 57 },
      ),
    );

    render(<DashboardClient />);

    expect(await screen.findByRole('link', { name: 'Ver empresas activas' })).toHaveTextContent(
      '180',
    );
    expect(screen.getByRole('link', { name: 'Ver empresas en configuración' })).toHaveTextContent(
      '40',
    );
    expect(screen.getByRole('button', { name: 'Ver el desglose por estado' })).toHaveTextContent(
      '13',
    );
    expect(screen.getByText('57')).toBeInTheDocument();
    expect(screen.getByText('233 empresas')).toBeInTheDocument();
  });

  it('L-10: los indicadores de servicio no dependen del directorio ni de las altas', async () => {
    tenantApi.summary.mockRejectedValue(new Error('boom'));

    const { unmount } = render(<DashboardClient />);

    expect(
      await screen.findByText('API de plataforma: Disponible para el equipo interno.'),
    ).toBeInTheDocument();
    unmount();

    tenantApi.summary.mockResolvedValue(makeTenantStatusSummary({ PROVISIONING: 4 }));
    render(<DashboardClient />);

    expect(await screen.findByText('Redis y colas: Sin acumulación visible.')).toBeInTheDocument();
    expect(screen.getByText('Base de datos: Responde correctamente.')).toBeInTheDocument();
  });

  describe('reintento (Q-3)', () => {
    it('«Reintentar» vuelve a pedir los tres contratos y reemplaza el error por datos', async () => {
      tenantApi.summary
        .mockRejectedValueOnce(new ApiError(503, 'UNAVAILABLE', 'Servicio no disponible.'))
        .mockResolvedValueOnce(makeTenantStatusSummary({ ACTIVE: 4 }));
      const user = userEvent.setup();

      render(<DashboardClient />);
      const retryButtons = await screen.findAllByRole('button', { name: 'Reintentar' });
      expect(screen.queryByRole('link', { name: 'Ver empresas activas' })).not.toBeInTheDocument();

      await user.click(retryButtons[0]!);

      expect(await screen.findByRole('link', { name: 'Ver empresas activas' })).toHaveTextContent(
        '4',
      );
      expect(tenantApi.summary).toHaveBeenCalledTimes(2);
      expect(platformAuditApi.list).toHaveBeenCalledTimes(2);
      expect(healthApi.get).toHaveBeenCalledTimes(2);
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
      expect(platformAuditApi.list).toHaveBeenCalledTimes(2);
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
