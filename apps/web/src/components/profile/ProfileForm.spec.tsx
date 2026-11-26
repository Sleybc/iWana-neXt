import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ProfileForm } from './ProfileForm';

jest.mock('@iwana/ui', () => {
  const ReactLib = require('react') as typeof import('react');

  return {
    ...jest.requireActual('@iwana/ui'),
    Button: ({ children, loading, disabled, ...props }: Record<string, unknown>) => (
      <button {...props} disabled={Boolean(disabled) || Boolean(loading)}>
        {children as React.ReactNode}
      </button>
    ),
    Input: ReactLib.forwardRef<HTMLInputElement, Record<string, unknown>>(function MockInput(
      { id, label, error, containerClassName: _containerClassName, ...props },
      ref,
    ) {
      return (
        <div>
          {label ? (
            <label htmlFor={id as string | undefined}>{label as React.ReactNode}</label>
          ) : null}
          <input id={id as string | undefined} ref={ref} {...props} />
          {error ? <p>{error as React.ReactNode}</p> : null}
        </div>
      );
    }),
    Select: ReactLib.forwardRef<HTMLSelectElement, Record<string, unknown>>(function MockSelect(
      { id, label, name, value, onChange, onBlur, options = [] },
      ref,
    ) {
      return (
        <div>
          {label ? (
            <label htmlFor={id as string | undefined}>{label as React.ReactNode}</label>
          ) : null}
          <select
            id={id as string | undefined}
            name={name as string | undefined}
            value={(value as string | undefined) ?? ''}
            onChange={(event) =>
              (onChange as ((nextValue: string) => void) | undefined)?.(event.target.value)
            }
            onBlur={onBlur as React.FocusEventHandler<HTMLSelectElement> | undefined}
            ref={ref}
          >
            {(options as Array<{ value: string; label: string }>).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      );
    }),
  };
});

const refreshProfileMock = jest.fn();
const logoutMock = jest.fn();

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({
    refreshProfile: refreshProfileMock,
    logout: logoutMock,
  }),
}));

jest.mock('@/lib/api-client', () => {
  class ApiError extends Error {
    constructor(
      public readonly status: number,
      public readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = 'ApiError';
    }
  }

  return {
    ApiError,
    platformUsersApi: {
      me: jest.fn(),
      updateMe: jest.fn(),
      changeLoginEmail: jest.fn(),
      changePassword: jest.fn(),
    },
  };
});

