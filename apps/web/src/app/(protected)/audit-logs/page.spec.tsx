import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AuditLogsPage from './page';

let searchParamsMock = new URLSearchParams();
const replaceMock = jest.fn();

jest.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsMock,
  usePathname: () => '/audit-logs',
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

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

jest.mock('@/components/layout/PageHeader', () => ({
  PageHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <header>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
  ),
}));

jest.mock('@/components/shared/PlatformTenantPicker', () => ({
  PlatformTenantPicker: ({
    tenants,
    value,
    onChange,
    ariaLabel,
  }: {
    tenants: Array<{ id: string; name: string; slug: string }>;
    value: string;
    onChange: (value: string) => void;
    ariaLabel?: string;
  }) => (
    <label>
      <span>{ariaLabel ?? 'Seleccionar empresa'}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {tenants.map((tenant) => (
          <option key={tenant.id} value={tenant.slug}>
            {tenant.name}
          </option>
        ))}
      </select>
    </label>
  ),
}));

const summaryPresetMock = jest.fn();

jest.mock('@/components/audit/AuditSummary', () => ({
  AuditSummary: ({
    mode,
    tenantName,
    entries,
    isLoading,
    activePreset,
    onPresetChange,
  }: {
    mode: 'platform' | 'tenant';
    tenantName?: string;
    entries: Array<unknown>;
    isLoading: boolean;
    activePreset: string | null;
    onPresetChange: (preset: string | null) => void;
  }) => (
    <section data-testid={`${mode}-summary`}>
      <p>{mode === 'tenant' ? `Resumen de ${tenantName}` : 'Resumen de plataforma'}</p>
      <p>{isLoading ? 'Cargando resumen' : `Entradas resumen: ${entries.length}`}</p>
      <p>Preset activo: {activePreset ?? 'ninguno'}</p>
      <button
        type="button"
        onClick={() => {
          summaryPresetMock('critical');
          onPresetChange(activePreset === 'critical' ? null : 'critical');
        }}
      >
        Ver críticos {mode}
      </button>
      <button
        type="button"
        onClick={() => {
          summaryPresetMock('access');
          onPresetChange('access');
        }}
      >
        Ver accesos {mode}
      </button>
      <button
        type="button"
        onClick={() => {
          summaryPresetMock('tenants');
          onPresetChange(activePreset === 'tenants' ? null : 'tenants');
        }}
      >
        Ver empresas {mode}
      </button>
    </section>
  ),
}));

