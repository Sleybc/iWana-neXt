import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import TenantsPage from './page';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...props
  }: {
    children?: React.ReactNode;
    href: string;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(() => new URLSearchParams()),
  usePathname: () => '/tenants',
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

jest.mock('@/components/shared/ConfirmDialog', () => ({
  ConfirmDialog: ({
    open,
    title,
    confirmLabel,
    onConfirm,
  }: {
    open?: boolean;
    title?: string;
    confirmLabel?: string;
    onConfirm?: () => void;
  }) =>
    open ? (
      <div>
        <p>{title}</p>
        <button type="button" onClick={() => onConfirm?.()}>
          {confirmLabel}
        </button>
      </div>
    ) : null,
}));

jest.mock('@/lib/api-client', () => ({
  tenantApi: {
    list: jest.fn(),
    suspend: jest.fn(),
    activate: jest.fn(),
    retryProvisioning: jest.fn(),
    waitForProvisioning: jest.fn(),
  },
}));

function makeTenant(
  overrides: Partial<{
    id: string;
    name: string;
    slug: string;
    status: string;
    contactEmail: string;
  }> = {},
) {
  return {
    id: overrides.id ?? 'tenant-1',
    name: overrides.name ?? 'Empresa Demo',
    slug: overrides.slug ?? 'empresa-demo',
    schemaName: 'tenant_empresa_demo',
    status: overrides.status ?? 'ACTIVE',
    contactEmail: overrides.contactEmail ?? 'ops@empresa.demo',
    maxSubscribers: null,
    settings: {},
    createdAt: '2026-06-27T12:00:00.000Z',
    updatedAt: '2026-06-27T12:00:00.000Z',
  };
}

const forbiddenStatusCopy = [
  /\bConfigurando\b/,
  /Configuración fallida/,
  /En puesta en marcha/,
  /\bActivo\b/,
];

describe('TenantsPage', () => {
  const { tenantApi } = jest.requireMock('@/lib/api-client') as {
    tenantApi: {
      list: jest.Mock;
      suspend: jest.Mock;
      activate: jest.Mock;
      retryProvisioning: jest.Mock;
      waitForProvisioning: jest.Mock;
    };
  };
  const { useSearchParams } = jest.requireMock('next/navigation') as {
    useSearchParams: jest.Mock;
  };

  const failedTenant = makeTenant({
    id: 'tenant-1',
    name: 'Empresa Demo',
    status: 'PROVISIONING_FAILED',
  });

  const mixedTenants = [
    makeTenant({ id: 't-active', name: 'Fibernet Colombia', status: 'ACTIVE' }),
    makeTenant({ id: 't-prov', name: 'Alta Andina', status: 'PROVISIONING' }),
    makeTenant({ id: 't-fail', name: 'Empresa Demo', status: 'PROVISIONING_FAILED' }),
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    useSearchParams.mockReturnValue(new URLSearchParams());
    tenantApi.list.mockResolvedValue(mixedTenants);
    tenantApi.suspend.mockResolvedValue(undefined);
    tenantApi.activate.mockResolvedValue(undefined);
  });

  it('CA-EMP-01: DOM sin copy legado; sí En configuración / Con error / Activas o Activa', async () => {
    render(<TenantsPage />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Empresas' })).toBeInTheDocument();
    expect(await screen.findByText('Fibernet Colombia')).toBeInTheDocument();

    const text = document.body.textContent ?? '';
    for (const pattern of forbiddenStatusCopy) {
      expect(text).not.toMatch(pattern);
    }
    expect(text).toMatch(/En configuración/);
    expect(text).toMatch(/Con error/);
    expect(text).toMatch(/Activas|Activa/);
  });

  it('CA-EMP-02: status=PROVISIONING muestra En configuración en filtro y badge', async () => {
    useSearchParams.mockReturnValue(new URLSearchParams('status=PROVISIONING'));
    tenantApi.list.mockResolvedValue([
      makeTenant({ id: 't-prov', name: 'Alta Andina', status: 'PROVISIONING' }),
    ]);

    render(<TenantsPage />);

    expect(await screen.findByText('Alta Andina')).toBeInTheDocument();
    expect(screen.getByLabelText('Filtrar por estado')).toHaveTextContent('En configuración');
    expect(screen.getAllByText('En configuración').length).toBeGreaterThan(1);
  });

  it('CA-EMP-03: list rechazado muestra directoryError', async () => {
    tenantApi.list.mockRejectedValue(new Error('boom'));

    render(<TenantsPage />);

    expect(await screen.findByText(PLATFORM_UI_COPY.dashboard.directoryError)).toBeInTheDocument();
    expect(screen.queryByText('No fue posible cargar empresas.')).not.toBeInTheDocument();
  });

  it('CA-EMP-04: parque 0 muestra CTA de primera empresa; filtro vacío no', async () => {
    tenantApi.list.mockResolvedValue([]);

    const { unmount } = render(<TenantsPage />);

    expect(await screen.findByRole('link', { name: 'Registrar primera empresa' })).toHaveAttribute(
      'href',
      '/tenants/new',
    );
    unmount();

    useSearchParams.mockReturnValue(new URLSearchParams('status=ACTIVE'));
    tenantApi.list.mockResolvedValue([]);
    render(<TenantsPage />);

    expect(await screen.findByText('Sin empresas con estos filtros')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Registrar primera empresa' }),
    ).not.toBeInTheDocument();
    expect(tenantApi.list).toHaveBeenCalledWith(expect.objectContaining({ status: 'ACTIVE' }));
  });

  it('CA-EMP-05: placeholder sin identificador, tenant ni slug', async () => {
    render(<TenantsPage />);

    const search = await screen.findByRole('searchbox', { name: 'Buscar empresa' });
    const placeholder = search.getAttribute('placeholder') ?? '';
    expect(placeholder).toBe(PLATFORM_UI_COPY.tenants.searchPlaceholder);
    expect(placeholder.toLowerCase()).not.toMatch(/identificador|tenant|slug/);
  });

  it('CA-EMP-06: un solo H1, subtítulo corto, eyebrow Directorio; sin H2 del hero', async () => {
    render(<TenantsPage />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Empresas' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
    expect(
      screen.getByText('Estado, contacto y última actualización de cada empresa.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Directorio', { selector: '.portal-eyebrow' })).toBeInTheDocument();
    expect(screen.queryByText(/Prioriza altas pendientes, revisa alertas/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Volver al centro de control' }),
    ).not.toBeInTheDocument();
    const directory = screen
      .getByRole('heading', { name: PLATFORM_UI_COPY.tenants.tableTitle })
      .closest('div');
    expect(directory).not.toBeNull();
    expect(
      within(directory as HTMLElement).getByRole('link', {
        name: PLATFORM_UI_COPY.tenants.newCompany,
      }),
    ).toHaveAttribute('href', '/tenants/new');
    expect(screen.getAllByRole('link', { name: PLATFORM_UI_COPY.tenants.newCompany })).toHaveLength(
      1,
    );
  });

  it('CA-EMP-07: éxito breve al suspender y error canónico si falla la acción', async () => {
    tenantApi.list.mockResolvedValue([
      makeTenant({ id: 't-active', name: 'Fibernet Colombia', status: 'ACTIVE' }),
    ]);

    const { unmount } = render(<TenantsPage />);

    expect(await screen.findByText('Fibernet Colombia')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú de acciones' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Suspender' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sí, suspender' }));

    expect(await screen.findByText(PLATFORM_UI_COPY.tenants.suspendSuccess)).toBeInTheDocument();
    unmount();

    tenantApi.suspend.mockRejectedValue(new Error('fail'));
    render(<TenantsPage />);

    expect(await screen.findByText('Fibernet Colombia')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú de acciones' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Suspender' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sí, suspender' }));

    expect(await screen.findByText(PLATFORM_UI_COPY.tenants.actionError)).toBeInTheDocument();
  });

  it('CA-EMP-08: chip Activas con count>0 enlaza a status=ACTIVE', async () => {
    render(<TenantsPage />);

    const chip = await screen.findByRole('link', {
      name: PLATFORM_UI_COPY.dashboard.viewActiveCompanies,
    });
    expect(chip).toHaveAttribute('href', expect.stringContaining('status=ACTIVE'));
  });

  it('CA-EMP-09: th con aria-sort; celdas de estado y fecha sin onClick', async () => {
    render(<TenantsPage />);

    expect(await screen.findByText('Fibernet Colombia')).toBeInTheDocument();

    const headers = screen.getAllByRole('columnheader');
    const sortable = headers.filter((header) => header.hasAttribute('aria-sort'));
    expect(sortable.length).toBeGreaterThanOrEqual(4);
    expect(sortable.filter((header) => header.getAttribute('aria-sort') !== 'none')).toHaveLength(
      1,
    );

    const row = screen.getByText('Fibernet Colombia').closest('tr');
    expect(row).not.toBeNull();
    const cells = within(row as HTMLElement).getAllByRole('cell');
    const statusCell = cells[1];
    const updatedCell = cells[2];
    const createdCell = cells[3];
    expect(statusCell?.onclick).toBeNull();
    expect(updatedCell?.onclick).toBeNull();
    expect(createdCell?.onclick).toBeNull();
  });

  it('CA-EMP-10: list pide status o search al servidor', async () => {
    useSearchParams.mockReturnValue(new URLSearchParams('status=ACTIVE'));
    tenantApi.list.mockImplementation(async (params?: { status?: string }) => {
      if (params?.status === 'ACTIVE') {
        return [makeTenant({ id: 't-active', name: 'Fibernet Colombia', status: 'ACTIVE' })];
      }
      return mixedTenants;
    });

    render(<TenantsPage />);

    await waitFor(() => {
      expect(tenantApi.list).toHaveBeenCalledWith(expect.objectContaining({ status: 'ACTIVE' }));
    });
    expect(tenantApi.list).toHaveBeenCalledWith(
      expect.objectContaining({ limit: expect.any(Number), offset: 0 }),
    );
    const parkCall = tenantApi.list.mock.calls.find((call) => {
      const params = call[0] as { status?: string; search?: string } | undefined;
      return params != null && params.status === undefined && params.search === undefined;
    });
    expect(parkCall).toBeDefined();
  });

  it('KPI del directorio usa el parque, no el lote filtrado', async () => {
    useSearchParams.mockReturnValue(new URLSearchParams('status=PROVISIONING'));
    tenantApi.list.mockImplementation(async (params?: { status?: string }) => {
      if (params?.status === 'PROVISIONING') {
        return [makeTenant({ id: 't-prov', name: 'Alta Andina', status: 'PROVISIONING' })];
      }
      return mixedTenants;
    });

    render(<TenantsPage />);

    expect(await screen.findByText('Alta Andina')).toBeInTheDocument();
    expect(screen.queryByText('Fibernet Colombia')).not.toBeInTheDocument();

    const activeChip = screen.getByRole('link', {
      name: PLATFORM_UI_COPY.dashboard.viewActiveCompanies,
    });
    expect(activeChip).toHaveTextContent('1');
    expect(activeChip).toHaveAttribute('href', expect.stringContaining('status=ACTIVE'));
  });

  it('CA-EMP-10: list pide search cuando la URL trae search', async () => {
    useSearchParams.mockReturnValue(new URLSearchParams('search=Fibernet'));
    tenantApi.list.mockResolvedValue([
      makeTenant({ id: 't-active', name: 'Fibernet Colombia', status: 'ACTIVE' }),
    ]);

    render(<TenantsPage />);

    await waitFor(() => {
      expect(tenantApi.list).toHaveBeenCalledWith(expect.objectContaining({ search: 'Fibernet' }));
    });
  });

  it('CA-PS-05: status=ACTIVE de la URL llega al filtro', async () => {
    useSearchParams.mockReturnValue(new URLSearchParams('status=ACTIVE'));
    tenantApi.list.mockResolvedValue([
      makeTenant({ id: 't-active', name: 'Fibernet Colombia', status: 'ACTIVE' }),
    ]);

    render(<TenantsPage />);

    expect(await screen.findByLabelText('Filtrar por estado')).toHaveTextContent('Activas');
  });

  it('CA-PS-05: status inválido de la URL cae a TODAS', async () => {
    useSearchParams.mockReturnValue(new URLSearchParams('status=NO_EXISTE'));

    render(<TenantsPage />);

    expect(await screen.findByLabelText('Filtrar por estado')).toHaveTextContent(
      'Todos los estados',
    );
    await waitFor(() => {
      expect(tenantApi.list).toHaveBeenCalled();
    });
    const firstCall = tenantApi.list.mock.calls[0]?.[0] as { status?: string } | undefined;
    expect(firstCall).toBeDefined();
    expect(firstCall).not.toHaveProperty('status');
  });

  it('espera el resultado real del retry y muestra error si el provisioning vuelve a fallar', async () => {
    tenantApi.list.mockResolvedValue([failedTenant]);
    tenantApi.retryProvisioning.mockResolvedValue({
      ...failedTenant,
      status: 'PROVISIONING',
    });
    tenantApi.waitForProvisioning.mockResolvedValue({
      ...failedTenant,
      status: 'PROVISIONING_FAILED',
    });

    render(<TenantsPage />);

    expect(await screen.findByText('Empresa Demo')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú de acciones' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reintentar configuración' }));

    await waitFor(() => {
      expect(tenantApi.retryProvisioning).toHaveBeenCalledWith('tenant-1');
    });
    await waitFor(() => {
      expect(tenantApi.waitForProvisioning).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          maxAttempts: 10,
          onTick: expect.any(Function),
        }),
      );
    });
    expect(await screen.findByText(PLATFORM_UI_COPY.tenants.actionError)).toBeInTheDocument();
  });
});
