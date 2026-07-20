import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TenantsPage from './page';

const tenantsTableSpy = jest.fn();

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children?: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/tenants',
  useRouter: () => ({
    replace: jest.fn(),
  }),
}));

jest.mock('@iwana/ui', () => ({
  Button: ({
    children,
    asChild,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    children?: React.ReactNode;
    asChild?: boolean;
  }) => <button {...props}>{children}</button>,
}));

jest.mock('@/components/layout/PageHeader', () => ({
  PageHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <header>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
  ),
}));

jest.mock('@/components/shared/ConfirmDialog', () => ({
  ConfirmDialog: () => null,
}));

jest.mock('@/components/dashboard/TenantsTable', () => ({
  TenantsTable: (props: {
    tenants: Array<{ id: string; status: string }>;
    onRetryProvisioning?: (id: string) => void;
  }) => {
    tenantsTableSpy(props);

    return (
      <section>
        <p>Estado actual: {props.tenants[0]?.status ?? 'sin datos'}</p>
        <button type="button" onClick={() => props.onRetryProvisioning?.('tenant-1')}>
          Reintentar tenant-1
        </button>
      </section>
    );
  },
}));

jest.mock('@/lib/api-client', () => ({
  tenantApi: {
    list: jest.fn(),
    retryProvisioning: jest.fn(),
    waitForProvisioning: jest.fn(),
  },
}));

describe('TenantsPage', () => {
  const { tenantApi } = jest.requireMock('@/lib/api-client') as {
    tenantApi: {
      list: jest.Mock;
      retryProvisioning: jest.Mock;
      waitForProvisioning: jest.Mock;
    };
  };

  const failedTenant = {
    id: 'tenant-1',
    name: 'Empresa Demo',
    slug: 'empresa-demo',
    schemaName: 'tenant_empresa_demo',
    status: 'PROVISIONING_FAILED',
    contactEmail: 'ops@empresa.demo',
    maxSubscribers: null,
    settings: {},
    createdAt: '2026-06-27T12:00:00.000Z',
    updatedAt: '2026-06-27T12:00:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    tenantsTableSpy.mockClear();
    tenantApi.list.mockResolvedValue([failedTenant]);
  });

  it('espera el resultado real del retry y muestra error si el provisioning vuelve a fallar', async () => {
    tenantApi.retryProvisioning.mockResolvedValue({
      ...failedTenant,
      status: 'PROVISIONING',
    });
    tenantApi.waitForProvisioning.mockResolvedValue({
      ...failedTenant,
      status: 'PROVISIONING_FAILED',
    });

    render(<TenantsPage />);

    expect(await screen.findByText('Empresas')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar tenant-1' }));

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
    await waitFor(() => {
      expect(
        screen.getByText(
          'La configuración volvió a fallar. Revisa el estado y reintenta en unos minutos.',
        ),
      ).toBeInTheDocument();
    });
  });
});
