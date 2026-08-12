import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { NotificationBell } from './NotificationBell';
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
});
