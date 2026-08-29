// apps/portal/src/components/access-control/PagePermissionGate.spec.tsx
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import { PagePermissionGate } from './PagePermissionGate';

const useAuthMock = jest.fn();
const usePermissionsMock = jest.fn();
const retryMock = jest.fn();

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => useAuthMock(),
}));

jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: () => usePermissionsMock(),
}));

jest.mock('next/link', () => {
  return function MockLink({
    children,
    href,
    ...props
  }: React.PropsWithChildren<{ href: string }>) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  };
});

function mockContext(overrides: {
  status?: 'loading' | 'ready' | 'degraded';
  permissions?: AccessPermissionKey[];
}) {
  const status = overrides.status ?? 'ready';
  const permissions = overrides.permissions ?? [];
  usePermissionsMock.mockReturnValue({
    status,
    effectivePermissions: new Set(permissions),
    hasPermission: (permission: AccessPermissionKey) => permissions.includes(permission),
    hasAnyPermission: (required: readonly AccessPermissionKey[]) =>
      required.some((permission) => permissions.includes(permission)),
    retry: retryMock,
  });
}

function renderGate(
  props: Partial<React.ComponentProps<typeof PagePermissionGate>> = {},
  content = <p data-testid="page-content">Contenido protegido</p>,
) {
  return render(
    <PagePermissionGate permission={AccessPermissionKey.CRM_SUBSCRIBERS_READ} {...props}>
      {content}
    </PagePermissionGate>,
  );
}

describe('PagePermissionGate', () => {
  beforeEach(() => {
    retryMock.mockReset();
    useAuthMock.mockReturnValue({ user: { role: UserRole.SUPPORT } });
    mockContext({ status: 'ready', permissions: [] });
  });

  it('CA-GATE-04: en checking renderiza skeleton con anuncio sr-only y no monta contenido', () => {
    mockContext({ status: 'loading' });

    renderGate();

    expect(screen.queryByTestId('page-content')).not.toBeInTheDocument();
    const announcement = screen.getByText('Verificando acceso');
    expect(announcement).toHaveAttribute('role', 'status');
    expect(announcement).toHaveAttribute('aria-live', 'polite');
    expect(announcement.className).toMatch(/sr-only/);
  });

  it('estado autorizado renderiza children sin alteración', () => {
    mockContext({ status: 'ready', permissions: [AccessPermissionKey.CRM_SUBSCRIBERS_READ] });

    renderGate();

    expect(screen.getByTestId('page-content')).toBeInTheDocument();
  });

  it('CA-GATE-03: restringido muestra copy congelado, Volver a inicio y sin enlace de usuarios sin users.read', () => {
    mockContext({ status: 'ready', permissions: [] });

    renderGate();

    expect(screen.getByText('Acceso restringido')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'No tienes acceso a esta sección' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Tu tipo de usuario y sus perfiles asignados no incluyen el acceso necesario para usar esta sección.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Contenido protegido')).not.toBeInTheDocument();

    const homeLink = screen.getByRole('link', { name: 'Volver a inicio' });
    expect(homeLink).toHaveAttribute('href', '/dashboard');
    expect(homeLink.className).toMatch(/min-h-11/);

    // Sin users.read el enlace secundario no existe en el DOM
    expect(screen.queryByRole('link', { name: 'Ver usuarios y accesos' })).not.toBeInTheDocument();
  });

  it('CA-GATE-03: con users.read efectivo muestra Ver usuarios y accesos', () => {
    mockContext({
      status: 'ready',
      permissions: [AccessPermissionKey.USERS_READ],
    });

    renderGate();

    expect(screen.getByRole('link', { name: 'Ver usuarios y accesos' })).toHaveAttribute(
      'href',
      '/dashboard/users',
    );
  });

  it('CA-GATE-05: sin techo estático y endpoint caído muestra error sanitizado con Reintentar', () => {
    mockContext({ status: 'degraded' });

    renderGate();

    expect(screen.getByText('No pudimos verificar tu acceso')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Intenta nuevamente en unos segundos. Si el problema continúa, contacta a un administrador.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Error|500|403/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('page-content')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(retryMock).toHaveBeenCalledTimes(1);
  });

  it('degradado con techo que permite la ruta autoriza (continuidad operativa)', () => {
    mockContext({ status: 'degraded' });

    renderGate({ allowedRoles: [UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT] });

    expect(screen.getByTestId('page-content')).toBeInTheDocument();
  });

  it('degradado con techo que excluye al usuario muestra restringido', () => {
    useAuthMock.mockReturnValue({ user: { role: UserRole.TECHNICIAN } });
    mockContext({ status: 'degraded' });

    renderGate({ allowedRoles: [UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT] });

    expect(
      screen.getByRole('heading', { level: 1, name: 'No tienes acceso a esta sección' }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('page-content')).not.toBeInTheDocument();
  });
});
