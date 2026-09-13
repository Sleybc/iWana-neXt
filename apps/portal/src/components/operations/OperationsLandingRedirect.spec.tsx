// apps/portal/src/components/operations/OperationsLandingRedirect.spec.tsx
// Acreditación de la rama landing de la raíz (F2, spec 2026-09-13 §4.2):
// primera pestaña permitida (UX spec §4.2, Tareas primero), skeleton mientras
// los permisos se resuelven y shell restringido reutilizando
// `restrictedShellClassName` cuando no hay ninguna pestaña permitida (D-A5).
import { render, screen, waitFor } from '@testing-library/react';
import { AccessPermissionKey } from '@iwana/shared';
import { OperationsLandingRedirect } from './OperationsLandingRedirect';

const mockReplace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
}));

const mockUsePermissions = jest.fn();

jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: () => mockUsePermissions(),
}));

function readyPermissions(granted: readonly AccessPermissionKey[]) {
  return {
    status: 'ready',
    hasPermission: (permission: AccessPermissionKey) => granted.includes(permission),
    hasAnyPermission: (required: readonly AccessPermissionKey[]) =>
      required.some((item) => granted.includes(item)),
  };
}

describe('OperationsLandingRedirect', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockUsePermissions.mockReturnValue(readyPermissions([]));
  });

  it('redirige a Tareas cuando el permiso de lectura de tareas está permitido', async () => {
    mockUsePermissions.mockReturnValue(
      readyPermissions([
        AccessPermissionKey.OPERATIONS_TASKS_READ,
        AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
      ]),
    );

    render(<OperationsLandingRedirect />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/dashboard/operations/tasks');
    });
  });

  it('redirige a Órdenes de ejecución cuando solo ese permiso está permitido', async () => {
    mockUsePermissions.mockReturnValue(
      readyPermissions([AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ]),
    );

    render(<OperationsLandingRedirect />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/dashboard/operations/execution-orders');
    });
  });

  it('muestra el skeleton de verificación mientras los permisos no resuelven', () => {
    mockUsePermissions.mockReturnValue({
      status: 'loading',
      hasPermission: () => false,
      hasAnyPermission: () => false,
    });

    const { container } = render(<OperationsLandingRedirect />);

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('sin ninguna pestaña permitida pinta el shell restringido con salida a inicio (D-A5)', () => {
    render(<OperationsLandingRedirect />);

    expect(
      screen.getByText('No tienes acceso a esta sección', { selector: 'h2' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a inicio' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
