import '@testing-library/jest-dom';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import UsersPage from './page';

let searchParamsMock = new URLSearchParams();
const usersTableSpy = jest.fn();
const routerReplaceMock = jest.fn();

jest.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsMock,
  usePathname: () => '/users',
  useRouter: () => ({
    replace: routerReplaceMock,
  }),
}));

jest.mock('@iwana/ui', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
}));

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
    tenants: Array<{ slug: string; name: string }>;
    value: string;
    onChange: (slug: string) => void;
    ariaLabel: string;
  }) => (
    <select aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Selecciona una empresa</option>
      {tenants.map((tenant) => (
        <option key={tenant.slug} value={tenant.slug}>
          {tenant.name}
        </option>
      ))}
    </select>
  ),
}));

jest.mock('@/components/users/UserCreateModal', () => ({
  // Disparador mínimo de `onCreated`: fuerza la recarga del listado (`refreshKey`).
  UserCreateModal: ({ onCreated }: { onCreated: () => void }) => (
    <button type="button" onClick={onCreated}>
      Simular alta
    </button>
  ),
}));

jest.mock('@/components/users/UserManagementModal', () => ({
  UserManagementModal: ({
    open,
    user,
    onClose,
  }: {
    open: boolean;
    user: { id: string } | null;
    onClose: () => void;
  }) =>
    open && user ? (
      <div role="dialog" aria-label={`Ficha ${user.id}`}>
        <button type="button" onClick={onClose}>
          Cerrar ficha
        </button>
      </div>
    ) : null,
}));

jest.mock('@/components/users/UsersTable', () => ({
  UsersTable: (props: {
    emptyStateTitle?: string;
    emptyStateDescription?: string;
    total: number;
  }) => {
    usersTableSpy(props);

    return (
      <section>
        <p>{props.emptyStateTitle}</p>
        {props.emptyStateDescription ? <p>{props.emptyStateDescription}</p> : null}
        <p>Total: {props.total}</p>
      </section>
    );
  },
}));

jest.mock('@/lib/api-client', () => ({
  tenantApi: {
    list: jest.fn(),
  },
  usersApi: {
    list: jest.fn(),
  },
}));

describe('UsersPage', () => {
  const { tenantApi, usersApi } = jest.requireMock('@/lib/api-client') as {
    tenantApi: { list: jest.Mock };
    usersApi: { list: jest.Mock };
  };

  const activeTenant = {
    id: 'tenant-1',
    name: 'Empresa Demo',
    slug: 'empresa-demo',
    status: 'ACTIVE',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    usersTableSpy.mockClear();
    routerReplaceMock.mockClear();
    searchParamsMock = new URLSearchParams('tenant=empresa-demo');
    tenantApi.list.mockResolvedValue([activeTenant]);
  });

  it('explica el estado vacío con contexto de empresa y búsqueda', async () => {
    searchParamsMock = new URLSearchParams('tenant=empresa-demo&search=ana');
    usersApi.list.mockResolvedValue({
      data: [],
      meta: {
        total: 0,
        nextCursor: null,
      },
    });

    render(<UsersPage />);

    expect(await screen.findByRole('heading', { name: 'Usuarios de empresa' })).toBeInTheDocument();
    expect(screen.getByText('Gestiona acceso interno de Empresa Demo')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('No encontramos usuarios en Empresa Demo.')).toBeInTheDocument();
    });

    expect(
      screen.getByText('Revisa el criterio de búsqueda o crea un usuario interno para continuar.'),
    ).toBeInTheDocument();
    expect(usersApi.list).toHaveBeenCalledWith('empresa-demo', { limit: 20, search: 'ana' });
    // L-12: el selector pide solo empresas activas al servidor.
    expect(tenantApi.list).toHaveBeenCalledWith(expect.objectContaining({ status: 'ACTIVE' }));
  });

  it('muestra el error visible y permite reintentar la carga', async () => {
    usersApi.list
      .mockRejectedValueOnce(new Error('Servicio temporalmente no disponible.'))
      .mockResolvedValueOnce({
        data: [],
        meta: {
          total: 0,
          nextCursor: null,
        },
      });

    render(<UsersPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Error al cargar usuarios: Servicio temporalmente no disponible.',
    );
    expect(
      screen.getByText('No pudimos mostrar los usuarios de Empresa Demo.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => {
      expect(usersApi.list).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('ficha abierta por ?openUser= (búsqueda global)', () => {
    const listedUsers = {
      data: [
        { id: 'user-1', email: 'ana@empresa.com' },
        { id: 'user-2', email: 'luis@empresa.com' },
      ],
      meta: { total: 2, nextCursor: null },
    };

    it('al cerrar retira openUser de la URL y una recarga del listado no la reabre', async () => {
      searchParamsMock = new URLSearchParams('tenant=empresa-demo&openUser=user-1');
      usersApi.list.mockResolvedValue(listedUsers);

      render(<UsersPage />);

      expect(await screen.findByRole('dialog', { name: 'Ficha user-1' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Cerrar ficha' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(routerReplaceMock).toHaveBeenLastCalledWith('/users?tenant=empresa-demo', {
        scroll: false,
      });

      // `router.replace` aún no se aplicó: la URL sigue trayendo `openUser`.
      // Una recarga del listado en ese intervalo no debe reabrir la ficha.
      fireEvent.click(screen.getByRole('button', { name: 'Simular alta' }));
      await waitFor(() => {
        expect(usersApi.list).toHaveBeenCalledTimes(2);
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('con la URL ya sin openUser la ficha sigue cerrada y un enlace nuevo abre la pedida', async () => {
      searchParamsMock = new URLSearchParams('tenant=empresa-demo&openUser=user-1');
      usersApi.list.mockResolvedValue(listedUsers);

      const { rerender } = render(<UsersPage />);
      expect(await screen.findByRole('dialog', { name: 'Ficha user-1' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Cerrar ficha' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      // La URL ya sin el parámetro: la ficha sigue cerrada.
      searchParamsMock = new URLSearchParams('tenant=empresa-demo');
      rerender(<UsersPage />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      // Un enlace nuevo de la búsqueda global abre la ficha pedida.
      searchParamsMock = new URLSearchParams('tenant=empresa-demo&openUser=user-2');
      rerender(<UsersPage />);
      expect(await screen.findByRole('dialog', { name: 'Ficha user-2' })).toBeInTheDocument();
    });
  });
});
