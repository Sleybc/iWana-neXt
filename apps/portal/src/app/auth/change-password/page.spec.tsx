import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChangePasswordPage from './page';
import { ApiError } from '@/lib/api-client';

const push = jest.fn();
const mockRouter = { push };
const changeTemporaryPassword = jest.fn();

jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
jest.mock('@/components/auth/LoginBrandPanel', () => ({ LoginBrandPanel: () => null }));
jest.mock('@/lib/api-client', () => ({
  ApiError: class extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
  authApi: {
    changeTemporaryPassword: (...args: unknown[]) => changeTemporaryPassword(...args),
  },
}));

async function submit(): Promise<void> {
  const user = userEvent.setup();
  const { container } = render(<ChangePasswordPage />);
  const type = async (name: string, value: string) =>
    user.type(container.querySelector(`input[name="${name}"]`) as HTMLInputElement, value);
  await type('currentPassword', 'Temporal123!');
  await type('newPassword', 'Definitiva456!');
  await type('confirmPassword', 'Definitiva456!');
  await user.click(container.querySelector('button[type="submit"]') as HTMLButtonElement);
  await waitFor(() => expect(changeTemporaryPassword).toHaveBeenCalled());
}

describe('Cambio obligatorio de contraseña', () => {
  beforeEach(() => jest.clearAllMocks());

  it('envía la contraseña y vuelve al inicio de sesión', async () => {
    changeTemporaryPassword.mockResolvedValue(undefined);
    await submit();

    expect(changeTemporaryPassword).toHaveBeenCalledWith('Temporal123!', 'Definitiva456!');
    await waitFor(() => expect(push).toHaveBeenCalledWith('/auth/login'));
  });

  it.each([
    [0, 'PASSWORD_CHANGE_TOKEN_MISSING', 'Inicia sesión otra vez.', 'Inicia sesión otra vez.'],
    [401, 'UNKNOWN', 'x', /contraseña temporal no es correcta/],
    [400, 'UNKNOWN', 'La nueva debe ser distinta.', 'La nueva debe ser distinta.'],
    [409, 'UNKNOWN', 'La contraseña temporal ya se cambió.', /ya se cambió/],
    [500, 'UNKNOWN', 'detalle interno', /Ocurrio un error/],
  ])('con %s %s muestra el motivo y no navega', async (status, code, message, shown) => {
    changeTemporaryPassword.mockRejectedValue(new ApiError(status, code, message));
    await submit();

    expect(await screen.findByText(shown)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('sin conexión lo dice y no navega', async () => {
    changeTemporaryPassword.mockRejectedValue(new Error('red'));
    await submit();

    expect(await screen.findByText(/Error de conexion/)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
