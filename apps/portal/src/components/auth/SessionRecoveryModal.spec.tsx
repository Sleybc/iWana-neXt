import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError, SESSION_EXPIRED_EVENT } from '@/lib/api-client';
import { setPortalModalDrawerState } from '@/components/shared/portal-side-drawer-layers';
import {
  SESSION_RECOVERY_OPEN_EVENT,
  SessionRecoveryModal,
  openSessionRecovery,
} from './SessionRecoveryModal';

const pushMock = jest.fn();
let currentPathname = '/dashboard/inventory';
const loginMock = jest.fn();
const completeMfaLoginMock = jest.fn();
const clearTerminalSessionErrorMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: (() => {
    let router: Record<string, unknown> | undefined;
    return () => (router ??= { push: pushMock });
  })(),
  usePathname: () => currentPathname,
}));

jest.mock('./AuthProvider', () => ({
  useAuth: (() => {
    let ctx: Record<string, unknown> | undefined;
    return () =>
      (ctx ??= {
        login: loginMock,
        completeMfaLogin: completeMfaLoginMock,
      });
  })(),
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

async function submitCredentials() {
  openRecoveryModal();
  await screen.findByRole('dialog', { name: 'Vuelve a iniciar sesión' });
  fillCredentialsForm();
  await act(
    async () => void fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' })),
  );
}

async function typeTotp() {
  for (let digit = 1; digit <= 6; digit += 1) {
    await act(
      async () =>
        void fireEvent.change(screen.getByLabelText(`Dígito ${digit} de 6`), {
          target: { value: String(digit) },
        }),
    );
  }
}

describe('SessionRecoveryModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentPathname = '/dashboard/inventory';
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

  it.each([
    [
      'AUTH_MFA_CODE_INVALID',
      'detalle',
      'Código incorrecto o ya usado. Espera el siguiente código.',
    ],
    ['AUTH_ACCOUNT_LOCKED', 'Espera 15 minuto(s).', 'Espera 15 minuto(s).'],
    [
      'UNKNOWN',
      'Cuenta bloqueada: detalle interno',
      'No fue posible verificar tu ingreso. Revisa el código o inicia sesión de nuevo.',
    ],
  ])('un 401 %s al verificar el código muestra su motivo', async (code, message, shown) => {
    loginMock.mockResolvedValue('mfa_required');
    completeMfaLoginMock.mockRejectedValue(new ApiError(401, code, message));

    render(<SessionRecoveryModal />);

    openRecoveryModal();
    await screen.findByRole('dialog', { name: 'Vuelve a iniciar sesión' });
    fillCredentialsForm();
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    await screen.findByText(/Ingresa el código de tu aplicación de autenticación/i);

    for (let digit = 1; digit <= 6; digit += 1) {
      fireEvent.change(screen.getByLabelText(`Dígito ${digit} de 6`), {
        target: { value: String(digit) },
      });
    }

    expect(await screen.findByText(shown)).toBeInTheDocument();
    expect(clearTerminalSessionErrorMock).not.toHaveBeenCalled();
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

  it('en rutas de autenticación ignora la sesión expirada', () => {
    currentPathname = '/auth/login';
    const view = render(<SessionRecoveryModal />);
    openRecoveryModal();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Control: la misma petición en otra ruta sí lo abre.
    currentPathname = '/dashboard';
    view.rerender(<SessionRecoveryModal />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it.each([
    [new ApiError(404, 'X', 'x'), 'Empresa no encontrada o cuenta inexistente.'],
    [new ApiError(429, 'X', 'x'), 'Demasiados intentos. Espera 1 minuto.'],
    [
      new ApiError(503, 'X', 'x'),
      'El servicio de autenticación no está disponible en este momento.',
    ],
    [new ApiError(418, 'X', 'detalle interno'), 'Error inesperado. Intenta de nuevo.'],
    [new TypeError('fetch failed'), 'Error de conexión. Verifica tu red.'],
  ])('si el ingreso falla con %s muestra su motivo y deja reintentar', async (error, shown) => {
    loginMock.mockRejectedValueOnce(error).mockResolvedValueOnce('authenticated');
    render(<SessionRecoveryModal />);
    await submitCredentials();

    expect(await screen.findByText(shown)).toBeInTheDocument();
    expect(clearTerminalSessionErrorMock).not.toHaveBeenCalled();

    await act(
      async () => void fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' })),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(clearTerminalSessionErrorMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [new ApiError(429, 'X', 'x'), 'Demasiados intentos. Espera 1 minuto.'],
    [
      new ApiError(500, 'X', 'detalle interno'),
      'No fue posible verificar el código. Intenta de nuevo.',
    ],
    [new TypeError('fetch failed'), 'Error de conexión. Verifica tu red.'],
  ])('si el código falla con %s muestra su motivo y lo vacía', async (error, shown) => {
    loginMock.mockResolvedValue('mfa_required');
    completeMfaLoginMock.mockRejectedValue(error);
    render(<SessionRecoveryModal />);
    await submitCredentials();
    await screen.findByLabelText('Dígito 1 de 6');
    await typeTotp();

    expect(await screen.findByText(shown)).toBeInTheDocument();
    expect(screen.getByLabelText('Dígito 1 de 6')).toHaveValue('');
    expect(clearTerminalSessionErrorMock).not.toHaveBeenCalled();
  });

  it('un código incompleto no se verifica al enviar el formulario', async () => {
    loginMock.mockResolvedValue('mfa_required');
    render(<SessionRecoveryModal />);
    await submitCredentials();
    const first = await screen.findByLabelText('Dígito 1 de 6');
    fireEvent.change(first, { target: { value: '1' } });
    fireEvent.submit(first.closest('form') as HTMLFormElement);

    expect(first).toHaveValue('1');
    expect(screen.getByRole('button', { name: 'Verificar código' })).toBeDisabled();
    expect(completeMfaLoginMock).not.toHaveBeenCalled();
  });

  it('volver desde el código regresa a las credenciales y descarta lo escrito', async () => {
    loginMock.mockResolvedValue('mfa_required');
    render(<SessionRecoveryModal />);
    await submitCredentials();
    const first = await screen.findByLabelText('Dígito 1 de 6');
    fireEvent.change(first, { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }));

    expect(screen.getByLabelText('Correo electrónico')).toHaveValue('admin@isp-demo.com');
    await act(
      async () => void fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' })),
    );
    expect(await screen.findByLabelText('Dígito 1 de 6')).toHaveValue('');
  });

  it('si tras el código hay contraseña temporal lo explica, y volver deja reingresar', async () => {
    loginMock.mockResolvedValue('mfa_required');
    completeMfaLoginMock.mockResolvedValue('password_reset_required');
    render(<SessionRecoveryModal />);
    await submitCredentials();
    await screen.findByLabelText('Dígito 1 de 6');
    await typeTotp();

    expect(await screen.findByText(/usa una contraseña temporal/i)).toBeInTheDocument();
    expect(clearTerminalSessionErrorMock).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Volver' }));

    expect(screen.queryByText(/usa una contraseña temporal/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeEnabled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('ofrece ir al inicio de sesión completo', async () => {
    render(<SessionRecoveryModal />);
    openRecoveryModal();
    fireEvent.click(await screen.findByRole('button', { name: 'Ir al inicio de sesión completo' }));

    expect(pushMock).toHaveBeenCalledWith('/auth/login');
  });

  it('retiene el foco con Tab y lo devuelve a quien lo tenía al cerrar', async () => {
    loginMock.mockResolvedValue('authenticated');
    render(
      <>
        <button type="button">Fondo</button>
        <SessionRecoveryModal />
      </>,
    );
    const background = screen.getByRole('button', { name: 'Fondo' });
    background.focus();
    openRecoveryModal();
    const first = await screen.findByLabelText('Empresa');
    const last = screen.getByRole('button', { name: 'Ir al inicio de sesión completo' });
    await waitFor(() => expect(first).toHaveFocus());

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();
    background.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();

    fillCredentialsForm();
    await act(
      async () => void fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' })),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(background).toHaveFocus();
  });

  it.each([true, false])(
    'al cerrar conserva el bloqueo de desplazamiento solo si queda otro panel (%s)',
    async (otherOpen) => {
      loginMock.mockResolvedValue('authenticated');
      setPortalModalDrawerState('otro-panel', otherOpen);
      try {
        render(<SessionRecoveryModal />);
        openRecoveryModal();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(document.body).toHaveClass('overflow-hidden');
        await submitCredentials();
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(document.body.classList.contains('overflow-hidden')).toBe(otherOpen);
      } finally {
        setPortalModalDrawerState('otro-panel', false);
        document.body.classList.remove('overflow-hidden');
      }
    },
  );
});
