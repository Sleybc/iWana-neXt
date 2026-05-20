import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UserManagementModal } from './UserManagementModal';
import { usersApi } from '@/lib/api-client';

jest.mock('@iwana/ui', () => {
  const ReactLib = require('react') as typeof import('react');

  return {
    Button: ({ children, loading, disabled, ...props }: Record<string, unknown>) => (
      <button {...props} disabled={Boolean(disabled) || Boolean(loading)}>
        {children as React.ReactNode}
      </button>
    ),
    Select: ReactLib.forwardRef<HTMLSelectElement, Record<string, unknown>>(function MockSelect(
      { id, name, value, onChange, onBlur, options = [] },
      ref,
    ) {
      return (
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
      );
    }),
  };
});

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
    usersApi: {
      getOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      changeLoginEmailAsAdmin: jest.fn(),
      resetPassword: jest.fn(),
    },
  };
});

describe('UserManagementModal', () => {
  const baseUser = {
    id: '00000000-0000-4000-a000-000000000001',
    email: 'usuario@empresa.com',
    role: 'NOC',
    status: 'ACTIVE',
    tenantId: 'tenant-test',
    mfaEnabled: false,
    mfaRequired: false,
    emailVerified: true,
    passwordResetRequired: false,
    lastLoginAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    firstName: 'Carlos',
    lastName: 'Gomez',
    phone: '+573001234567',
    jobTitle: 'Soporte',
    documentType: 'CC',
    avatarUrl: null,
  };

  const usersApiMock = usersApi as jest.Mocked<typeof usersApi>;

  beforeEach(() => {
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        randomUUID: () => 'idem-test-uuid',
      },
      configurable: true,
    });

    jest.clearAllMocks();
    usersApiMock.getOne.mockResolvedValue(baseUser as never);
  });

  it('carga detalle del usuario al abrir y muestra correo de acceso editable', async () => {
    render(
      <UserManagementModal
        open
        tenantSlug="acme"
        tenantName="Acme"
        user={baseUser as never}
        onClose={jest.fn()}
        onSaved={jest.fn()}
        onDeleted={jest.fn()}
      />,
    );

    expect(await screen.findByDisplayValue('usuario@empresa.com')).toBeInTheDocument();
    expect(usersApiMock.getOne).toHaveBeenCalledWith('acme', baseUser.id);
  });

  it('actualiza correo de acceso y propaga el usuario actualizado al padre', async () => {
    const onSaved = jest.fn();
    const updatedUser = { ...baseUser, email: 'nuevo.acceso@empresa.com' };
    usersApiMock.changeLoginEmailAsAdmin.mockResolvedValue(updatedUser as never);

    render(
      <UserManagementModal
        open
        tenantSlug="acme"
        tenantName="Acme"
        user={baseUser as never}
        onClose={jest.fn()}
        onSaved={onSaved}
        onDeleted={jest.fn()}
      />,
    );

    const loginEmailInput = await screen.findByLabelText('Correo de acceso');
    fireEvent.change(loginEmailInput, { target: { value: 'nuevo.acceso@empresa.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar correo de acceso' }));

    await waitFor(() => {
      expect(usersApiMock.changeLoginEmailAsAdmin).toHaveBeenCalledWith(
        'acme',
        baseUser.id,
        {
          email: 'nuevo.acceso@empresa.com',
          syncCompanyContactEmail: true,
        },
        expect.any(String),
      );
    });

    expect(onSaved).toHaveBeenCalledWith(updatedUser);
  });

  it('genera contraseña temporal y la muestra en el modal', async () => {
    const onSaved = jest.fn();
    usersApiMock.resetPassword.mockResolvedValue({
      temporaryPassword: 'temp1234567890abcdef',
    } as never);

    render(
      <UserManagementModal
        open
        tenantSlug="acme"
        tenantName="Acme"
        user={baseUser as never}
        onClose={jest.fn()}
        onSaved={onSaved}
        onDeleted={jest.fn()}
      />,
    );

    await screen.findByLabelText('Correo de acceso');
    fireEvent.click(screen.getByRole('button', { name: 'Generar contraseña temporal' }));

    await waitFor(() => {
      expect(usersApiMock.resetPassword).toHaveBeenCalledWith(
        'acme',
        baseUser.id,
        {},
        expect.any(String),
      );
    });

    expect(screen.getByLabelText('Contraseña temporal generada')).toHaveTextContent(
      'temp1234567890abcdef',
    );
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({
        id: baseUser.id,
        passwordResetRequired: true,
      }),
    );
  });

  it('elimina el usuario y propaga el cierre al padre', async () => {
    const onDeleted = jest.fn();
    const onClose = jest.fn();
    usersApiMock.remove.mockResolvedValue(undefined as never);

    render(
      <UserManagementModal
        open
        tenantSlug="acme"
        tenantName="Acme"
        user={baseUser as never}
        onClose={onClose}
        onSaved={jest.fn()}
        onDeleted={onDeleted}
      />,
    );

    await screen.findByLabelText('Correo de acceso');
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar usuario' }));

    await waitFor(() => {
      expect(usersApiMock.remove).toHaveBeenCalledWith('acme', baseUser.id);
    });

    expect(onDeleted).toHaveBeenCalledWith(baseUser.id);
    expect(onClose).toHaveBeenCalled();
  });
});
