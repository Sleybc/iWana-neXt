import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import PortalDashboardLayout from './layout-client';
import { PortalSidePeek } from '@/components/shared/portal-ui';
import { PORTAL_MODAL_DRAWER_STATE_EVENT } from '@/components/shared/portal-side-drawer-layers';

const replaceMock = jest.fn();
const getMeMock = jest.fn();
// Gate de navegación instantánea: el mock de useAuth es mutable para poder
// recorrer los estados de sesión (loading / no autenticado / autenticado) sin
// romper los tests previos, que fijan el estado autenticado por default.
interface MockAuthState {
  user: { id: string; role: string } | null;
  isLoading: boolean;
}

let currentAuth: MockAuthState = { user: { id: 'user-1', role: 'ADMIN' }, isLoading: false };
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
  useAuth: () => currentAuth,
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
    // Rol operativo por default (los tests previos lo asumían estático):
    // el layout solo carga getMe() para ADMIN/NOC/ACCOUNTANT/SUPPORT.
    currentAuth = { user: { id: 'user-1', role: 'ADMIN' }, isLoading: false };
    latestSidebarProps = {};
    latestTopHeaderProps = {};
    document.title = 'Inicial';
  });

  it('mientras se valida la sesión renderiza el fallback y NO monta chrome ni hijos', () => {
    currentAuth = { user: null, isLoading: true };

    render(
      <PortalDashboardLayout>
        <div>Contenido protegido</div>
      </PortalDashboardLayout>,
    );

    expect(screen.getByText('Validando sesión...')).toBeInTheDocument();
    // Ni el chrome del layout ni los hijos del subárbol protegido quedan montados
    expect(screen.queryByTestId('sidebar')).toBeNull();
    expect(screen.queryByText('Contenido protegido')).toBeNull();
    // El effect de branding hace guard por user: sin sesión no consulta tenants/me
    expect(getMeMock).not.toHaveBeenCalled();
    // El redirect solo dispara cuando la validación termina (isLoading=false)
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('sin sesión termina en redirect al login', async () => {
    currentAuth = { user: null, isLoading: false };

    render(
      <PortalDashboardLayout>
        <div>Contenido protegido</div>
      </PortalDashboardLayout>,
    );

    // La puerta real del effect del layout: replace a /auth/login
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/auth/login');
    });
    // El fallback queda en el sitio mientras la ruta se reemplaza
    expect(screen.getByText('Validando sesión...')).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar')).toBeNull();
    expect(screen.queryByText('Contenido protegido')).toBeNull();
  });

  it('resuelve el gate y monta el árbol cuando el usuario queda autenticado', async () => {
    currentAuth = { user: null, isLoading: true };
    getMeMock.mockResolvedValue({
      id: 'tenant-1',
      name: 'iWana',
      showTenantName: true,
    });

    const { rerender } = render(
      <PortalDashboardLayout>
        <div>Contenido protegido</div>
      </PortalDashboardLayout>,
    );

    // Presesión: solo el fallback
    expect(screen.getByText('Validando sesión...')).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar')).toBeNull();
    expect(screen.queryByText('Contenido protegido')).toBeNull();

    // Sesión resuelta: el gate entrega el árbol y se reemplaza el fallback
    await act(async () => {
      currentAuth = { user: { id: 'user-1', role: 'ADMIN' }, isLoading: false };
      rerender(
        <PortalDashboardLayout>
          <div>Contenido protegido</div>
        </PortalDashboardLayout>,
      );
    });

    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('top-header')).toBeInTheDocument();
    expect(screen.getByText('Contenido protegido')).toBeInTheDocument();
    expect(screen.queryByText('Validando sesión...')).toBeNull();
    // Con sesión el layout no redirige
    expect(replaceMock).not.toHaveBeenCalled();
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
