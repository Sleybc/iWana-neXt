import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SecuritySettings } from './SecuritySettings';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

const copy = PLATFORM_UI_COPY.settings.security;

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

  describe('layout', () => {
    it('expone contraseña y verificación como dos secciones hermanas', async () => {
      render(<SecuritySettings />);
      expect(await screen.findByRole('heading', { name: copy.passwordTitle })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: copy.mfaTitle })).toBeInTheDocument();
      const passwordSection = screen
        .getByRole('heading', { name: copy.passwordTitle })
        .closest('section');
      const mfaSection = screen.getByRole('heading', { name: copy.mfaTitle }).closest('section');
      expect(passwordSection).not.toBe(mfaSection);
      expect(passwordSection?.parentElement).toBe(mfaSection?.parentElement);
    });
  });

  describe('carga inicial', () => {
    it('muestra comprobando verificación en dos pasos mientras la API está pendiente', () => {
      mockPlatformUsersApi.me.mockReturnValue(new Promise(() => {}));
      render(<SecuritySettings />);
      expect(screen.getByText(copy.mfaLoading)).toBeInTheDocument();
      expect(screen.queryByText(/mfa/i)).not.toBeInTheDocument();
    });

    it('muestra Desactivada cuando la verificación está apagada', async () => {
      render(<SecuritySettings />);
      expect(await screen.findByText(new RegExp(copy.mfaStatusOff, 'i'))).toBeInTheDocument();
    });

    it('muestra Activada cuando la verificación está activa', async () => {
      mockPlatformUsersApi.me.mockResolvedValue({ mfaEnabled: true });
      render(<SecuritySettings />);
      expect(await screen.findByText(new RegExp(copy.mfaStatusOn, 'i'))).toBeInTheDocument();
    });

    it('muestra el CTA de activar solo cuando está desactivada', async () => {
      render(<SecuritySettings />);
      expect(await screen.findByRole('button', { name: copy.mfaSetupCta })).toBeInTheDocument();
    });

    it('no muestra el CTA de activar cuando ya está activa', async () => {
      mockPlatformUsersApi.me.mockResolvedValue({ mfaEnabled: true });
      render(<SecuritySettings />);
      await screen.findByText(new RegExp(copy.mfaStatusOn, 'i'));
      expect(screen.queryByRole('button', { name: copy.mfaSetupCta })).not.toBeInTheDocument();
    });

    it('usa vocabulario de verificación en dos pasos sin MFA/TOTP/Authenticator', async () => {
      render(<SecuritySettings />);
      expect(await screen.findByRole('heading', { name: copy.mfaTitle })).toBeInTheDocument();
      expect(screen.getByText(copy.mfaHelp)).toBeInTheDocument();
      expect(screen.queryByText(/\bMFA\b/)).not.toBeInTheDocument();
      expect(screen.queryByText(/TOTP/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Authenticator/i)).not.toBeInTheDocument();
    });
  });

  describe('cambio de contraseña', () => {
    function getPasswordFormInputs() {
      const form = document.querySelector('form') as HTMLFormElement;
      const inputs = Array.from(
        form.querySelectorAll('input[type="password"]'),
      ) as HTMLInputElement[];
      return { currentInput: inputs[0]!, newInput: inputs[1]!, confirmInput: inputs[2]! };
    }

    it('envía el formulario con datos válidos y muestra mensaje de éxito breve', async () => {
      const user = userEvent.setup();
      mockAuthApi.changePassword.mockResolvedValue(undefined);
      render(<SecuritySettings />);
      await waitFor(() => screen.getByText(new RegExp(copy.mfaStatusOff, 'i')));

      const { currentInput, newInput, confirmInput } = getPasswordFormInputs();
      await user.type(currentInput, 'OldPass123!');
      await user.type(newInput, 'NewPass456!');
      await user.type(confirmInput, 'NewPass456!');
      await user.click(screen.getByRole('button', { name: copy.passwordCta }));

      await waitFor(() => {
        expect(mockAuthApi.changePassword).toHaveBeenCalledWith('OldPass123!', 'NewPass456!');
      });
      expect(await screen.findByText(copy.passwordSuccess)).toBeInTheDocument();
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
      await waitFor(() => screen.getByText(new RegExp(copy.mfaStatusOff, 'i')));

      const { currentInput, newInput, confirmInput } = getPasswordFormInputs();
      await user.type(currentInput, 'WrongPass');
      await user.type(newInput, 'NewPass456!');
      await user.type(confirmInput, 'NewPass456!');
      await user.click(screen.getByRole('button', { name: copy.passwordCta }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/contraseña actual incorrecta/i);
    });

    it('no envía si las contraseñas no coinciden', async () => {
      const user = userEvent.setup();
      render(<SecuritySettings />);
      await waitFor(() => screen.getByText(new RegExp(copy.mfaStatusOff, 'i')));

      const { currentInput, newInput, confirmInput } = getPasswordFormInputs();
      await user.type(currentInput, 'OldPass123!');
      await user.type(newInput, 'NewPass456!');
      await user.type(confirmInput, 'DifferentPass');
      await user.click(screen.getByRole('button', { name: copy.passwordCta }));

      await waitFor(() => {
        expect(mockAuthApi.changePassword).not.toHaveBeenCalled();
      });
    });

    it('limpia el formulario tras un cambio exitoso', async () => {
      const user = userEvent.setup();
      mockAuthApi.changePassword.mockResolvedValue(undefined);
      render(<SecuritySettings />);
      await waitFor(() => screen.getByText(new RegExp(copy.mfaStatusOff, 'i')));

      const { currentInput, newInput, confirmInput } = getPasswordFormInputs();
      await user.type(currentInput, 'OldPass123!');
      await user.type(newInput, 'NewPass456!');
      await user.type(confirmInput, 'NewPass456!');
      await user.click(screen.getByRole('button', { name: copy.passwordCta }));

      await waitFor(() => {
        expect(mockAuthApi.changePassword).toHaveBeenCalled();
      });
      expect(currentInput).toHaveValue('');
    });
  });

  describe('verificación en dos pasos — activar', () => {
    it('muestra QR y confirma código; otpauth queda oculto fuera del camino feliz', async () => {
      const user = userEvent.setup();
      mockAuthApi.mfaSetup.mockResolvedValue({
        qrCodeBase64: 'data:image/png;base64,ABC',
        otpauthUri: 'otpauth://totp/test',
      });
      render(<SecuritySettings />);
      await waitFor(() => screen.getByRole('button', { name: copy.mfaSetupCta }));

      await user.click(screen.getByRole('button', { name: copy.mfaSetupCta }));

      await waitFor(() => {
        expect(screen.getByAltText(copy.mfaQrAlt)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: copy.mfaConfirmCta })).toBeInTheDocument();
      });
      expect(screen.getByText(copy.mfaPostSetup)).toBeInTheDocument();
      expect(screen.queryByText(/otpauth/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/TOTP/i)).not.toBeInTheDocument();
    });

    it('llama a mfaVerifySetup y muestra éxito al confirmar el código', async () => {
      const user = userEvent.setup();
      mockAuthApi.mfaSetup.mockResolvedValue({
        qrCodeBase64: 'data:image/png;base64,ABC',
        otpauthUri: 'otpauth://totp/test',
      });
      mockAuthApi.mfaVerifySetup.mockResolvedValue({ mfaEnabled: true });
      render(<SecuritySettings />);
      await waitFor(() => screen.getByRole('button', { name: copy.mfaSetupCta }));
      await user.click(screen.getByRole('button', { name: copy.mfaSetupCta }));
      await waitFor(() => screen.getByRole('button', { name: copy.mfaConfirmCta }));

      for (let i = 1; i <= 6; i++) {
        await user.type(screen.getByLabelText(`Dígito ${i} de 6`), String(i));
      }

      await user.click(screen.getByRole('button', { name: copy.mfaConfirmCta }));

      await waitFor(() => {
        expect(mockAuthApi.mfaVerifySetup).toHaveBeenCalled();
      });
      expect(await screen.findByText(copy.mfaSuccessOn)).toBeInTheDocument();
    });

    it('el botón Confirmar código está deshabilitado si el código tiene menos de 6 dígitos', async () => {
      const user = userEvent.setup();
      mockAuthApi.mfaSetup.mockResolvedValue({
        qrCodeBase64: 'data:image/png;base64,ABC',
        otpauthUri: 'otpauth://totp/test',
      });
      render(<SecuritySettings />);
      await waitFor(() => screen.getByRole('button', { name: copy.mfaSetupCta }));
      await user.click(screen.getByRole('button', { name: copy.mfaSetupCta }));
      await waitFor(() => screen.getByRole('button', { name: copy.mfaConfirmCta }));

      expect(screen.getByRole('button', { name: copy.mfaConfirmCta })).toBeDisabled();
    });

    it('muestra error canónico cuando mfaVerifySetup falla', async () => {
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
      await waitFor(() => screen.getByRole('button', { name: copy.mfaSetupCta }));
      await user.click(screen.getByRole('button', { name: copy.mfaSetupCta }));
      await waitFor(() => screen.getByRole('button', { name: copy.mfaConfirmCta }));

      for (let i = 1; i <= 6; i++) {
        await user.type(screen.getByLabelText(`Dígito ${i} de 6`), String(i));
      }

      await user.click(screen.getByRole('button', { name: copy.mfaConfirmCta }));

      expect(await screen.findByRole('alert')).toHaveTextContent(copy.mfaErrorVerify);
      expect(screen.queryByText(/TOTP/i)).not.toBeInTheDocument();
    });
  });

  describe('verificación en dos pasos — desactivar', () => {
    beforeEach(() => {
      mockPlatformUsersApi.me.mockResolvedValue({ mfaEnabled: true });
    });

    it('muestra el formulario de desactivación cuando está activa', async () => {
      render(<SecuritySettings />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: copy.mfaDisableCta })).toBeInTheDocument();
      });
      expect(screen.getByLabelText(copy.mfaCodeLabel)).toBeInTheDocument();
    });

    function getDisableMfaInputs() {
      const allPasswordInputs = document.querySelectorAll(
        'input[autocomplete="current-password"]',
      ) as NodeListOf<HTMLInputElement>;
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
      await waitFor(() => screen.getByRole('button', { name: copy.mfaDisableCta }));

      const { disablePasswordInput, mfaCodeInput } = getDisableMfaInputs();
      await user.type(disablePasswordInput, 'MyPass123!');
      await user.type(mfaCodeInput, '123456');
      await user.click(screen.getByRole('button', { name: copy.mfaDisableCta }));

      await waitFor(() => {
        expect(mockAuthApi.mfaDisable).toHaveBeenCalledWith('MyPass123!', '123456');
      });
      expect(await screen.findByText(copy.mfaSuccessOff)).toBeInTheDocument();
    });

    it('muestra error canónico cuando mfaDisable falla', async () => {
      const user = userEvent.setup();
      const { ApiError } = jest.requireMock('@/lib/api-client') as {
        ApiError: new (status: number, code: string, message: string) => Error;
      };
      mockAuthApi.mfaDisable.mockRejectedValue(
        new ApiError(400, 'WRONG_CODE', 'Código MFA incorrecto.'),
      );
      render(<SecuritySettings />);
      await waitFor(() => screen.getByRole('button', { name: copy.mfaDisableCta }));

      const { disablePasswordInput, mfaCodeInput } = getDisableMfaInputs();
      await user.type(disablePasswordInput, 'MyPass123!');
      await user.type(mfaCodeInput, '000000');
      await user.click(screen.getByRole('button', { name: copy.mfaDisableCta }));

      expect(await screen.findByRole('alert')).toHaveTextContent(copy.mfaErrorDisable);
      expect(screen.queryByText(/\bMFA\b/)).not.toBeInTheDocument();
    });
  });
});
