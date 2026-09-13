// apps/portal/src/components/operations/OperationsModuleTabs.spec.tsx
// Acreditación de las pestañas de ruta (F2, spec 2026-09-13 §4.3; UX spec
// §4.2/CA-U1): enlaces reales, filtradas por permiso (la pestaña no permitida
// no se pinta), activa con `aria-current="page"` y `data-state="active"`
// fijado manualmente (D-A4).
import { render, screen } from '@testing-library/react';
import { AccessPermissionKey } from '@iwana/shared';
import { OperationsModuleTabs } from './OperationsModuleTabs';

const mockPathname = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
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

describe('OperationsModuleTabs', () => {
  beforeEach(() => {
    mockPathname.mockReturnValue('/dashboard/operations/tasks');
    mockUsePermissions.mockReturnValue(readyPermissions([]));
  });

  it('pinta las dos pestañas en orden con aria-current y data-state en la activa', () => {
    mockUsePermissions.mockReturnValue(
      readyPermissions([
        AccessPermissionKey.OPERATIONS_TASKS_READ,
        AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
      ]),
    );

    render(<OperationsModuleTabs />);

    const nav = screen.getByRole('navigation', { name: 'Secciones de Operaciones' });
    expect(nav).toBeInTheDocument();

    const tareas = screen.getByRole('link', { name: 'Tareas' });
    const ordenes = screen.getByRole('link', { name: 'Órdenes de ejecución' });
    expect(tareas).toHaveAttribute('href', '/dashboard/operations/tasks');
    expect(ordenes).toHaveAttribute('href', '/dashboard/operations/execution-orders');
    expect(tareas).toHaveAttribute('aria-current', 'page');
    expect(tareas).toHaveAttribute('data-state', 'active');
    expect(ordenes).not.toHaveAttribute('aria-current');
    expect(ordenes).not.toHaveAttribute('data-state', 'active');
  });

  it('no pinta la pestaña cuyo permiso falta (nunca deshabilitada)', () => {
    mockUsePermissions.mockReturnValue(
      readyPermissions([AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ]),
    );

    render(<OperationsModuleTabs />);

    expect(screen.getByRole('link', { name: 'Órdenes de ejecución' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Tareas' })).not.toBeInTheDocument();
  });

  it('sin ninguna pestaña permitida no pinta la navegación', () => {
    render(<OperationsModuleTabs />);

    expect(
      screen.queryByRole('navigation', { name: 'Secciones de Operaciones' }),
    ).not.toBeInTheDocument();
  });

  it('mientras los permisos no están resueltos no pinta nada', () => {
    mockUsePermissions.mockReturnValue({
      status: 'loading',
      hasPermission: () => false,
      hasAnyPermission: () => false,
    });

    const { container } = render(<OperationsModuleTabs />);

    expect(container).toBeEmptyDOMElement();
  });

  it('marca activa la pestaña contenedora de la sub-ruta actual (/tasks/new)', () => {
    mockUsePermissions.mockReturnValue(
      readyPermissions([AccessPermissionKey.OPERATIONS_TASKS_READ]),
    );
    mockPathname.mockReturnValue('/dashboard/operations/tasks/new');

    render(<OperationsModuleTabs />);

    const tareas = screen.getByRole('link', { name: 'Tareas' });
    expect(tareas).toHaveAttribute('aria-current', 'page');
    expect(tareas).toHaveAttribute('data-state', 'active');
  });
});
