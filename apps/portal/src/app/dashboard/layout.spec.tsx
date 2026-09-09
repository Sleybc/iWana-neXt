import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import PortalDashboardLayout from './layout';
import { PortalSidePeek } from '@/components/shared/portal-ui';
import { PORTAL_MODAL_DRAWER_STATE_EVENT } from '@/components/shared/portal-side-drawer-layers';

const replaceMock = jest.fn();
const getMeMock = jest.fn();
let latestSidebarProps: {
  mobileOpen?: boolean;
  setMobileOpen?: (open: boolean) => void;
  modalDrawerOpen?: boolean;
} = {};
let latestTopHeaderProps: {
  modalDrawerOpen?: boolean;
} = {};

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({
    // Rol operativo: el layout solo carga getMe() para ADMIN/NOC/ACCOUNTANT/SUPPORT
    user: { id: 'user-1', role: 'ADMIN' },
    isLoading: false,
  }),
}));

jest.mock('@/lib/api-client', () => ({
  tenantSelfApi: {
    getMe: () => getMeMock(),
  },
}));

jest.mock('@/components/layout/Sidebar', () => ({
  Sidebar: (props: {
    mobileOpen: boolean;
    setMobileOpen: (open: boolean) => void;
    modalDrawerOpen?: boolean;
  }) => {
    latestSidebarProps = props;
    return <div data-testid="sidebar" />;
  },
}));

jest.mock('@/components/layout/TopHeader', () => ({
  TopHeader: (props: { modalDrawerOpen?: boolean }) => {
    latestTopHeaderProps = props;
    return <div data-testid="top-header" />;
  },
}));

describe('PortalDashboardLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    latestSidebarProps = {};
    latestTopHeaderProps = {};
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
      expect(overlay?.className).toMatch(/z-\(--z-shell-raised\)/);
      expect(container.innerHTML).not.toContain('z-35');
    });
  });

  it('un drawer modal cierra el sidebar mobile y vuelve inerte el Sidebar', async () => {
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

    await waitFor(() => {
      expect(typeof latestSidebarProps.setMobileOpen).toBe('function');
    });

    // Sidebar mobile abierto
    act(() => {
      latestSidebarProps.setMobileOpen?.(true);
    });
    await waitFor(() => {
      expect(container.querySelector('[aria-hidden="true"].fixed')).not.toBeNull();
    });

    // Un drawer modal del portal abre
    act(() => {
      window.dispatchEvent(
        new CustomEvent(PORTAL_MODAL_DRAWER_STATE_EVENT, { detail: { open: true } }),
      );
    });

    await waitFor(() => {
      // El sidebar mobile se cierra (no coexisten dos overlays)
      expect(container.querySelector('[aria-hidden="true"].fixed')).toBeNull();
      // El layout difunde el estado al chrome: Sidebar y TopHeader quedan
      // inertes bajo el velo, que los atenua y desenfoca.
      expect(latestSidebarProps.modalDrawerOpen).toBe(true);
      expect(latestTopHeaderProps.modalDrawerOpen).toBe(true);
    });

    // El drawer cierra: el chrome vuelve a estar disponible
    act(() => {
      window.dispatchEvent(
        new CustomEvent(PORTAL_MODAL_DRAWER_STATE_EVENT, { detail: { open: false } }),
      );
    });
    await waitFor(() => {
      expect(latestSidebarProps.modalDrawerOpen).toBe(false);
      expect(latestTopHeaderProps.modalDrawerOpen).toBe(false);
    });
  });

  // M9 del cierre de contrato de capas (ADR-075): PortalSidePeek vive en
  // `--z-modal` sobre el chrome, así que también debe difundir su estado modal
  // (velo por encima E inercia del chrome — ambas mitades del contrato).
  it('un PortalSidePeek abierto difunde el estado modal y vuelve inerte el chrome', async () => {
    getMeMock.mockResolvedValue({
      id: 'tenant-1',
      name: 'iWana',
      showTenantName: true,
    });

    function Harness({ peekOpen }: { peekOpen: boolean }) {
      return (
        <PortalSidePeek open={peekOpen} onClose={jest.fn()} title="Detalle lateral">
          Contenido del peek
        </PortalSidePeek>
      );
    }

    const { rerender, container } = render(
      <PortalDashboardLayout>
        <Harness peekOpen={false} />
      </PortalDashboardLayout>,
    );

    await waitFor(() => {
      expect(latestSidebarProps.modalDrawerOpen).toBe(false);
      expect(latestTopHeaderProps.modalDrawerOpen).toBe(false);
    });

    // Sidebar mobile abierto: no debe coexistir con el overlay del peek.
    act(() => {
      latestSidebarProps.setMobileOpen?.(true);
    });
    await waitFor(() => {
      expect(container.querySelector('[aria-hidden="true"].fixed')).not.toBeNull();
    });

    // El peek abre DENTRO del layout: el chrome reacciona al estado difundido.
    rerender(
      <PortalDashboardLayout>
        <Harness peekOpen />
      </PortalDashboardLayout>,
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Detalle lateral' })).toBeInTheDocument();
      // El sidebar mobile se cierra (no coexisten dos overlays)
      expect(container.querySelector('[aria-hidden="true"].fixed')).toBeNull();
      // El chrome queda inerte bajo el velo mientras el peek viva.
      expect(latestSidebarProps.modalDrawerOpen).toBe(true);
      expect(latestTopHeaderProps.modalDrawerOpen).toBe(true);
    });

    // El peek cierra: el chrome vuelve a estar disponible.
    rerender(
      <PortalDashboardLayout>
        <Harness peekOpen={false} />
      </PortalDashboardLayout>,
    );

    await waitFor(() => {
      expect(latestSidebarProps.modalDrawerOpen).toBe(false);
      expect(latestTopHeaderProps.modalDrawerOpen).toBe(false);
    });
  });
});