describe('ProfileForm', () => {
  const { platformUsersApi } = jest.requireMock('@/lib/api-client') as {
    platformUsersApi: {
      me: jest.Mock;
      updateMe: jest.Mock;
      changeLoginEmail: jest.Mock;
      changePassword: jest.Mock;
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    platformUsersApi.me.mockResolvedValue({
      id: 'platform-user-1',
      email: 'admin@iwana.co',
      role: 'SYSTEM_ADMIN',
      status: 'ACTIVE',
      mfaEnabled: false,
      firstName: 'Admin',
      lastName: 'Iwana',
      phone: null,
      timezone: 'America/Bogota',
      language: 'es-CO',
      lastLoginAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('muestra una causa clara cuando la contraseña actual no coincide al cambiar el correo', async () => {
    const { ApiError } = jest.requireMock('@/lib/api-client') as {
      ApiError: new (status: number, code: string, message: string) => Error;
    };
    platformUsersApi.changeLoginEmail.mockRejectedValue(
      new ApiError(
        400,
        'BAD_REQUEST',
        'La contraseña actual no coincide con la que usas para iniciar sesión.',
      ),
    );

    render(<ProfileForm />);

    await screen.findByText('admin@iwana.co');
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar correo' }));
    fireEvent.change(screen.getByLabelText('Nuevo correo de acceso'), {
      target: { value: 'nuevo@iwana.co' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña actual'), {
      target: { value: 'Passw0rd!Segura' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar correo de acceso' }));

    expect(
      await screen.findByText(
        'La contraseña actual no coincide con la que usas para iniciar sesión.',
      ),
    ).toBeInTheDocument();
  });

  it('muestra una causa clara cuando la contraseña actual no coincide al cambiar la contraseña', async () => {
    const { ApiError } = jest.requireMock('@/lib/api-client') as {
      ApiError: new (status: number, code: string, message: string) => Error;
    };
    platformUsersApi.changePassword.mockRejectedValue(
      new ApiError(
        401,
        'UNAUTHORIZED',
        'La contraseña actual no coincide con la que usas para iniciar sesión.',
      ),
    );

    render(<ProfileForm />);

    await screen.findByText('admin@iwana.co');
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    fireEvent.change(screen.getByLabelText('Contraseña actual'), {
      target: { value: 'Passw0rd!Segura' },
    });
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), {
      target: { value: 'NuevaPass!2026' },
    });
    fireEvent.change(screen.getByLabelText('Confirmar nueva contraseña'), {
      target: { value: 'NuevaPass!2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    await waitFor(() => {
      expect(platformUsersApi.changePassword).toHaveBeenCalledWith({
        currentPassword: 'Passw0rd!Segura',
        newPassword: 'NuevaPass!2026',
      });
    });
    expect(
      await screen.findByText(
        'La contraseña actual no coincide con la que usas para iniciar sesión.',
      ),
    ).toBeInTheDocument();
  });

  it('anuncia el perfil guardado en una región de estado', async () => {
    platformUsersApi.updateMe.mockImplementation(async (payload: object) => ({
      ...(await platformUsersApi.me()),
      ...payload,
    }));
    render(<ProfileForm />);

    const firstName = await screen.findByLabelText('Nombres');
    await waitFor(() => expect(firstName).toHaveValue('Admin'));
    fireEvent.change(firstName, { target: { value: 'Administra' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    const message = await screen.findByText('Perfil actualizado correctamente.');
    expect(message.closest('[role="status"]')).not.toBeNull();
  });

  it('confirma el cambio de correo fuera del formulario, que se cierra', async () => {
    platformUsersApi.changeLoginEmail.mockResolvedValue({ email: 'nuevo@iwana.co' });
    render(<ProfileForm />);

    await screen.findByText('admin@iwana.co');
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar correo' }));
    fireEvent.change(screen.getByLabelText('Nuevo correo de acceso'), {
      target: { value: 'nuevo@iwana.co' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña actual'), {
      target: { value: 'Passw0rd!Segura' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar correo de acceso' }));

    expect(await screen.findByText('nuevo@iwana.co')).toBeInTheDocument();
    const message = await screen.findByText('Correo de acceso actualizado correctamente.');
    expect(message).toBeVisible();
    expect(message.closest('[role="status"]')).not.toBeNull();
    expect(document.getElementById('profile-email-form')).toBeNull();
  });

  describe('cambio de contraseña', () => {
    const SUCCESS = 'Contraseña actualizada. Debes iniciar sesión de nuevo.';
    const section = () => screen.getByRole('region', { name: 'Seguridad de la cuenta' });
    const passwordForm = () => document.getElementById('profile-password-form');
    const toggle = () =>
      within(section())
        .getAllByRole('button', { name: /^(Cambiar contraseña|Cerrar)$/ })
        .find((button) => button.hasAttribute('aria-expanded')) as HTMLElement;

    async function openForm() {
      render(<ProfileForm />);
      await screen.findByText('admin@iwana.co');
      fireEvent.click(toggle());
    }

    function fillAndSubmit(confirmPassword = 'NuevaPass!2026') {
      fireEvent.change(screen.getByLabelText('Contraseña actual'), {
        target: { value: 'Passw0rd!Segura' },
      });
      fireEvent.change(screen.getByLabelText('Nueva contraseña'), {
        target: { value: 'NuevaPass!2026' },
      });
      fireEvent.change(screen.getByLabelText('Confirmar nueva contraseña'), {
        target: { value: confirmPassword },
      });
      fireEvent.submit(passwordForm() as HTMLElement);
    }

    const flush = () => act(async () => jest.advanceTimersByTimeAsync(0));

    afterEach(() => {
      jest.useRealTimers();
    });

    it('envía el cambio una vez y cierra la sesión', async () => {
      platformUsersApi.changePassword.mockResolvedValue(undefined);
      await openForm();
      jest.useFakeTimers();
      fillAndSubmit();
      await flush();

      expect(platformUsersApi.changePassword).toHaveBeenCalledTimes(1);
      expect(platformUsersApi.changePassword).toHaveBeenCalledWith({
        currentPassword: 'Passw0rd!Segura',
        newPassword: 'NuevaPass!2026',
      });
      expect(logoutMock).not.toHaveBeenCalled();

      await act(async () => jest.advanceTimersByTimeAsync(2000));
      expect(logoutMock).toHaveBeenCalledTimes(1);
    });

    it('confirma el resultado mientras la sesión sigue abierta', async () => {
      platformUsersApi.changePassword.mockResolvedValue(undefined);
      await openForm();
      jest.useFakeTimers();
      fillAndSubmit();
      await flush();

      expect(screen.getByText(SUCCESS)).toBeVisible();
    });

    it('no envía si la confirmación no coincide', async () => {
      await openForm();
      fillAndSubmit('OtraPass!2026');

      expect(await screen.findByText('Las contraseñas no coinciden')).toBeInTheDocument();
      expect(platformUsersApi.changePassword).not.toHaveBeenCalled();
      expect(logoutMock).not.toHaveBeenCalled();
    });

    it('no conserva las contraseñas tras el cambio', async () => {
      platformUsersApi.changePassword.mockResolvedValue(undefined);
      await openForm();
      jest.useFakeTimers();
      fillAndSubmit();
      await flush();

      if (!passwordForm()) fireEvent.click(toggle());
      for (const label of ['Contraseña actual', 'Nueva contraseña', 'Confirmar nueva contraseña']) {
        expect(screen.getByLabelText(label)).toHaveValue('');
      }
    });

    it('si falla sin causa conocida avisa, conserva el formulario y no cierra la sesión', async () => {
      platformUsersApi.changePassword.mockRejectedValue(new Error('network'));
      await openForm();
      jest.useFakeTimers();
      fillAndSubmit();
      await flush();

      expect(screen.getByRole('alert')).toHaveTextContent('No fue posible cambiar la contraseña.');
      expect(passwordForm()).toBeInTheDocument();
      expect(screen.queryByText(SUCCESS)).not.toBeInTheDocument();

      await act(async () => jest.advanceTimersByTimeAsync(2000));
      expect(logoutMock).not.toHaveBeenCalled();
    });
  });
});
