import { fireEvent, render, screen } from '@testing-library/react';
import { UserRole } from '@iwana/shared';
import { UsersTable } from './UsersTable';

const baseUser = {
  id: 'user-1',
  email: 'ana@example.com',
  role: UserRole.NOC,
  status: 'ACTIVE',
  tenantId: 'tenant-1',
  mfaEnabled: true,
  mfaRequired: false,
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

describe('UsersTable', () => {
  it('muestra un estado vacío accionable cuando no hay usuarios', () => {
    render(
      <UsersTable
        users={[]}
        isLoading={false}
        meta={{ nextCursor: null, total: 0 }}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
        onResetPassword={jest.fn()}
        onFilterChange={jest.fn()}
        onLoadMore={jest.fn()}
        searchValue=""
        onSearchChange={jest.fn()}
        currentUserId="other-user"
      />,
    );

    expect(screen.getByText('Sin usuarios registrados')).toBeInTheDocument();
    expect(screen.getByText(/ajusta los filtros o crea el primer usuario/i)).toBeInTheDocument();
  });

  it('muestra acciones icon-only con nombre accesible y CTA de cargar más', () => {
    const onEdit = jest.fn();
    const onDelete = jest.fn();
    const onResetPassword = jest.fn();
    const onFilterChange = jest.fn();
    const onLoadMore = jest.fn();
    const onSearchChange = jest.fn();

    render(
      <UsersTable
        users={[baseUser]}
        isLoading={false}
        meta={{ nextCursor: 'next-page', total: 3 }}
        onEdit={onEdit}
        onDelete={onDelete}
        onResetPassword={onResetPassword}
        onFilterChange={onFilterChange}
        onLoadMore={onLoadMore}
        searchValue=""
        onSearchChange={onSearchChange}
        currentUserId="other-user"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Editar usuario ana@example.com' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Reiniciar contraseña de ana@example.com' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar usuario ana@example.com' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }));

    expect(onEdit).toHaveBeenCalledWith(baseUser);
    expect(onResetPassword).toHaveBeenCalledWith(baseUser);
    expect(onDelete).toHaveBeenCalledWith(baseUser);
    expect(onLoadMore).toHaveBeenCalled();
  });

  it('limpia filtros desde el boton secundario cuando hay búsqueda activa', () => {
    const onFilterChange = jest.fn();
    const onSearchChange = jest.fn();

    render(
      <UsersTable
        users={[baseUser]}
        isLoading={false}
        meta={{ nextCursor: null, total: 1 }}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
        onResetPassword={jest.fn()}
        onFilterChange={onFilterChange}
        onLoadMore={jest.fn()}
        searchValue="ana"
        onSearchChange={onSearchChange}
        currentUserId="other-user"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

    expect(onSearchChange).toHaveBeenCalledWith('');
    expect(onFilterChange).toHaveBeenCalledWith({});
  });
});
