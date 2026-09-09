import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError, SESSION_EXPIRED_EVENT } from '@/lib/api-client';
import {
  SESSION_RECOVERY_OPEN_EVENT,
  SessionRecoveryModal,
  openSessionRecovery,
} from './SessionRecoveryModal';

const pushMock = jest.fn();
const loginMock = jest.fn();
const completeMfaLoginMock = jest.fn();
const clearTerminalSessionErrorMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/dashboard/inventory',
}));

jest.mock('./AuthProvider', () => ({
  useAuth: () => ({
    login: loginMock,
    completeMfaLogin: completeMfaLoginMock,
  }),
}));

jest.mock('@/lib/api-client', () => ({
  ...jest.requireActual<typeof import('@/lib/api-client')>('@/lib/api-client'),
  clearTerminalSessionError: () => clearTerminalSessionErrorMock(),
}));

function fillCredentialsForm() {
  fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'isp-demo' } });
  fireEvent.change(screen.getByLabelText('Correo electrónico'), {
    target: { value: 'admin@isp-demo.com' },
  });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'Admin123*' } });
}

function openRecoveryModal() {
  act(() => {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
  });
}

describe('SessionRecoveryModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
  });

  it('abre con el evento de sesión expirada, completa el login en sitio y cierra sin redirigir', async () => {
    loginMock.mockResolvedValue('authenticated');

    render(<SessionRecoveryModal />);

    expect(
      screen.queryByRole('dialog', { name: 'Vuelve a iniciar sesión' }),
    ).not.toBeInTheDocument();

    openRecoveryModal();

    await screen.findByRole('dialog', { name: 'Vuelve a iniciar sesión' });

    // La sesión está muerta: Escape no debe dejar a la app bloqueada cerrando
    // el único camino de recuperación.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Vuelve a iniciar sesión' })).toBeInTheDocument();

    fillCredentialsForm();
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith('admin@isp-demo.com', 'Admin123*', 'isp-demo');
    });

    await waitFor(() => {
      expect(clearTerminalSessionErrorMock).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    // Recuperación EN SITIO: sin redirección ni recarga.
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('abre también con openSessionRecovery y muestra el error de credenciales sin cerrarse', async () => {
    loginMock.mockRejectedValue(new ApiError(401, 'INVALID_CREDENTIALS', 'Credenciales inválidas'));

    render(<SessionRecoveryModal />);

    act(() => {
      openSessionRecovery();
    });

    await screen.findByRole('dialog', { name: 'Vuelve a iniciar sesión' });

    fillCredentialsForm();
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(await screen.findByText('Correo o contraseña incorrectos.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Vuelve a iniciar sesión' })).toBeInTheDocument();
    expect(clearTerminalSessionErrorMock).not.toHaveBeenCalled();
  });

  it('mfa_required presenta el paso de verificación en dos pasos y completa en el modal', async () => {
    loginMock.mockResolvedValue('mfa_required');
    completeMfaLoginMock.mockResolvedValue('authenticated');

    render(<SessionRecoveryModal />);

    openRecoveryModal();
    await screen.findByRole('dialog', { name: 'Vuelve a iniciar sesión' });

    fillCredentialsForm();
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(
      await screen.findByText(/Ingresa el código de tu aplicación de autenticación/i),
    ).toBeInTheDocument();

    for (let digit = 1; digit <= 6; digit += 1) {
      fireEvent.change(screen.getByLabelText(`Dígito ${digit} de 6`), {
        target: { value: String(digit) },
      });
    }

    await waitFor(() => {
      expect(completeMfaLoginMock).toHaveBeenCalledWith('123456');
    });

    await waitFor(() => {
      expect(clearTerminalSessionErrorMock).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    expect(pushMock).not.toHaveBeenCalled();
  });

  it('mfa_setup_required degrada con un camino claro en lugar de un dead-end', async () => {
    loginMock.mockResolvedValue('mfa_setup_required');

    render(<SessionRecoveryModal />);

    openRecoveryModal();
    await screen.findByRole('dialog', { name: 'Vuelve a iniciar sesión' });

    fillCredentialsForm();
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(
      await screen.findByText(/debe configurar la verificación en dos pasos/i),
    ).toBeInTheDocument();
    expect(clearTerminalSessionErrorMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Configurar verificación' }));

    expect(pushMock).toHaveBeenCalledWith('/auth/mfa/setup');
  });

  it('password_reset_required degrada con un camino claro en lugar de un dead-end', async () => {
    loginMock.mockResolvedValue('password_reset_required');

    render(<SessionRecoveryModal />);

    openRecoveryModal();
    await screen.findByRole('dialog', { name: 'Vuelve a iniciar sesión' });

    fillCredentialsForm();
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(await screen.findByText(/usa una contraseña temporal/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    expect(pushMock).toHaveBeenCalledWith('/auth/change-password');
  });

  it('valida la empresa antes de invocar login', async () => {
    loginMock.mockResolvedValue('authenticated');

    render(<SessionRecoveryModal />);

    openRecoveryModal();
    await screen.findByRole('dialog', { name: 'Vuelve a iniciar sesión' });

    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: 'admin@isp-demo.com' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'Admin123*' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(await screen.findByText('Ingresa el identificador de la empresa.')).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });
});