jest.mock('@/components/audit/AuditLogsTable', () => ({
  AuditLogsTable: ({
    companyName,
    entries,
    isLoading,
    actionFilter,
    dateFrom,
    dateTo,
    pageSize,
    emptySummaryPreset,
    onActionFilterChange,
    onPageSizeChange,
    onDateFromChange,
    onDateToChange,
    onExportCsv,
    titleRef,
    titleId,
  }: {
    companyName?: string;
    entries: Array<{ id: string; action?: string; entityType?: string }>;
    isLoading: boolean;
    actionFilter?: string;
    dateFrom?: string;
    dateTo?: string;
    pageSize?: number;
    emptySummaryPreset?: boolean;
    onActionFilterChange?: (value: string) => void;
    onDateFromChange?: (value: string) => void;
    onDateToChange?: (value: string) => void;
    onPageSizeChange?: (value: number) => void;
    onExportCsv?: () => Promise<{ truncated: boolean } | void> | { truncated: boolean } | void;
    titleRef?: { current: HTMLHeadingElement | null };
    titleId?: string;
  }) => (
    <section data-testid={companyName ? 'tenant-table' : 'platform-table'}>
      <h2 id={titleId} ref={titleRef} tabIndex={-1}>
        Listado de cambios
      </h2>
      <p>{companyName ? `Tabla de ${companyName}` : 'Tabla de plataforma'}</p>
      <p>{isLoading ? 'Cargando tabla' : `Entradas tabla: ${entries.length}`}</p>
      <p>
        Filtros barra: {actionFilter || 'ninguno'}|{dateFrom || ''}|{dateTo || ''}
      </p>
      <p>Tamaño de página: {pageSize ?? 'sin tamaño'}</p>
      {emptySummaryPreset ? <p>Empty preset resumen</p> : null}
      <ul>
        {entries.map((e) => (
          <li key={e.id}>
            fila:{e.id}:{e.action ?? ''}:{e.entityType ?? ''}
          </li>
        ))}
      </ul>
      {onPageSizeChange ? (
        <button type="button" onClick={() => onPageSizeChange(20)}>
          Cambiar tamaño {companyName ? 'tenant' : 'platform'}
        </button>
      ) : null}
      {onActionFilterChange ? (
        <button type="button" onClick={() => onActionFilterChange('CREATE')}>
          Filtrar acción {companyName ? 'tenant' : 'platform'}
        </button>
      ) : null}
      {onDateFromChange ? (
        <button type="button" onClick={() => onDateFromChange('2026-01-01')}>
          Filtrar desde {companyName ? 'tenant' : 'platform'}
        </button>
      ) : null}
      {onDateToChange ? (
        <button type="button" onClick={() => onDateToChange('2026-01-31')}>
          Filtrar hasta {companyName ? 'tenant' : 'platform'}
        </button>
      ) : null}
      {onExportCsv ? (
        <button type="button" onClick={() => void onExportCsv()}>
          Descargar {companyName ? 'tenant' : 'platform'}
        </button>
      ) : null}
    </section>
  ),
}));

jest.mock('@/lib/platform-ui-copy', () => ({
  PLATFORM_UI_COPY: {
    audit: {
      title: 'Historial de cambios',
      subtitle: 'Qué cambió el equipo en empresas, accesos y la plataforma.',
      platformSectionTitle: 'Cambios de plataforma',
      platformSectionSubtitle: 'Cambios globales',
      tenantSectionTitle: 'Cambios por empresa',
      tenantSectionSubtitle: 'Cambios por empresa',
      loadError: 'No pudimos cargar el historial. Reintenta en unos minutos.',
      scopeLabel: 'Ámbito del historial',
      download: 'Descargar',
      downloadError: 'No pudimos descargar el archivo. Reintenta en unos minutos.',
      summaryFilterChip: 'Mostrando: {label} · lote del resumen',
      summaryFilterClear: 'Quitar filtro',
      criticalChanges: 'Cambios críticos',
      accesses: 'Accesos',
      accessAndSecurity: 'Acceso y seguridad',
      companiesWithChanges: 'Empresas con cambios',
      whoChanged: 'Quién cambió',
      emptySummaryPreset: 'Sin cambios en el lote del resumen con este filtro',
      emptySummaryPresetHint: 'Quita el filtro del resumen para ver todos los cambios.',
    },
    shared: {
      selectTenant: 'Seleccionar empresa',
    },
  },
}));

type AuditApiResponse = {
  data: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string | null;
    userId: string | null;
    actor: { displayName: string } | null;
    ipAddress: string | null;
    userAgent: string | null;
    requestId: string | null;
    oldValue: Record<string, unknown> | null;
    newValue: Record<string, unknown> | null;
    createdAt: string;
  }>;
  nextCursor?: string | null;
};

const tenantListMock = jest.fn();
const platformAuditListMock = jest.fn();
const auditListMock = jest.fn();
const platformAuditExportMock = jest.fn();
const auditExportMock = jest.fn();

jest.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {},
  tenantApi: {
    list: (...args: unknown[]) => tenantListMock(...args),
  },
  platformAuditApi: {
    list: (...args: unknown[]) => platformAuditListMock(...args),
    exportCsv: (...args: unknown[]) => platformAuditExportMock(...args),
  },
  auditApi: {
    list: (...args: unknown[]) => auditListMock(...args),
    exportCsv: (...args: unknown[]) => auditExportMock(...args),
  },
}));

