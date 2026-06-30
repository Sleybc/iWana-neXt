import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AuditLogsPage from './page';

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

jest.mock('@/components/audit/AuditSummary', () => ({
  AuditSummary: ({
    mode,
    tenantName,
    entries,
    isLoading,
    onFilterApply,
  }: {
    mode: 'platform' | 'tenant';
    tenantName?: string;
    entries: Array<unknown>;
    isLoading: boolean;
    onFilterApply: (filter: { actionSet?: string[]; severity?: 'critical' }) => void;
  }) => (
    <section data-testid={`${mode}-summary`}>
      <p>{mode === 'tenant' ? `Resumen de ${tenantName}` : 'Resumen de plataforma'}</p>
      <p>{isLoading ? 'Cargando resumen' : `Entradas resumen: ${entries.length}`}</p>
      <button type="button" onClick={() => onFilterApply({ actionSet: ['LOGIN'] })}>
        Aplicar filtro {mode}
      </button>
    </section>
  ),
}));

jest.mock('@/components/audit/AuditLogsTable', () => ({
  AuditLogsTable: ({
    companyName,
    externalFilters,
    entries,
    isLoading,
  }: {
    companyName?: string;
    externalFilters?: { actionSet?: string[]; severity?: string };
    entries: Array<unknown>;
    isLoading: boolean;
  }) => (
    <section data-testid={companyName ? 'tenant-table' : 'platform-table'}>
      <p>{companyName ? `Tabla de ${companyName}` : 'Tabla de plataforma'}</p>
      <p>{isLoading ? 'Cargando tabla' : `Entradas tabla: ${entries.length}`}</p>
      <p>
        Filtros externos:{' '}
        {externalFilters?.actionSet?.join(',') ?? externalFilters?.severity ?? 'ninguno'}
      </p>
    </section>
  ),
}));

jest.mock('@/lib/platform-ui-copy', () => ({
  PLATFORM_UI_COPY: {
    audit: {
      title: 'Auditoria',
      subtitle: 'Historial de cambios y operaciones de plataforma',
      platformSectionTitle: 'Auditoria de plataforma',
      platformSectionSubtitle: 'Cambios globales',
      tenantSectionTitle: 'Auditoria por empresa',
      tenantSectionSubtitle: 'Cambios por empresa',
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

jest.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {},
  tenantApi: {
    list: (...args: unknown[]) => tenantListMock(...args),
  },
  platformAuditApi: {
    list: (...args: unknown[]) => platformAuditListMock(...args),
  },
  auditApi: {
    list: (...args: unknown[]) => auditListMock(...args),
  },
}));

describe('AuditLogsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('limpia filtros y resumen previo al cambiar de empresa', async () => {
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
              limit === 200
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

        if (tenantSlug === 'empresa-dos' && limit === 200) {
          return tenantTwoSummary.promise;
        }

        return Promise.resolve({
          data: [],
          nextCursor: null,
        });
      },
    );

    render(<AuditLogsPage />);

    expect(await screen.findByText('Resumen de Empresa Uno')).toBeInTheDocument();
    expect(await screen.findByText('Entradas resumen: 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtro tenant' }));

    expect(await screen.findByText('Filtro activo desde el resumen.')).toBeInTheDocument();
    expect(screen.getByText('Filtros externos: LOGIN')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Seleccionar empresa' }), {
      target: { value: 'empresa-dos' },
    });

    expect(screen.queryByText('Filtro activo desde el resumen.')).not.toBeInTheDocument();
    expect(screen.getByText('Resumen de Empresa Dos')).toBeInTheDocument();
    expect(screen.getByText('Cargando resumen')).toBeInTheDocument();
    expect(within(screen.getByTestId('tenant-table')).getByText('Filtros externos: ninguno')).toBeInTheDocument();

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
});
