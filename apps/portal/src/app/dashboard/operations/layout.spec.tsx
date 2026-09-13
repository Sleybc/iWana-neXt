// apps/portal/src/app/dashboard/operations/layout.spec.tsx
// Acreditación del marco del módulo (F2): el PageHeader "Operaciones" sube al
// layout — eso es lo que preserva la aserción e2e `heading 'Operaciones'` de
// e2e/tests/portal-field-flow-ticket-ot-inventory.spec.ts:877 sin tocarla.
// Sin mocks el contexto de permisos cae al fallback estático (status
// `degraded`), que deniega por diseño: aquí se resuelve como listo.
import { render, screen } from '@testing-library/react';
import { AccessPermissionKey } from '@iwana/shared';
import OperationsLayout from './layout';

const mockUsePermissions = jest.fn();

jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: () => mockUsePermissions(),
}));

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'user-123' } }),
}));

describe('operations/layout', () => {
  beforeEach(() => {
    mockUsePermissions.mockReturnValue({
      status: 'ready',
      hasPermission: (permission: AccessPermissionKey) =>
        [
          AccessPermissionKey.OPERATIONS_TASKS_READ,
          AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
          AccessPermissionKey.OPERATIONS_TASKS_MANAGE,
        ].includes(permission),
      hasAnyPermission: () => false,
    });
  });

  it('pinta el encabezado "Operaciones" del módulo con su CTA y pestañas', () => {
    render(
      <OperationsLayout>
        <div>contenido</div>
      </OperationsLayout>,
    );

    expect(screen.getByRole('heading', { name: 'Operaciones' })).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'Secciones de Operaciones' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Crear tarea' })).toHaveAttribute(
      'href',
      '/dashboard/operations/tasks/new',
    );
    expect(screen.getByText('contenido')).toBeInTheDocument();
  });
});