function mockHappyPath() {
  tenantListMock.mockResolvedValue([
    {
      id: 'tenant-1',
      name: 'Empresa Uno',
      slug: 'empresa-uno',
      status: 'ACTIVE',
    },
  ]);
  platformAuditListMock.mockResolvedValue({ data: [], nextCursor: null });
  auditListMock.mockResolvedValue({ data: [], nextCursor: null });
}

describe('AuditLogsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    searchParamsMock = new URLSearchParams();
  });

  it('CA-AUD-06: un H1 y sin párrafos de subtítulo de sección bajo tabs', async () => {
    mockHappyPath();
    render(<AuditLogsPage />);

    await screen.findByText('Tabla de plataforma');

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Historial de cambios');
    expect(screen.queryByText('Cambios globales')).not.toBeInTheDocument();
    expect(screen.queryByText('Cambios por empresa')).toBeInTheDocument(); // tab label
  });

  it('CA-AUD-03: list rechazado muestra loadError en Alert', async () => {
    const { ApiError } = jest.requireMock('@/lib/api-client') as {
      ApiError: new (message: string) => Error;
    };
    tenantListMock.mockResolvedValue([]);
    platformAuditListMock.mockImplementation(({ limit }: { limit: number }) => {
      if (limit === 100) {
        return Promise.resolve({ data: [], nextCursor: null });
      }
      return Promise.reject(
        new ApiError('No pudimos cargar el historial. Reintenta en unos minutos.'),
      );
    });

    render(<AuditLogsPage />);

    expect(
      await screen.findByText('No pudimos cargar el historial. Reintenta en unos minutos.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('CA-AUD-05: exporta con Descargar y filename de producto', async () => {
    mockHappyPath();
    platformAuditExportMock.mockResolvedValue({
      blob: new Blob(['csv']),
      truncated: false,
      filename: undefined,
    });

    const createObjectURL = jest.fn(() => 'blob:mock');
    Object.defineProperty(URL, 'createObjectURL', { writable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { writable: true, value: jest.fn() });
    const clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    render(<AuditLogsPage />);
    await screen.findByText('Tabla de plataforma');

    fireEvent.click(screen.getByRole('button', { name: 'Descargar platform' }));

    await waitFor(() => {
      expect(platformAuditExportMock).toHaveBeenCalled();
    });
    expect(createObjectURL).toHaveBeenCalled();

    // El download attribute se setea en el anchor antes del click
    clickSpy.mockRestore();
  });

  it('CA-AUD-09 / CA-FR-01+02: preset filtra lote, muestra chip y Quitar filtro restaura', async () => {
    tenantListMock.mockResolvedValue([
      {
        id: 'tenant-1',
        name: 'Empresa Uno',
        slug: 'empresa-uno',
        status: 'ACTIVE',
      },
    ]);
    const tableRows = [
      {
        id: 'row-1',
        action: 'DELETE',
        entityType: 'User',
        entityId: 'u1',
        userId: 'u1',
        actor: { displayName: 'Ana' },
        ipAddress: null,
        userAgent: null,
        requestId: null,
        oldValue: null,
        newValue: null,
        createdAt: '2026-08-11T10:00:00.000Z',
      },
      {
        id: 'row-2',
        action: 'LOGIN',
        entityType: 'User',
        entityId: 'u2',
        userId: 'u2',
        actor: { displayName: 'Luis' },
        ipAddress: null,
        userAgent: null,
        requestId: null,
        oldValue: null,
        newValue: null,
        createdAt: '2026-08-11T11:00:00.000Z',
      },
    ];
    platformAuditListMock.mockImplementation(({ limit }: { limit: number }) => {
      if (limit === 100) {
        return Promise.resolve({ data: tableRows, nextCursor: null });
      }
      return Promise.resolve({ data: tableRows, nextCursor: null });
    });
    auditListMock.mockResolvedValue({ data: [], nextCursor: null });

    render(<AuditLogsPage />);
    await screen.findByText('Entradas tabla: 2');

    const title = screen.getByRole('heading', { name: 'Listado de cambios' });
    const focusSpy = jest.spyOn(title, 'focus');

    fireEvent.click(screen.getByRole('button', { name: 'Ver críticos platform' }));

    expect(summaryPresetMock).toHaveBeenCalledWith('critical');
    expect(focusSpy).toHaveBeenCalled();
    expect(
      await screen.findByText(/Mostrando: Cambios críticos · lote del resumen/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quitar filtro' })).toBeInTheDocument();
    expect(screen.getByText('Entradas tabla: 1')).toBeInTheDocument();
    expect(screen.getByText('fila:row-1:DELETE:User')).toBeInTheDocument();
    expect(screen.queryByText('fila:row-2:LOGIN:User')).not.toBeInTheDocument();

    // URL action no se contamina (CA-FR-08)
    expect(replaceMock).not.toHaveBeenCalledWith(
      expect.stringContaining('action='),
      expect.anything(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Quitar filtro' }));

    expect(await screen.findByText('Entradas tabla: 2')).toBeInTheDocument();
    expect(screen.queryByText(/Mostrando: Cambios críticos/)).not.toBeInTheDocument();
  });

  it('CA-FR-11+12+13: preset tenants usa lote del resumen (no página pager)', async () => {
    const recent = new Date().toISOString();
    const tenantInSummary = {
      id: 'summary-tenant-1',
      action: 'UPDATE',
      entityType: 'Tenant',
      entityId: 't-1',
      userId: 'u-1',
      actor: { displayName: 'Ana' },
      ipAddress: null,
      userAgent: null,
      requestId: null,
      oldValue: { status: 'ACTIVE' },
      newValue: { status: 'SUSPENDED' },
      createdAt: recent,
    };
    const loginOnPage = {
      id: 'page-login-1',
      action: 'LOGIN',
      entityType: 'User',
      entityId: 'u-2',
      userId: 'u-2',
      actor: { displayName: 'Luis' },
      ipAddress: null,
      userAgent: null,
      requestId: null,
      oldValue: null,
      newValue: null,
      createdAt: recent,
    };

    tenantListMock.mockResolvedValue([
      {
        id: 'tenant-1',
        name: 'Empresa Uno',
        slug: 'empresa-uno',
        status: 'ACTIVE',
      },
    ]);
    platformAuditListMock.mockImplementation(({ limit }: { limit: number }) => {
      if (limit === 100) {
        return Promise.resolve({
          data: [tenantInSummary, loginOnPage],
          nextCursor: null,
        });
      }
      // Página del pager: solo LOGIN (sin Tenant) — root cause v1.1
      return Promise.resolve({ data: [loginOnPage], nextCursor: null });
    });
    auditListMock.mockResolvedValue({ data: [], nextCursor: null });

    render(<AuditLogsPage />);
    await screen.findByText('Entradas tabla: 1');
    expect(screen.getByText('fila:page-login-1:LOGIN:User')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ver empresas platform' }));

    expect(summaryPresetMock).toHaveBeenCalledWith('tenants');
    expect(
      await screen.findByText(/Mostrando: Empresas con cambios · lote del resumen/),
    ).toBeInTheDocument();
    expect(screen.getByText(/lote del resumen/)).toBeInTheDocument();
    expect(screen.queryByText('Empty preset resumen')).not.toBeInTheDocument();
    expect(screen.getByText('fila:summary-tenant-1:UPDATE:Tenant')).toBeInTheDocument();
    expect(screen.queryByText('fila:page-login-1:LOGIN:User')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Quitar filtro' }));

    expect(await screen.findByText('Entradas tabla: 1')).toBeInTheDocument();
    expect(screen.getByText('fila:page-login-1:LOGIN:User')).toBeInTheDocument();
    expect(screen.queryByText('fila:summary-tenant-1:UPDATE:Tenant')).not.toBeInTheDocument();
    expect(screen.queryByText(/lote del resumen/)).not.toBeInTheDocument();
  });

  it('CA-FR-06: cambiar action del chrome limpia el preset', async () => {
    tenantListMock.mockResolvedValue([
      {
        id: 'tenant-1',
        name: 'Empresa Uno',
        slug: 'empresa-uno',
        status: 'ACTIVE',
      },
    ]);
    const tableRows = [
      {
        id: 'row-1',
        action: 'DELETE',
        entityType: 'User',
        entityId: 'u1',
        userId: 'u1',
        actor: { displayName: 'Ana' },
        ipAddress: null,
        userAgent: null,
        requestId: null,
        oldValue: null,
        newValue: null,
        createdAt: '2026-08-11T10:00:00.000Z',
      },
    ];
    platformAuditListMock.mockResolvedValue({ data: tableRows, nextCursor: null });
    auditListMock.mockResolvedValue({ data: [], nextCursor: null });

    render(<AuditLogsPage />);
    await screen.findByText('Entradas tabla: 1');

    fireEvent.click(screen.getByRole('button', { name: 'Ver críticos platform' }));
    expect(await screen.findByText(/Mostrando: Cambios críticos/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Filtrar acción platform' }));

    await waitFor(() => {
      expect(screen.queryByText(/Mostrando: Cambios críticos/)).not.toBeInTheDocument();
    });
    expect(screen.getByText('Preset activo: ninguno')).toBeInTheDocument();
  });

  it('CA-FR-08: export no incluye el preset de resumen', async () => {
    mockHappyPath();
    platformAuditExportMock.mockResolvedValue({
      blob: new Blob(['csv']),
      truncated: false,
      filename: undefined,
    });

    const createObjectURL = jest.fn(() => 'blob:mock');
    Object.defineProperty(URL, 'createObjectURL', { writable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { writable: true, value: jest.fn() });
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    render(<AuditLogsPage />);
    await screen.findByText('Tabla de plataforma');

    fireEvent.click(screen.getByRole('button', { name: 'Ver críticos platform' }));
    fireEvent.click(screen.getByRole('button', { name: 'Descargar platform' }));

    await waitFor(() => {
      expect(platformAuditExportMock).toHaveBeenCalledWith({});
    });
  });

  it('limpia resumen previo al cambiar de empresa', async () => {
    const tenantTwoSummary = createDeferred<AuditApiResponse>();

    tenantListMock.mockResolvedValue([
      {
        id: 'tenant-1',
        name: 'Empresa Uno',
        slug: 'empresa-uno',
        status: 'ACTIVE',
      },
      {
        id: 'tenant-2',
        name: 'Empresa Dos',
        slug: 'empresa-dos',
        status: 'ACTIVE',
      },
    ]);

    platformAuditListMock.mockResolvedValue({
      data: [],
      nextCursor: null,
    });

    auditListMock.mockImplementation(
      ({ limit }: { limit: number }, tenantSlug: string): Promise<AuditApiResponse> => {
        if (tenantSlug === 'empresa-uno') {
          return Promise.resolve({
            data:
              limit === 100
                ? [
                    {
                      id: 'summary-1',
                      action: 'LOGIN',
                      entityType: 'User',
                      entityId: 'user-1',
                      userId: 'user-1',
                      actor: { displayName: 'Ana' },
                      ipAddress: null,
                      userAgent: null,
                      requestId: null,
                      oldValue: null,
                      newValue: null,
                      createdAt: '2026-06-26T10:00:00.000Z',
                    },
                    {
                      id: 'summary-2',
                      action: 'UPDATE',
                      entityType: 'Tenant',
                      entityId: 'tenant-1',
                      userId: 'user-2',
                      actor: { displayName: 'Luis' },
                      ipAddress: null,
                      userAgent: null,
                      requestId: null,
                      oldValue: null,
                      newValue: null,
                      createdAt: '2026-06-26T11:00:00.000Z',
                    },
                  ]
                : [],
            nextCursor: null,
          });
        }

        if (tenantSlug === 'empresa-dos' && limit === 100) {
          return tenantTwoSummary.promise;
        }

        return Promise.resolve({
          data: [],
          nextCursor: null,
        });
      },
    );

    render(<AuditLogsPage />);

    fireEvent.click(screen.getByRole('tab', { name: 'Cambios por empresa' }));

    expect(await screen.findByText('Resumen de Empresa Uno')).toBeInTheDocument();
    expect(await screen.findByText('Entradas resumen: 2')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Seleccionar empresa' }), {
      target: { value: 'empresa-dos' },
    });

    expect(screen.getByText('Resumen de Empresa Dos')).toBeInTheDocument();
    expect(screen.getByText('Cargando resumen')).toBeInTheDocument();

    tenantTwoSummary.resolve({
      data: [
        {
          id: 'summary-3',
          action: 'DELETE',
          entityType: 'Tenant',
          entityId: 'tenant-2',
          userId: 'user-3',
          actor: { displayName: 'Sara' },
          ipAddress: null,
          userAgent: null,
          requestId: null,
          oldValue: null,
          newValue: null,
          createdAt: '2026-06-26T12:00:00.000Z',
        },
      ],
      nextCursor: null,
    });

    await waitFor(() => {
      expect(screen.getByText('Entradas resumen: 1')).toBeInTheDocument();
    });
  });

  it('envía action/fromDate/toDate al listar y exporta vía endpoint server-side', async () => {
    mockHappyPath();
    platformAuditExportMock.mockResolvedValue({
      blob: new Blob(['csv']),
      truncated: true,
      filename: 'historial-plataforma-2026-07-20.csv',
    });

    const createObjectURL = jest.fn(() => 'blob:mock');
    Object.defineProperty(URL, 'createObjectURL', { writable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { writable: true, value: jest.fn() });
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    render(<AuditLogsPage />);

    await screen.findByText('Tabla de plataforma');

    fireEvent.click(screen.getByRole('button', { name: 'Filtrar acción platform' }));

    await waitFor(() => {
      expect(platformAuditListMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CREATE', limit: 10 }),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Filtrar desde platform' }));
    fireEvent.click(screen.getByRole('button', { name: 'Filtrar hasta platform' }));

    await waitFor(() => {
      expect(platformAuditListMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          fromDate: expect.stringMatching(/^2026-01-01T/),
          toDate: expect.stringMatching(/^2026-01-31T/),
        }),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Descargar platform' }));

    await waitFor(() => {
      expect(platformAuditExportMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          fromDate: expect.stringMatching(/^2026-01-01T/),
          toDate: expect.stringMatching(/^2026-01-31T/),
        }),
      );
    });
    expect(createObjectURL).toHaveBeenCalled();
  });

  it('pide 10 cambios por defecto y recarga al elegir 20', async () => {
    mockHappyPath();

    render(<AuditLogsPage />);

    await screen.findByText('Tabla de plataforma');

    await waitFor(() => {
      expect(platformAuditListMock).toHaveBeenCalledWith(expect.objectContaining({ limit: 10 }));
    });
    expect(screen.getAllByText('Tamaño de página: 10').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar tamaño platform' }));

    await waitFor(() => {
      expect(platformAuditListMock).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }));
    });
    expect(screen.getAllByText('Tamaño de página: 20').length).toBeGreaterThan(0);
  });

  it('cambia entre plataforma y empresa sin mostrar las dos tablas a la vez', async () => {
    mockHappyPath();

    render(<AuditLogsPage />);

    expect(await screen.findByTestId('platform-table')).toBeInTheDocument();
    expect(screen.queryByTestId('tenant-table')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Cambios por empresa' }));

    expect(await screen.findByTestId('tenant-table')).toBeInTheDocument();
    expect(screen.queryByTestId('platform-table')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Cambios de plataforma' }));

    expect(await screen.findByTestId('platform-table')).toBeInTheDocument();
    expect(screen.queryByTestId('tenant-table')).not.toBeInTheDocument();
  });
});
