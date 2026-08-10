import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import PortalDashboardLayout from './layout';

const replaceMock = jest.fn();
const getMeMock = jest.fn();
let latestSidebarProps: {
  mobileOpen?: boolean;
  setMobileOpen?: (open: boolean) => void;
} = {};

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
    isLoading: false,
  }),
}));

jest.mock('@/lib/api-client', () => ({
  tenantSelfApi: {
    getMe: () => getMeMock(),
  },
}));

jest.mock('@/components/layout/Sidebar', () => ({
  Sidebar: (props: { mobileOpen: boolean; setMobileOpen: (open: boolean) => void }) => {
    latestSidebarProps = props;
    return <div data-testid="sidebar" />;
  },
}));

jest.mock('@/components/layout/TopHeader', () => ({
  TopHeader: () => <div data-testid="top-header" />,
}));

describe('PortalDashboardLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    latestSidebarProps = {};
    document.title = 'Inicial';
  });

  it('actualiza document.title usando brandingMetadataTitle de la empresa autenticada', async () => {
    getMeMock.mockResolvedValue({
      id: 'tenant-1',
      name: 'iWana',
      brandingProductName: 'Gestion C',
      brandingMetadataTitle: 'Portal de Gestion',
      showTenantName: true,
    });

    render(
      <PortalDashboardLayout>
        <div>Contenido protegido</div>
      </PortalDashboardLayout>,
    );

    expect(screen.getByText('Contenido protegido')).toBeInTheDocument();

    await waitFor(() => {
      expect(document.title).toBe('Portal de Gestion');
    });

    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('usa lienzo iwana-neutral-50 y capas semánticas ADR-075 sin z-35', async () => {
    getMeMock.mockResolvedValue({
      id: 'tenant-1',
      name: 'iWana',
      showTenantName: true,
    });

    const { container } = render(
      <PortalDashboardLayout>
        <div>Contenido protegido</div>
      </PortalDashboardLayout>,
    );

    const main = screen.getByRole('main');
    expect(main.className).toMatch(/bg-iwana-neutral-50/);
    expect(main.className).toMatch(/dark:bg-dark-surface/);
    expect(container.innerHTML).not.toContain('z-35');
    expect(container.innerHTML).not.toMatch(/bg-slate-50/);

    await waitFor(() => {
      expect(typeof latestSidebarProps.setMobileOpen).toBe('function');
    });

    act(() => {
      latestSidebarProps.setMobileOpen?.(true);
    });

    await waitFor(() => {
      const overlay = container.querySelector('[aria-hidden="true"].fixed');
      expect(overlay?.className).toMatch(/z-\(--z-overlay\)/);
      expect(container.innerHTML).not.toContain('z-35');
    });
  });
});
