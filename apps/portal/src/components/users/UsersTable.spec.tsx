import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { PlatformRole, UserRole, UserStatus } from '@iwana/shared';
import { UsersTable } from './UsersTable';
import { EMPTY_LIST_META } from '@/lib/list-meta';

const baseUser = {
  id: 'user-1',
  email: 'ana@example.com',
  role: UserRole.NOC,
  status: 'ACTIVE',
  tenantId: 'tenant-1',
  mfaEnabled: true,
  mfaRequired: false,
  isOperationalResource: false,
  emailVerified: true,
  passwordResetRequired: false,
  lastLoginAt: '2026-05-01T10:00:00.000Z',
  createdAt: '2026-04-01T08:00:00.000Z',
  updatedAt: '2026-05-01T10:00:00.000Z',
  deletedAt: null,
  firstName: 'Ana',
  lastName: 'Pérez',
  phone: null,
  jobTitle: null,
  documentType: null,
  documentNumber: null,
  avatarUrl: null,
};

const adminUser = {
  ...baseUser,
  id: 'admin-2',
  email: 'admin2@example.com',
  role: UserRole.ADMIN,
  firstName: 'Ada',
  lastName: 'Admin',
};

function renderTable(overrides: Partial<ComponentProps<typeof UsersTable>> = {}) {
  const props = {
    users: [baseUser],
    isLoading: false,
    meta: { ...EMPTY_LIST_META, nextCursor: null, total: 1 },
    onEdit: jest.fn(),
    onDelete: jest.fn(),
    onResetPassword: jest.fn(),
    onLoadMore: jest.fn(),
    searchValue: '',
    statusFilter: '',
    roleFilter: '',
    onSearchChange: jest.fn(),
    onStatusChange: jest.fn(),
    onRoleChange: jest.fn(),
    onClearFilters: jest.fn(),
    onCreateUser: jest.fn(),
    currentUserId: 'other-user',
    currentUserRole: UserRole.ADMIN,
    ...overrides,
  };

  return { ...render(<UsersTable {...props} />), props };
}

