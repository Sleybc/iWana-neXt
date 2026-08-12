import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NotificationBell } from './NotificationBell';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

function tenant(overrides: {
  id: string;
  name: string;
  status: string;
  slug?: string;
  updatedAt?: string;
}) {
  return {
    slug: 'empresa-demo',
    contactEmail: 'ops@empresa.demo',
    createdAt: '2026-06-27T12:00:00.000Z',
    updatedAt: '2026-06-27T12:00:00.000Z',
    ...overrides,
  };
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
  },
}));

describe('NotificationBell', () => {
  const { tenantApi } = jest.requireMock('@/lib/api-client') as {
    tenantApi: { list: jest.Mock };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('usa el vocabulario canónico de estado y no expone slug', async () => {
    tenantApi.list.mockResolvedValue([
      {
        id: 't-fail',
        name: 'Empresa Demo',
        slug: 'empresa-demo',
        status: 'PROVISIONING_FAILED',
        contactEmail: 'ops@empresa.demo',
        createdAt: '2026-06-27T12:00:00.000Z',
        updatedAt: '2026-06-27T12:00:00.000Z',
      },
    ]);

    render(<NotificationBell />);
    fireEvent.click(
      screen.getByRole('button', { name: PLATFORM_UI_COPY.tenants.notificationsTitle }),
    );

    expect(await screen.findByText('Empresa Demo')).toBeInTheDocument();
    expect(screen.getByText('Con error')).toBeInTheDocument();
    expect(screen.queryByText(/empresa-demo/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Configuración fallida/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Configuración en curso/)).not.toBeInTheDocument();
    expect(screen.getByText(PLATFORM_UI_COPY.tenants.notificationsTitle)).toBeInTheDocument();
  });

  it('muestra el error canónico si el listado falla', async () => {
    tenantApi.list.mockRejectedValue(new Error('boom'));

    render(<NotificationBell />);
    fireEvent.click(
      screen.getByRole('button', { name: PLATFORM_UI_COPY.tenants.notificationsTitle }),
    );

    expect(
      await screen.findByText(PLATFORM_UI_COPY.tenants.notificationsError),
    ).toBeInTheDocument();
    expect(screen.queryByText(/API de plataforma/)).not.toBeInTheDocument();
  });

  it('no lista empresas activas ni inactivas como avisos', async () => {
    tenantApi.list.mockResolvedValue([
      tenant({ id: 't-ok', name: 'iWana', status: 'ACTIVE' }),
      tenant({ id: 't-idle', name: 'Parque inactivo', status: 'INACTIVE' }),
    ]);

    render(<NotificationBell />);
    fireEvent.click(
      screen.getByRole('button', { name: PLATFORM_UI_COPY.tenants.notificationsTitle }),
    );

    await waitFor(() => {
      expect(tenantApi.list).toHaveBeenCalled();
      expect(screen.queryByText('iWana')).not.toBeInTheDocument();
      expect(screen.queryByText('Parque inactivo')).not.toBeInTheDocument();
    });
    expect(screen.getByText(PLATFORM_UI_COPY.tenants.notificationsEmpty)).toBeInTheDocument();
    expect(screen.queryByText('Activa')).not.toBeInTheDocument();
  });

  it('prioriza error sobre warning y omite las activas', async () => {
    tenantApi.list.mockResolvedValue([
      tenant({
        id: 't-ok',
        name: 'iWana',
        status: 'ACTIVE',
        updatedAt: '2026-08-11T11:46:00.000Z',
      }),
      tenant({
        id: 't-warn',
        name: 'Fibernet',
        status: 'SUSPENDED',
        updatedAt: '2026-08-11T12:00:00.000Z',
      }),
      tenant({
        id: 't-fail',
        name: 'Empresa Demo',
        status: 'PROVISIONING_FAILED',
        updatedAt: '2026-08-10T12:00:00.000Z',
      }),
    ]);

    render(<NotificationBell />);
    fireEvent.click(
      screen.getByRole('button', { name: PLATFORM_UI_COPY.tenants.notificationsTitle }),
    );

    expect(await screen.findByText('Empresa Demo')).toBeInTheDocument();
    expect(screen.getByText('Fibernet')).toBeInTheDocument();
    expect(screen.getByText('Con error')).toBeInTheDocument();
    expect(screen.getByText('Suspendida')).toBeInTheDocument();
    expect(screen.queryByText('iWana')).not.toBeInTheDocument();

    const items = screen.getAllByRole('link');
    expect(items[0]).toHaveAttribute('href', '/tenants/t-fail/settings');
    expect(items[1]).toHaveAttribute('href', '/tenants/t-warn/settings');
  });

  it('cierra con Escape y restaura el foco al disparador', async () => {
    tenantApi.list.mockResolvedValue([
      tenant({ id: 't-fail', name: 'Empresa Demo', status: 'PROVISIONING_FAILED' }),
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
