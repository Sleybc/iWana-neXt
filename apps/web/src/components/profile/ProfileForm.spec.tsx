import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProfileForm } from './ProfileForm';

jest.mock('@iwana/ui', () => {
  const ReactLib = require('react') as typeof import('react');

  return {
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
          {label ? <label htmlFor={id as string | undefined}>{label as React.ReactNode}</label> : null}
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
          {label ? <label htmlFor={id as string | undefined}>{label as React.ReactNode}</label> : null}
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
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar email' }));
    fireEvent.change(screen.getByLabelText('Nuevo email de acceso'), {
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
});
