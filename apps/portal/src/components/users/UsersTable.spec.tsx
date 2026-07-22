import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { UserRole, UserStatus } from '@iwana/shared';
import { UsersTable } from './UsersTable';

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
    meta: { nextCursor: null as string | null, total: 1 },
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
    currentUserId: 'other-user',
    currentUserRole: UserRole.ADMIN,
    ...overrides,
  };

  return { ...render(<UsersTable {...props} />), props };
}

describe('UsersTable', () => {
  it('muestra un estado vacío accionable cuando no hay usuarios', () => {
    renderTable({ users: [], meta: { nextCursor: null, total: 0 } });

    expect(screen.getByText('Sin usuarios registrados')).toBeInTheDocument();
    expect(screen.getByText(/ajusta los filtros o crea el primer usuario/i)).toBeInTheDocument();
  });

  it('muestra acciones icon-only con nombre accesible y CTA de cargar más', () => {
    const { props } = renderTable({
      meta: { nextCursor: 'next-page', total: 3 },
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
    const { rerender } = render(
      <UsersTable
        users={[adminUser]}
        isLoading={false}
        meta={{ nextCursor: null, total: 1 }}
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

    rerender(
      <UsersTable
        users={[adminUser]}
        isLoading={false}
        meta={{ nextCursor: null, total: 1 }}
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
        currentUserId="sys-1"
        currentUserRole={UserRole.SYSTEM_ADMIN}
      />,
    );

    const deleteAsSystemAdmin = screen.getByRole('button', {
      name: 'Eliminar usuario admin2@example.com',
    });
    expect(deleteAsSystemAdmin).not.toBeDisabled();
    expect(deleteAsSystemAdmin).toHaveAttribute('title', 'Eliminar usuario');
  });
});