describe('UsersTable', () => {
  it('muestra empty state de primera vez con CTA Nuevo usuario', () => {
    const { props } = renderTable({
      users: [],
      meta: { ...EMPTY_LIST_META, nextCursor: null, total: 0 },
    });

    expect(screen.getByText('Aún no hay usuarios')).toBeInTheDocument();
    expect(
      screen.getByText(/crea el primer usuario interno para gestionar los accesos/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo usuario' }));
    expect(props.onCreateUser).toHaveBeenCalled();
  });

  it('usa par tonal secondary para MFA habilitado', () => {
    renderTable({
      users: [{ ...baseUser, mfaEnabled: true, isOperationalResource: true }],
    });

    expect(screen.getByText('Habilitado')).toHaveClass('text-iwana-secondary-700');
    expect(screen.getByText('Despacho operativo')).toHaveClass('text-iwana-secondary-700');
  });

  it('muestra empty state con filtros activos y CTA Limpiar filtros', () => {
    const { props } = renderTable({
      users: [],
      meta: { ...EMPTY_LIST_META, nextCursor: null, total: 0 },
      searchValue: 'sin-match',
    });

    expect(screen.getByText('Sin resultados')).toBeInTheDocument();
    expect(
      screen.getByText(/ningún usuario coincide con los filtros actuales/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Limpiar filtros' })[0]!);
    expect(props.onClearFilters).toHaveBeenCalled();
  });

  it('muestra tres acciones icono visibles (editar, reiniciar, eliminar)', () => {
    const { props } = renderTable({
      meta: { ...EMPTY_LIST_META, nextCursor: 'next-page', total: 3 },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Editar usuario ana@example.com' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Reiniciar contraseña de ana@example.com' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar usuario ana@example.com' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }));

    expect(props.onEdit).toHaveBeenCalledWith(baseUser);
    expect(props.onResetPassword).toHaveBeenCalledWith(baseUser);
    expect(props.onDelete).toHaveBeenCalledWith(baseUser);
    expect(props.onLoadMore).toHaveBeenCalled();
  });

  it('ADR-064: strip único de conteo y footer solo con Cargar más si hasMore', () => {
    const { unmount } = renderTable({
      users: [baseUser],
      meta: { ...EMPTY_LIST_META, nextCursor: 'next-page', total: 3 },
    });

    expect(screen.getByText('1 de 3 usuarios')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cargar más' })).toBeInTheDocument();
    expect(screen.queryByText('Fin de resultados')).not.toBeInTheDocument();
    expect(screen.getByText(/Mostrando 1 de 3 usuarios/)).toHaveClass('sr-only');
    unmount();

    renderTable({
      users: [baseUser],
      meta: { ...EMPTY_LIST_META, nextCursor: null, total: 1 },
    });

    expect(screen.getByText('1 usuario')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
    expect(screen.queryByText('Fin de resultados')).not.toBeInTheDocument();
    expect(screen.queryByText(/Mostrando/)).not.toBeInTheDocument();
  });

  it('FE-01: refleja filtros controlados y limpia vía callback único', () => {
    const { props } = renderTable({
      searchValue: 'ana',
      statusFilter: UserStatus.SUSPENDED,
      roleFilter: UserRole.NOC,
    });

    expect(screen.getByLabelText('Buscar usuario')).toHaveValue('ana');
    expect(screen.getByRole('combobox', { name: 'Estado' })).toHaveTextContent('Suspendido');
    expect(screen.getByRole('combobox', { name: 'Rol' })).toHaveTextContent('Monitoreo operativo');

    fireEvent.click(screen.getByRole('combobox', { name: 'Estado' }));
    fireEvent.click(screen.getByRole('option', { name: 'Activo' }));
    expect(props.onStatusChange).toHaveBeenCalledWith(UserStatus.ACTIVE);

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(props.onClearFilters).toHaveBeenCalled();
  });

  it('FE-03: SYSTEM_ADMIN puede eliminar un ADMIN; ADMIN no', () => {
    const { unmount } = render(
      <UsersTable
        users={[adminUser]}
        isLoading={false}
        meta={{ ...EMPTY_LIST_META, nextCursor: null, total: 1 }}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
        onResetPassword={jest.fn()}
        onLoadMore={jest.fn()}
        searchValue=""
        statusFilter=""
        roleFilter=""
        onSearchChange={jest.fn()}
        onStatusChange={jest.fn()}
        onRoleChange={jest.fn()}
        onClearFilters={jest.fn()}
        onCreateUser={jest.fn()}
        currentUserId="admin-1"
        currentUserRole={UserRole.ADMIN}
      />,
    );

    const deleteAsAdmin = screen.getByRole('button', {
      name: 'Eliminar usuario admin2@example.com',
    });
    expect(deleteAsAdmin).toBeDisabled();
    expect(deleteAsAdmin).toHaveAttribute(
      'title',
      'No puedes eliminar a otro administrador del tenant',
    );
    expect(deleteAsAdmin).toHaveAttribute('aria-describedby', 'delete-blocked-admin-2');
    expect(screen.getByText('No puedes eliminar a otro administrador del tenant')).toHaveClass(
      'sr-only',
    );
    unmount();

    render(
      <UsersTable
        users={[adminUser]}
        isLoading={false}
        meta={{ ...EMPTY_LIST_META, nextCursor: null, total: 1 }}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
        onResetPassword={jest.fn()}
        onLoadMore={jest.fn()}
        searchValue=""
        statusFilter=""
        roleFilter=""
        onSearchChange={jest.fn()}
        onStatusChange={jest.fn()}
        onRoleChange={jest.fn()}
        onClearFilters={jest.fn()}
        onCreateUser={jest.fn()}
        currentUserId="sys-1"
        currentUserRole={PlatformRole.SYSTEM_ADMIN}
      />,
    );

    const deleteAsSystemAdmin = screen.getByRole('button', {
      name: 'Eliminar usuario admin2@example.com',
    });
    expect(deleteAsSystemAdmin).not.toBeDisabled();
    expect(deleteAsSystemAdmin).toHaveAttribute('title', 'Eliminar usuario');
  });

  describe('ADR-065: PortalTablePager (page-based)', () => {
    const twoUsers = [
      { ...baseUser, id: 'user-1', email: 'ana@example.com', firstName: 'Ana' },
      {
        ...baseUser,
        id: 'user-2',
        email: 'carlos@example.com',
        firstName: 'Carlos',
        lastName: 'Gómez',
      },
    ];

    const pageBasedProps = {
      page: 1,
      pageCount: 2,
      from: 1,
      to: 2,
      onPageChange: jest.fn(),
      isPageMode: true,
      pageSize: 20,
      onPageSizeChange: jest.fn(),
    };

    it('muestra PortalTablePager en vez de Cargar más con props page-based', () => {
      renderTable({
        users: twoUsers,
        meta: { ...EMPTY_LIST_META, nextCursor: null, total: 4 },
        ...pageBasedProps,
      });

      // El pager numerado está presente
      expect(screen.getByRole('navigation', { name: /Paginación/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Anterior' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Siguiente' })).toBeInTheDocument();

      // Cargar más NO se muestra cuando hay pager
      expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
    });

    it('no muestra pager cuando total es 0 aunque lleguen props page-based', () => {
      renderTable({
        users: [],
        meta: { ...EMPTY_LIST_META, nextCursor: null, total: 0 },
        ...pageBasedProps,
      });

      // Sin resultados no hay paginación
      expect(screen.queryByRole('navigation', { name: /Paginación/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
    });

    it('llama a onPageChange al pulsar Siguiente', () => {
      const onPageChange = jest.fn();
      renderTable({
        users: twoUsers,
        meta: { ...EMPTY_LIST_META, nextCursor: null, total: 4 },
        page: 1,
        pageCount: 2,
        from: 1,
        to: 2,
        onPageChange,
        isPageMode: true,
      });

      fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
      expect(onPageChange).toHaveBeenCalledWith(2);
    });

    it('fallback a Cargar más cuando onPageChange no se pasa', () => {
      renderTable({
        users: twoUsers,
        meta: { ...EMPTY_LIST_META, nextCursor: 'next', total: 4 },
        // Sin props page-based → PortalTablePagination
      });

      expect(screen.getByRole('button', { name: 'Cargar más' })).toBeInTheDocument();
      expect(screen.queryByRole('navigation', { name: /Paginación/ })).not.toBeInTheDocument();
    });

    it('evita duplicar el conteo del strip en modo page-based', () => {
      renderTable({
        users: twoUsers,
        meta: { ...EMPTY_LIST_META, nextCursor: null, total: 4 },
        page: 1,
        pageCount: 2,
        from: 1,
        to: 2,
        onPageChange: jest.fn(),
        isPageMode: true,
        pageSize: 20,
        onPageSizeChange: jest.fn(),
      });

      expect(screen.queryByText('4 usuarios')).not.toBeInTheDocument();
      // El pager muestra el rango (visible + sr-only → múltiples matches)
      expect(screen.getAllByText(/Mostrando 1–2 de 4 usuarios/).length).toBeGreaterThan(0);
      expect(screen.getByLabelText('Filas por página')).toBeInTheDocument();
    });
  });
});
