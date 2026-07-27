import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SecuritySettings } from './SecuritySettings';

type MockAuthApi = {
  changePassword: jest.Mock;
  mfaSetup: jest.Mock;
  mfaVerifySetup: jest.Mock;
  mfaDisable: jest.Mock;
};

type MockPlatformUsersApi = {
  me: jest.Mock;
};

var mockAuthApi: MockAuthApi;
var mockPlatformUsersApi: MockPlatformUsersApi;

jest.mock('@/lib/api-client', () => {
  mockAuthApi = {
    changePassword: jest.fn(),
    mfaSetup: jest.fn(),
    mfaVerifySetup: jest.fn(),
    mfaDisable: jest.fn(),
  };
  mockPlatformUsersApi = {
    me: jest.fn(),
  };

  return {
    ApiError: class ApiError extends Error {
      constructor(
        public readonly status: number,
        public readonly code: string,
        message: string,
      ) {
        super(message);
      }
    },
    authApi: mockAuthApi,
    platformUsersApi: mockPlatformUsersApi,
  };
});

describe('SecuritySettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlatformUsersApi.me.mockResolvedValue({ mfaEnabled: false });
  });

  // ── Carga inicial ────────────────────────────────────────────────────────

  describe('carga inicial', () => {
    it('muestra "Verificando estado MFA" mientras la API está pendiente', () => {
      mockPlatformUsersApi.me.mockReturnValue(new Promise(() => {}));
      render(<SecuritySettings />);
      expect(screen.getByText(/verificando estado mfa/i)).toBeInTheDocument();
    });

    it('muestra "Deshabilitado" cuando MFA está apagado', async () => {
      render(<SecuritySettings />);
      expect(await screen.findByText(/deshabilitado/i)).toBeInTheDocument();
    });

    it('muestra "Habilitado" cuando MFA está activo', async () => {
      mockPlatformUsersApi.me.mockResolvedValue({ mfaEnabled: true });
      render(<SecuritySettings />);
      expect(await screen.findByText(/habilitado/i)).toBeInTheDocument();
    });

    it('muestra el botón Configurar MFA solo cuando MFA está deshabilitado', async () => {
      render(<SecuritySettings />);
      expect(await screen.findByRole('button', { name: /configurar mfa/i })).toBeInTheDocument();
    });

    it('no muestra Configurar MFA cuando MFA ya está activo', async () => {
      mockPlatformUsersApi.me.mockResolvedValue({ mfaEnabled: true });
      render(<SecuritySettings />);
      await screen.findByText(/habilitado/i);
      expect(screen.queryByRole('button', { name: /configurar mfa/i })).not.toBeInTheDocument();
    });
  });

  // ── Cambio de contraseña ─────────────────────────────────────────────────

  describe('cambio de contraseña', () => {
    // Helper: obtiene los tres inputs del formulario de cambio de contraseña (los primeros 3 del formulario)
    function getPasswordFormInputs() {
      const form = document.querySelector('form') as HTMLFormElement;
      const inputs = Array.from(
        form.querySelectorAll('input[type="password"]'),
      ) as HTMLInputElement[];
      return { currentInput: inputs[0]!, newInput: inputs[1]!, confirmInput: inputs[2]! };
    }

    it('envía el formulario con datos válidos y muestra mensaje de éxito', async () => {
      const user = userEvent.setup();
      mockAuthApi.changePassword.mockResolvedValue(undefined);
      render(<SecuritySettings />);
      await waitFor(() => screen.getByText(/deshabilitado/i));

      const { currentInput, newInput, confirmInput } = getPasswordFormInputs();
      await user.type(currentInput, 'OldPass123!');
      await user.type(newInput, 'NewPass456!');
      await user.type(confirmInput, 'NewPass456!');
      await user.click(screen.getByRole('button', { name: /actualizar contraseña/i }));

      await waitFor(() => {
        expect(mockAuthApi.changePassword).toHaveBeenCalledWith('OldPass123!', 'NewPass456!');
      });
      expect(await screen.findByRole('alert')).toHaveTextContent(/contraseña cambiada/i);
    });

    it('muestra error de API cuando changePassword falla', async () => {
      const user = userEvent.setup();
      const { ApiError } = jest.requireMock('@/lib/api-client') as {
        ApiError: new (status: number, code: string, message: string) => Error;
      };
      mockAuthApi.changePassword.mockRejectedValue(
        new ApiError(400, 'WRONG_PASSWORD', 'Contraseña actual incorrecta.'),
      );
      render(<SecuritySettings />);
      await waitFor(() => screen.getByText(/deshabilitado/i));

      const { currentInput, newInput, confirmInput } = getPasswordFormInputs();
      await user.type(currentInput, 'WrongPass');
      await user.type(newInput, 'NewPass456!');
      await user.type(confirmInput, 'NewPass456!');
      await user.click(screen.getByRole('button', { name: /actualizar contraseña/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/contraseña actual incorrecta/i);
    });

    it('no envía si las contraseñas no coinciden', async () => {
      const user = userEvent.setup();
      render(<SecuritySettings />);
      await waitFor(() => screen.getByText(/deshabilitado/i));

      const { currentInput, newInput, confirmInput } = getPasswordFormInputs();
      await user.type(currentInput, 'OldPass123!');
      await user.type(newInput, 'NewPass456!');
      await user.type(confirmInput, 'DifferentPass');
      await user.click(screen.getByRole('button', { name: /actualizar contraseña/i }));

      await waitFor(() => {
        expect(mockAuthApi.changePassword).not.toHaveBeenCalled();
      });
    });

    it('limpia el formulario tras un cambio exitoso', async () => {
      const user = userEvent.setup();
      mockAuthApi.changePassword.mockResolvedValue(undefined);
      render(<SecuritySettings />);
      await waitFor(() => screen.getByText(/deshabilitado/i));

      const { currentInput, newInput, confirmInput } = getPasswordFormInputs();
      await user.type(currentInput, 'OldPass123!');
      await user.type(newInput, 'NewPass456!');
      await user.type(confirmInput, 'NewPass456!');
      await user.click(screen.getByRole('button', { name: /actualizar contraseña/i }));

      await waitFor(() => {
        expect(mockAuthApi.changePassword).toHaveBeenCalled();
      });
      expect(currentInput).toHaveValue('');
    });
  });

  // ── Configuración de MFA ─────────────────────────────────────────────────

  describe('configuración MFA', () => {
    it('muestra QR y campo TOTP al hacer clic en Configurar MFA', async () => {
      const user = userEvent.setup();
      mockAuthApi.mfaSetup.mockResolvedValue({
        qrCodeBase64: 'data:image/png;base64,ABC',
        otpauthUri: 'otpauth://totp/test',
      });
      render(<SecuritySettings />);
      await waitFor(() => screen.getByRole('button', { name: /configurar mfa/i }));

      await user.click(screen.getByRole('button', { name: /configurar mfa/i }));

      await waitFor(() => {
        expect(screen.getByAltText(/qr de configuración mfa/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /verificar mfa/i })).toBeInTheDocument();
      });
    });

    it('llama a mfaVerifySetup y muestra éxito al verificar el código', async () => {
      const user = userEvent.setup();
      mockAuthApi.mfaSetup.mockResolvedValue({
        qrCodeBase64: 'data:image/png;base64,ABC',
        otpauthUri: 'otpauth://totp/test',
      });
      mockAuthApi.mfaVerifySetup.mockResolvedValue({ mfaEnabled: true });
      render(<SecuritySettings />);
      await waitFor(() => screen.getByRole('button', { name: /configurar mfa/i }));
      await user.click(screen.getByRole('button', { name: /configurar mfa/i }));
      await waitFor(() => screen.getByRole('button', { name: /verificar mfa/i }));

      // OtpInput: cada dígito tiene aria-label="Dígito X de 6"
      for (let i = 1; i <= 6; i++) {
        await user.type(screen.getByLabelText(`Dígito ${i} de 6`), String(i));
      }

      await user.click(screen.getByRole('button', { name: /verificar mfa/i }));

      await waitFor(() => {
        expect(mockAuthApi.mfaVerifySetup).toHaveBeenCalled();
      });
      expect(await screen.findByRole('alert')).toHaveTextContent(/mfa habilitado/i);
    });

    it('el botón Verificar MFA está deshabilitado si el código tiene menos de 6 dígitos', async () => {
      const user = userEvent.setup();
      mockAuthApi.mfaSetup.mockResolvedValue({
        qrCodeBase64: 'data:image/png;base64,ABC',
        otpauthUri: 'otpauth://totp/test',
      });
      render(<SecuritySettings />);
      await waitFor(() => screen.getByRole('button', { name: /configurar mfa/i }));
      await user.click(screen.getByRole('button', { name: /configurar mfa/i }));
      await waitFor(() => screen.getByRole('button', { name: /verificar mfa/i }));

      expect(screen.getByRole('button', { name: /verificar mfa/i })).toBeDisabled();
    });

    it('muestra error cuando mfaVerifySetup falla', async () => {
      const user = userEvent.setup();
      const { ApiError } = jest.requireMock('@/lib/api-client') as {
        ApiError: new (status: number, code: string, message: string) => Error;
      };
      mockAuthApi.mfaSetup.mockResolvedValue({
        qrCodeBase64: 'data:image/png;base64,ABC',
        otpauthUri: 'otpauth://totp/test',
      });
      mockAuthApi.mfaVerifySetup.mockRejectedValue(
        new ApiError(400, 'INVALID_TOTP', 'Código TOTP inválido.'),
      );
      render(<SecuritySettings />);
      await waitFor(() => screen.getByRole('button', { name: /configurar mfa/i }));
      await user.click(screen.getByRole('button', { name: /configurar mfa/i }));
      await waitFor(() => screen.getByRole('button', { name: /verificar mfa/i }));

      for (let i = 1; i <= 6; i++) {
        await user.type(screen.getByLabelText(`Dígito ${i} de 6`), String(i));
      }

      await user.click(screen.getByRole('button', { name: /verificar mfa/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/código totp inválido/i);
    });
  });

  // ── Deshabilitar MFA ─────────────────────────────────────────────────────

  describe('deshabilitar MFA', () => {
    beforeEach(() => {
      mockPlatformUsersApi.me.mockResolvedValue({ mfaEnabled: true });
    });

    it('muestra el formulario de deshabilitación cuando MFA está activo', async () => {
      render(<SecuritySettings />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /deshabilitar mfa/i })).toBeInTheDocument();
      });
    });

    // Helper: obtiene los inputs del panel de deshabilitar MFA por su nombre de campo
    function getDisableMfaInputs() {
      const allPasswordInputs = document.querySelectorAll(
        'input[autocomplete="current-password"]',
      ) as NodeListOf<HTMLInputElement>;
      // El último input de current-password pertenece al panel de deshabilitar MFA
      const disablePasswordInput = allPasswordInputs[allPasswordInputs.length - 1]!;
      const mfaCodeInput = document.querySelector(
        'input[autocomplete="one-time-code"]',
      ) as HTMLInputElement;
      return { disablePasswordInput, mfaCodeInput };
    }

    it('llama a mfaDisable con los valores correctos y muestra éxito', async () => {
      const user = userEvent.setup();
      mockAuthApi.mfaDisable.mockResolvedValue(undefined);
      render(<SecuritySettings />);
      await waitFor(() => screen.getByRole('button', { name: /deshabilitar mfa/i }));

      const { disablePasswordInput, mfaCodeInput } = getDisableMfaInputs();
      await user.type(disablePasswordInput, 'MyPass123!');
      await user.type(mfaCodeInput, '123456');
      await user.click(screen.getByRole('button', { name: /deshabilitar mfa/i }));

      await waitFor(() => {
        expect(mockAuthApi.mfaDisable).toHaveBeenCalledWith('MyPass123!', '123456');
      });
      expect(await screen.findByRole('alert')).toHaveTextContent(/mfa deshabilitado/i);
    });

    it('muestra error cuando mfaDisable falla', async () => {
      const user = userEvent.setup();
      const { ApiError } = jest.requireMock('@/lib/api-client') as {
        ApiError: new (status: number, code: string, message: string) => Error;
      };
      mockAuthApi.mfaDisable.mockRejectedValue(
        new ApiError(400, 'WRONG_CODE', 'Código MFA incorrecto.'),
      );
      render(<SecuritySettings />);
      await waitFor(() => screen.getByRole('button', { name: /deshabilitar mfa/i }));

      const { disablePasswordInput, mfaCodeInput } = getDisableMfaInputs();
      await user.type(disablePasswordInput, 'MyPass123!');
      await user.type(mfaCodeInput, '000000');
      await user.click(screen.getByRole('button', { name: /deshabilitar mfa/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/código mfa incorrecto/i);
    });
  });
});
