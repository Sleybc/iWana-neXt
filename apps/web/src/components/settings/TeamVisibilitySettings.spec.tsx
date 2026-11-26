import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TeamVisibilitySettings } from './TeamVisibilitySettings';

/** El foco está dentro de `element` y no se perdió en `body`. */
const expectFocusIn = (element: HTMLElement) => {
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toContainElement(element);
};

let mockRole = 'SYSTEM_ADMIN';
jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { role: mockRole } }),
}));
jest.mock('@/lib/api-client', () => ({
  tenantApi: { usageVisibility: jest.fn(), updateUsageVisibility: jest.fn() },
}));

const { tenantApi } = jest.requireMock('@/lib/api-client') as {
  tenantApi: { usageVisibility: jest.Mock; updateUsageVisibility: jest.Mock };
};
const LABEL = /^Mostrar uso por empresa a Soporte iWana/;

describe('TeamVisibilitySettings (ADR-114 v1.3 §9)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRole = 'SYSTEM_ADMIN';
    tenantApi.usageVisibility.mockResolvedValue({ grantedRoles: [], canView: true });
  });

  it('carga el valor guardado: apagado por defecto', async () => {
    render(<TeamVisibilitySettings />);
    expect(screen.getByRole('status', { name: 'Cargando esta preferencia…' })).toBeInTheDocument();
    const toggle = await screen.findByRole('switch', { name: LABEL });
    expect(toggle).not.toBeChecked();
    expect(toggle).toBeEnabled();
  });

  it('el administrador concede y ve la confirmación', async () => {
    tenantApi.updateUsageVisibility.mockResolvedValue({
      grantedRoles: ['IWANA_SUPPORT'],
      canView: true,
    });
    render(<TeamVisibilitySettings />);
    await userEvent.click(await screen.findByRole('switch', { name: LABEL }));
    expect(tenantApi.updateUsageVisibility).toHaveBeenCalledWith({
      grantedRoles: ['IWANA_SUPPORT'],
    });
    expect(
      await screen.findByText('Listo. Soporte iWana ya ve el uso por empresa.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: LABEL })).toBeChecked();
  });

  it('si falla el guardado, vuelve al valor anterior y lo dice', async () => {
    tenantApi.updateUsageVisibility.mockRejectedValue(new Error('500'));
    render(<TeamVisibilitySettings />);
    await userEvent.click(await screen.findByRole('switch', { name: LABEL }));
    expect(
      await screen.findByText('No pudimos guardar el cambio. Reintenta en unos minutos.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: LABEL })).not.toBeChecked();
  });

  it('error al cargar con reintento', async () => {
    tenantApi.usageVisibility.mockRejectedValueOnce(new Error('503'));
    render(<TeamVisibilitySettings />);
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(tenantApi.usageVisibility).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('switch', { name: LABEL })).toBeInTheDocument();
  });

  it('tras reintentar, el foco va al título o, si vuelve a fallar, al aviso', async () => {
    tenantApi.usageVisibility.mockRejectedValueOnce(new Error('503'));
    render(<TeamVisibilitySettings />);
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 2 })).toHaveFocus());

    tenantApi.usageVisibility.mockRejectedValue(new Error('503'));
    const view = render(<TeamVisibilitySettings />);
    await userEvent.click(
      await within(view.container).findByRole('button', { name: 'Reintentar' }),
    );
    await waitFor(() => expect(tenantApi.usageVisibility).toHaveBeenCalledTimes(4));
    await waitFor(() =>
      expectFocusIn(within(view.container).getByRole('button', { name: 'Reintentar' })),
    );
  });

  it('Soporte ve el valor en solo lectura', async () => {
    mockRole = 'IWANA_SUPPORT';
    tenantApi.usageVisibility.mockResolvedValue({ grantedRoles: ['IWANA_SUPPORT'], canView: true });
    render(<TeamVisibilitySettings />);
    const toggle = await screen.findByRole('switch', { name: LABEL });
    expect(toggle).toBeChecked();
    expect(toggle).toBeDisabled();
    expect(
      screen.getByText('Solo el administrador de plataforma puede cambiar esta opción.'),
    ).toBeInTheDocument();
  });
});
