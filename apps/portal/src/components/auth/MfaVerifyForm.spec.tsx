import { act, render, screen } from '@testing-library/react';
import { MfaVerifyForm } from './MfaVerifyForm';
import { ApiError } from '@/lib/api-client';

const completeMfaLogin = jest.fn();
const push = jest.fn();
const mockRouter = { push };
const mockAuth = { completeMfaLogin };
let typeCode: (code: string) => void = () => undefined;

jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
jest.mock('./AuthProvider', () => ({ useAuth: () => mockAuth }));
jest.mock('@iwana/ui', () => ({
  OtpInput: ({ onChange }: { onChange: (code: string) => void }) => {
    typeCode = onChange;
    return null;
  },
  Button: () => null,
  FormStatus: ({ message }: { message?: string }) => <p>{message}</p>,
}));
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
}));

async function verify(): Promise<void> {
  render(<MfaVerifyForm />);
  await act(async () => typeCode('123456'));
}

describe('MfaVerifyForm', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['AUTH_MFA_CODE_INVALID', 'detalle', 'Código incorrecto. Intenta de nuevo.'],
    ['MFA_CODE_INVALID', 'detalle', 'Código incorrecto. Intenta de nuevo.'],
    ['AUTH_ACCOUNT_LOCKED', 'Espera 15 minuto(s).', 'Espera 15 minuto(s).'],
    [
      'UNKNOWN',
      'Cuenta bloqueada: detalle interno',
      'No fue posible verificar tu ingreso. Revisa el código o inicia sesión de nuevo.',
    ],
  ])('ante un 401 %s decide por el código', async (code, message, shown) => {
    completeMfaLogin.mockRejectedValue(new ApiError(401, code, message));
    await verify();

    expect(screen.getByText(shown)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it.each([
    ['password_reset_required', '/auth/change-password'],
    ['authenticated', '/dashboard'],
  ])('con %s navega a %s', async (result, path) => {
    completeMfaLogin.mockResolvedValue(result);
    await verify();

    expect(push).toHaveBeenCalledWith(path);
  });
});
