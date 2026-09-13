// apps/portal/src/components/operations/OperationsCreateTaskAction.spec.tsx
// M3.1 (OLA 4.1): el CTA del encabezado construye el alta con el estado
// vigente de la bandeja de tareas como `returnTo`; desde otra sub-ruta no hay
// estado de bandeja de tareas que preservar (UX spec §5.4).
import { render, screen } from '@testing-library/react';
import { AccessPermissionKey } from '@iwana/shared';
import { OperationsCreateTaskAction } from './OperationsCreateTaskAction';

let mockPathname: string | null = null;
let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}));

const mockUsePermissions = jest.fn();
jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: () => mockUsePermissions(),
}));

function grantCreateTask() {
  mockUsePermissions.mockReturnValue({
    status: 'ready',
    hasPermission: (permission: AccessPermissionKey) =>
      permission === AccessPermissionKey.OPERATIONS_TASKS_MANAGE,
    hasAnyPermission: () => false,
  });
}

describe('OperationsCreateTaskAction (M3.1)', () => {
  beforeEach(() => {
    mockPathname = null;
    mockSearchParams = new URLSearchParams();
    grantCreateTask();
  });

  it('desde la bandeja de tareas enlaza el alta con el estado vigente como returnTo', () => {
    mockPathname = '/dashboard/operations/tasks';
    mockSearchParams = new URLSearchParams({ status: 'OPEN', page: '3' });

    render(<OperationsCreateTaskAction />);

    const href = screen.getByRole('link', { name: 'Crear tarea' }).getAttribute('href') ?? '';
    expect(href).toContain('/dashboard/operations/tasks/new?returnTo=');
    expect(decodeURIComponent(href.split('returnTo=')[1] ?? '')).toBe(
      '/dashboard/operations/tasks?status=OPEN&page=3',
    );
  });

  it('sin estado de bandeja el enlace queda sin returnTo', () => {
    mockPathname = '/dashboard/operations/tasks';
    mockSearchParams = new URLSearchParams();

    render(<OperationsCreateTaskAction />);

    expect(screen.getByRole('link', { name: 'Crear tarea' })).toHaveAttribute(
      'href',
      '/dashboard/operations/tasks/new',
    );
  });

  it('desde otra sub-ruta no adjunta returnTo (no hay bandeja de tareas de origen)', () => {
    mockPathname = '/dashboard/operations/execution-orders';
    mockSearchParams = new URLSearchParams({ status: 'ASSIGNED' });

    render(<OperationsCreateTaskAction />);

    expect(screen.getByRole('link', { name: 'Crear tarea' })).toHaveAttribute(
      'href',
      '/dashboard/operations/tasks/new',
    );
  });

  it('sin permiso de creación no pinta el CTA', () => {
    mockUsePermissions.mockReturnValue({
      status: 'ready',
      hasPermission: () => false,
      hasAnyPermission: () => false,
    });

    render(<OperationsCreateTaskAction />);

    expect(screen.queryByRole('link', { name: 'Crear tarea' })).not.toBeInTheDocument();
  });
});
