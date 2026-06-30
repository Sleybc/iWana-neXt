import { fireEvent, render, screen } from '@testing-library/react';
import { TenantsTable } from './TenantsTable';

const pushMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

describe('Tabla de empresas de plataforma', () => {
  const tenants = [
    {
      id: 'tenant-1',
      name: 'Acme ISP',
      slug: 'acme-isp',
      status: 'ACTIVE' as const,
      createdAt: '2026-05-01T10:00:00.000Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('muestra el trigger accesible del menú y ejecuta la acción de suspender', () => {
    const onSuspend = jest.fn();

    render(<TenantsTable tenants={tenants} onSuspend={onSuspend} />);

    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú de acciones' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Suspender' }));

    expect(onSuspend).toHaveBeenCalledWith('tenant-1');
  });

  it('usa el botón gobernado para reintentar en estado de error', () => {
    const onRetry = jest.fn();

    render(<TenantsTable tenants={[]} error="Falló la carga" onRetry={onRetry} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(onRetry).toHaveBeenCalled();
  });

  it('permite navegar a configuración desde el menú', () => {
    render(<TenantsTable tenants={tenants} />);

    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú de acciones' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ver configuración' }));

    expect(pushMock).toHaveBeenCalledWith('/tenants/tenant-1/settings');
  });
});
