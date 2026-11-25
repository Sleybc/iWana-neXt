import type { ButtonHTMLAttributes } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MfaSetupForm } from './MfaSetupForm';
import { ApiError } from '@/lib/api-client';

const mfaSetup = jest.fn();
const mfaVerifySetup = jest.fn();
const clearMfaSetupToken = jest.fn();
const replace = jest.fn();
const push = jest.fn();
const router = { replace, push };
let typeCode: (code: string) => void = () => undefined;

jest.mock('next/navigation', () => ({ useRouter: () => router }));
jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span role="img" aria-label={alt} data-src={src} />
  ),
}));
jest.mock('@iwana/ui', () => ({
  OtpInput: ({ value, onChange }: { value: string; onChange: (code: string) => void }) => {
    typeCode = onChange;
    return <output aria-label="Código">{value}</output>;
  },
  Button: ({ type, disabled, onClick, children }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type={type} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
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
  authApi: {
    mfaSetup: () => mfaSetup(),
    mfaVerifySetup: (code: string) => mfaVerifySetup(code),
    clearMfaSetupToken: () => clearMfaSetupToken(),
  },
}));

describe('MfaSetupForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mfaSetup.mockResolvedValue({ qrCodeBase64: 'data:image/png;base64,AA==', otpauthUri: 'x' });
  });
  afterEach(() => jest.useRealTimers());

  it.each([401, 409])('si el inicio responde %s vuelve al inicio de sesión', async (status) => {
    mfaSetup.mockRejectedValue(new ApiError(status, 'UNKNOWN', 'x'));
    await act(async () => void render(<MfaSetupForm />));

    expect(clearMfaSetupToken).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith('/auth/login');
  });

  it.each([
    [409, 'UNKNOWN', 'MFA ya está activo en esta cuenta.', 'MFA ya está activo en esta cuenta.'],
    [401, 'AUTH_SESSION_NOT_CURRENT', 'x', 'Tu sesión ya no es vigente. Inicia sesión de nuevo.'],
    [401, 'AUTH_MFA_SETUP_NOT_PENDING', 'x', /configuración .* venció\. Inicia sesión de nuevo/],
    [401, 'MFA_SETUP_TOKEN_MISSING', 'x', /configuración .* venció\. Inicia sesión de nuevo/],
    [401, 'UNKNOWN', 'Codigo MFA invalido.', /No fue posible confirmar tu acceso/],
  ])(
    'si la verificación responde %s %s explica el motivo y sale',
    async (status, code, message, shown) => {
      mfaVerifySetup.mockRejectedValue(new ApiError(status, code, message));
      await act(async () => void render(<MfaSetupForm />));
      await act(async () => typeCode('123456'));

      expect(screen.getByText(shown)).toBeInTheDocument();
      expect(clearMfaSetupToken).toHaveBeenCalled();
      act(() => void jest.advanceTimersByTime(2000));
      expect(replace).toHaveBeenCalledWith('/auth/login');
    },
  );

  it('un código erróneo permite reintentar', async () => {
    mfaVerifySetup.mockRejectedValue(new ApiError(401, 'AUTH_MFA_CODE_INVALID', 'sesión'));
    await act(async () => void render(<MfaSetupForm />));
    await act(async () => typeCode('123456'));

    expect(screen.getByText(/Código incorrecto/)).toBeInTheDocument();
    expect(clearMfaSetupToken).not.toHaveBeenCalled();
  });

  it('muestra el QR recibido y la clave manual extraída de la URI', async () => {
    mfaSetup.mockResolvedValue({
      qrCodeBase64: 'data:image/png;base64,BB==',
      otpauthUri: 'otpauth://totp/iWana:prueba?secret=JBSWY3DPEHPK3PXP&issuer=iWana',
    });
    const view = render(<MfaSetupForm />);
    expect(screen.getByText('Generando código QR...')).toBeInTheDocument();
    await act(async () => undefined);

    expect(screen.queryByText('Generando código QR...')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Código QR/ })).toHaveAttribute(
      'data-src',
      'data:image/png;base64,BB==',
    );
    expect(view.container.querySelector('code')).toHaveTextContent(/^JBSWY3DPEHPK3PXP$/);
  });

  it('si el inicio falla por otra causa lo explica y solo sale cuando se pide', async () => {
    mfaSetup.mockRejectedValue(new ApiError(500, 'UNKNOWN', 'detalle interno'));
    await act(async () => void render(<MfaSetupForm />));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'No se pudo iniciar la configuración MFA. Intenta de nuevo.',
    );
    expect(clearMfaSetupToken).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Volver al inicio de sesión' }));
    expect(replace).toHaveBeenCalledWith('/auth/login');
  });

  it('si se desmonta antes de que el inicio falle no navega ni borra el acceso', async () => {
    let fail: (error: Error) => void = () => undefined;
    mfaSetup.mockReturnValue(new Promise((_resolve, reject) => (fail = reject)));
    const view = render(<MfaSetupForm />);
    view.unmount();
    await act(async () => fail(new ApiError(401, 'UNKNOWN', 'x')));

    expect(mfaSetup).toHaveBeenCalledTimes(1);
    expect(clearMfaSetupToken).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('al activar confirma, descarta el acceso limitado y luego va al inicio de sesión', async () => {
    mfaVerifySetup.mockResolvedValue(undefined);
    await act(async () => void render(<MfaSetupForm />));
    await act(async () => typeCode('123456'));

    expect(mfaVerifySetup).toHaveBeenCalledWith('123456');
    expect(screen.getByText('MFA activado correctamente')).toBeInTheDocument();
    expect(clearMfaSetupToken).toHaveBeenCalledTimes(1);
    act(() => void jest.advanceTimersByTime(1799));
    expect(replace).not.toHaveBeenCalled();
    act(() => void jest.advanceTimersByTime(1));
    expect(replace).toHaveBeenCalledWith('/auth/login');
  });

  it('mientras verifica bloquea el envío', async () => {
    mfaVerifySetup.mockReturnValue(new Promise(() => undefined));
    await act(async () => void render(<MfaSetupForm />));
    await act(async () => typeCode('123456'));

    expect(screen.getByRole('button', { name: 'Activando MFA...' })).toBeDisabled();
  });

  it('un código incompleto no se envía ni con el formulario', async () => {
    await act(async () => void render(<MfaSetupForm />));
    await act(async () => typeCode('12345'));
    await act(async () => void fireEvent.submit(screen.getByRole('form')));

    expect(screen.getByLabelText('Código')).toHaveTextContent('12345');
    expect(screen.getByRole('button', { name: /^Activar/ })).toBeDisabled();
    expect(mfaVerifySetup).not.toHaveBeenCalled();
  });

  it('un 403 al verificar descarta el acceso y sale', async () => {
    mfaVerifySetup.mockRejectedValue(new ApiError(403, 'UNKNOWN', 'x'));
    await act(async () => void render(<MfaSetupForm />));
    await act(async () => typeCode('123456'));

    expect(screen.getByText(/Token de configuración expirado/)).toBeInTheDocument();
    expect(clearMfaSetupToken).toHaveBeenCalledTimes(1);
    act(() => void jest.advanceTimersByTime(2000));
    expect(replace).toHaveBeenCalledWith('/auth/login');
  });

  it.each([
    ['del servidor', new ApiError(500, 'UNKNOWN', 'x'), 'Error al activar MFA. Intenta de nuevo.'],
    ['de red', new TypeError('fetch failed'), 'Error de conexión. Verifica tu red.'],
  ])(
    'un fallo %s vacía el código, conserva el acceso y se limpia al reescribir',
    async (...row) => {
      const [, error, shown] = row;
      mfaVerifySetup.mockRejectedValue(error);
      await act(async () => void render(<MfaSetupForm />));
      await act(async () => typeCode('123456'));

      expect(screen.getByText(shown)).toBeInTheDocument();
      expect(screen.getByLabelText('Código')).toBeEmptyDOMElement();
      expect(clearMfaSetupToken).not.toHaveBeenCalled();
      act(() => void jest.advanceTimersByTime(5000));
      expect(replace).not.toHaveBeenCalled();

      await act(async () => typeCode('1'));
      expect(screen.queryByText(shown)).not.toBeInTheDocument();
    },
  );

  it('permite volver al inicio de sesión sin activar', async () => {
    await act(async () => void render(<MfaSetupForm />));
    fireEvent.click(screen.getByRole('button', { name: 'Volver al inicio de sesión' }));

    expect(push).toHaveBeenCalledWith('/auth/login');
    expect(mfaVerifySetup).not.toHaveBeenCalled();
  });
});
