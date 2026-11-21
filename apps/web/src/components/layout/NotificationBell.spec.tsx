import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NotificationBell } from './NotificationBell';
import { TenantStatus } from '@iwana/shared';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';
import { makeTenantStatusSummary } from '@/test-utils/tenant-status-summary';

function attention(overrides: {
  id: string;
  name: string;
  status: TenantStatus;
  updatedAt?: string;
}) {
  return { updatedAt: '2026-06-27T12:00:00.000Z', ...overrides };
}

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

jest.mock('@/lib/api-client', () => ({
  tenantApi: {
    list: jest.fn(),
    summary: jest.fn(),
  },
}));

describe('NotificationBell', () => {
  const { tenantApi } = jest.requireMock('@/lib/api-client') as {
    tenantApi: { list: jest.Mock; summary: jest.Mock };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function withAttention(items: ReturnType<typeof attention>[]) {
    tenantApi.summary.mockResolvedValue(makeTenantStatusSummary({}, { attention: items }));
  }

  function openBell() {
    fireEvent.click(
      screen.getByRole('button', { name: PLATFORM_UI_COPY.tenants.notificationsTitle }),
    );
  }

  it('usa el vocabulario canónico de estado y no expone el identificador', async () => {
    withAttention([
      attention({ id: 't-fail', name: 'Empresa Demo', status: TenantStatus.PROVISIONING_FAILED }),
    ]);

    render(<NotificationBell />);
    openBell();

    expect(await screen.findByText('Empresa Demo')).toBeInTheDocument();
    expect(screen.getByText('Con error')).toBeInTheDocument();
    expect(screen.queryByText(/PROVISIONING_FAILED/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Configuración fallida/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Configuración en curso/)).not.toBeInTheDocument();
    expect(screen.getByText(PLATFORM_UI_COPY.tenants.notificationsTitle)).toBeInTheDocument();
  });

  it('E-2: pinta attention del resumen y no pide la lista de empresas', async () => {
    withAttention([]);

    render(<NotificationBell />);
    openBell();

    expect(
      await screen.findByText(PLATFORM_UI_COPY.tenants.notificationsEmpty),
    ).toBeInTheDocument();
    expect(tenantApi.summary).toHaveBeenCalledTimes(1);
    expect(tenantApi.list).not.toHaveBeenCalled();
  });

  it('respeta el orden del servidor aunque contradiga severidad visual y fecha', async () => {
    // Orden adverso a cualquier heurística del cliente: un aviso «warning» antiguo
    // antes que dos «error», y el error más antiguo antes que el más reciente.
    withAttention([
      attention({
        id: 't-susp-old',
        name: 'Suspendida antigua',
        status: TenantStatus.SUSPENDED,
        updatedAt: '2026-01-01T12:00:00.000Z',
      }),
      attention({
        id: 't-fail-old',
        name: 'Error antiguo',
        status: TenantStatus.PROVISIONING_FAILED,
        updatedAt: '2026-02-01T12:00:00.000Z',
      }),
      attention({
        id: 't-del-new',
        name: 'Baja reciente',
        status: TenantStatus.MARKED_FOR_DELETION,
        updatedAt: '2026-11-20T12:00:00.000Z',
      }),
    ]);

    render(<NotificationBell />);
    openBell();

    expect(await screen.findByText('Suspendida antigua')).toBeInTheDocument();
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/tenants/t-susp-old/settings',
      '/tenants/t-fail-old/settings',
      '/tenants/t-del-new/settings',
    ]);
  });

  it('L-8: el error no cuenta como aviso y «Reintentar» vuelve a pedir el resumen', async () => {
    tenantApi.summary.mockRejectedValueOnce(new Error('boom'));
    withAttention([
      attention({ id: 't-fail', name: 'Empresa Demo', status: TenantStatus.PROVISIONING_FAILED }),
    ]);

    render(<NotificationBell />);
    openBell();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      PLATFORM_UI_COPY.tenants.notificationsError,
    );
    expect(screen.queryAllByRole('link')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: PLATFORM_UI_COPY.dashboard.retry }));

    expect(await screen.findByText('Empresa Demo')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(tenantApi.summary).toHaveBeenCalledTimes(2);
  });

  it('cierra con Escape y restaura el foco al disparador', async () => {
    withAttention([
      attention({ id: 't-fail', name: 'Empresa Demo', status: TenantStatus.PROVISIONING_FAILED }),
    ]);

    render(<NotificationBell />);
    const trigger = screen.getByRole('button', {
      name: PLATFORM_UI_COPY.tenants.notificationsTitle,
    });
    fireEvent.click(trigger);
    expect(await screen.findByText('Empresa Demo')).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(trigger).toHaveFocus();
    });
  });
});
