import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { changePasswordSchema } from '@iwana/shared';
import { ChangePasswordForm } from './ChangePasswordForm';

const useAuthMock = jest.fn();
const changePasswordMock = jest.fn();
const logoutMock = jest.fn();

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => useAuthMock(),
}));

jest.mock('@/lib/api-client', () => {
  class MockApiError extends Error {
    status: number;
    details?: unknown;
    constructor(status: number, message: string, details?: unknown) {
      super(message);
      Object.setPrototypeOf(this, MockApiError.prototype);
      this.name = 'ApiError';
      this.status = status;
      this.details = details;
    }
  }

  return {
    ApiError: MockApiError,
    authApi: {
      changePassword: (...args: unknown[]) => changePasswordMock(...args),
    },
  };
});

function mockAuth() {
  useAuthMock.mockReturnValue({
    user: {
      id: 'user-uuid-001',
      emailHash: 'hash-ficticio',
      role: 'ADMIN',
      type: 'tenant',
      tenantId: 'tenant-uuid-001',
      displayName: 'Ada Lovelace',
      subtitle: '',
      firstName: 'Ada',
      lastName: 'Lovelace',
    },
    isAuthenticated: true,
    isLoading: false,
    login: jest.fn(),
    completeMfaLogin: jest.fn(),
    logout: logoutMock,
    refreshProfile: jest.fn(),
  });
}

function fillValidForm(current = 'clave-actual-1', next = 'Nueva-clave-123!') {
  fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: current } });
  fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: next } });
  fireEvent.change(screen.getByLabelText('Confirmar nueva contraseña'), {
    target: { value: next },
  });
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar contraseña' }));
}

function mockApiError(status: number, message: string, details?: unknown): Error {
  const { ApiError } = jest.requireMock('@/lib/api-client') as {
    ApiError: new (status: number, message: string, details?: unknown) => Error;
  };
  return new ApiError(status, message, details);
}

describe('ChangePasswordForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth();
    changePasswordMock.mockResolvedValue(undefined);
  });

  it('CPF-01 (P-14) — un 400 de política muestra el mensaje del servidor', async () => {
    // El detalle vigente lo define el servidor (ChangePasswordDto, Ola 2):
    // Nest lo entrega como arreglo en `details.message` y el componente lo
    // muestra tal cual. Regex: el texto exacto es política versionable.
    changePasswordMock.mockRejectedValue(
      mockApiError(400, 'Solicitud inválida', {
        message: ['La contraseña debe incluir mayúscula, minúscula, número y carácter especial.'],
      }),
    );

    render(<ChangePasswordForm />);
    fillValidForm();
    submit();

    expect(
      await screen.findByText(/mayúscula, minúscula, número y carácter especial/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('No fue posible cambiar la contraseña. Intenta de nuevo.'),
    ).not.toBeInTheDocument();
  });

  it('CPF-02 (P-05/C-3) — tras el cambio voluntario la sesión se cierra', async () => {
    render(<ChangePasswordForm />);
    fillValidForm();
    submit();

    await waitFor(() => {
      expect(changePasswordMock).toHaveBeenCalledWith('clave-actual-1', 'Nueva-clave-123!');
    });
    await waitFor(() => {
      expect(logoutMock).toHaveBeenCalled();
    });
  });

  it('renderiza los tres campos de credencial', () => {
    render(<ChangePasswordForm />);

    expect(screen.getByRole('heading', { name: 'Cambiar contraseña' })).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña actual')).toBeInTheDocument();
    expect(screen.getByLabelText('Nueva contraseña')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirmar nueva contraseña')).toBeInTheDocument();
  });

  it('la confirmación distinta bloquea el envío', async () => {
    render(<ChangePasswordForm />);

    fireEvent.change(screen.getByLabelText('Contraseña actual'), {
      target: { value: 'clave-actual-1' },
    });
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), {
      target: { value: 'nueva-clave-123' },
    });
    fireEvent.change(screen.getByLabelText('Confirmar nueva contraseña'), {
      target: { value: 'otra-clave-456' },
    });
    submit();

    expect(await screen.findByText('Las contraseñas no coinciden')).toBeInTheDocument();
    expect(changePasswordMock).not.toHaveBeenCalled();
  });

  it('la nueva contraseña corta muestra el mínimo del cliente', async () => {
    render(<ChangePasswordForm />);
    fillValidForm('clave-actual-1', 'corta');
    submit();

    expect(
      await screen.findByText('La nueva contraseña debe tener al menos 10 caracteres'),
    ).toBeInTheDocument();
    expect(changePasswordMock).not.toHaveBeenCalled();
  });

  it('credencial actual inválida muestra el mensaje controlado', async () => {
    changePasswordMock.mockRejectedValue(
      new (
        jest.requireMock('@/lib/api-client') as {
          ApiError: new (status: number, message: string) => Error;
        }
      ).ApiError(401, 'no autorizado'),
    );

    render(<ChangePasswordForm />);
    fillValidForm();
    submit();

    expect(await screen.findByText('La contraseña actual es incorrecta.')).toBeInTheDocument();
  });

  it('el cambio exitoso notifica y limpia los campos', async () => {
    render(<ChangePasswordForm />);
    fillValidForm();
    submit();

    expect(await screen.findByText('Contraseña actualizada correctamente.')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña actual')).toHaveValue('');
    expect(screen.getByLabelText('Nueva contraseña')).toHaveValue('');
    expect(screen.getByLabelText('Confirmar nueva contraseña')).toHaveValue('');
  });

  it('el aviso de éxito se oculta solo tras unos segundos', async () => {
    render(<ChangePasswordForm />);
    fillValidForm();
    submit();

    await screen.findByText('Contraseña actualizada correctamente.');
    await waitFor(
      () => {
        expect(screen.queryByText('Contraseña actualizada correctamente.')).not.toBeInTheDocument();
      },
      { timeout: 6000 },
    );
  });

  it('el 400 con detalle plano muestra el mensaje del servidor', async () => {
    changePasswordMock.mockRejectedValue(
      mockApiError(400, 'Solicitud inválida', {
        message: 'La nueva contraseña debe tener entre 10 y 128 caracteres.',
      }),
    );

    render(<ChangePasswordForm />);
    fillValidForm();
    submit();

    expect(await screen.findByText(/entre 10 y 128 caracteres/)).toBeInTheDocument();
  });

  it('el 400 sin detalle muestra el mensaje del error', async () => {
    changePasswordMock.mockRejectedValue(mockApiError(400, 'No se aceptó la nueva contraseña.'));

    render(<ChangePasswordForm />);
    fillValidForm();
    submit();

    expect(await screen.findByText('No se aceptó la nueva contraseña.')).toBeInTheDocument();
  });

  it('el 400 con detalle vacío muestra el mensaje del error', async () => {
    changePasswordMock.mockRejectedValue(
      mockApiError(400, 'No se aceptó la nueva contraseña.', {
        message: [],
      }),
    );

    render(<ChangePasswordForm />);
    fillValidForm();
    submit();

    expect(await screen.findByText('No se aceptó la nueva contraseña.')).toBeInTheDocument();
  });

  it('el 409 muestra el conflicto con el estado de la cuenta', async () => {
    changePasswordMock.mockRejectedValue(mockApiError(409, 'Conflicto'));

    render(<ChangePasswordForm />);
    fillValidForm();
    submit();

    expect(
      await screen.findByText('La solicitud entra en conflicto con el estado actual de la cuenta.'),
    ).toBeInTheDocument();
  });

  it('un 500 muestra el mensaje del servidor', async () => {
    changePasswordMock.mockRejectedValue(
      mockApiError(500, 'Error interno al rotar la credencial.'),
    );

    render(<ChangePasswordForm />);
    fillValidForm();
    submit();

    expect(await screen.findByText('Error interno al rotar la credencial.')).toBeInTheDocument();
  });

  it('un fallo de red muestra el error genérico', async () => {
    changePasswordMock.mockRejectedValue(new Error('red caída'));

    render(<ChangePasswordForm />);
    fillValidForm();
    submit();

    expect(
      await screen.findByText('No fue posible cambiar la contraseña. Intenta de nuevo.'),
    ).toBeInTheDocument();
  });

  it('formulario con errores visibles sin violaciones de accesibilidad', async () => {
    const { container } = render(<ChangePasswordForm />);

    submit();
    await screen.findByText('La contraseña actual es requerida');

    expect(await axe(container)).toHaveNoViolations();
  });

  it('CA-P08 (HLD-MOD04 v1.2 §15) — ambas entradas al cambio de contraseña aplican la misma política', () => {
    // Tabla de vectores compartida: ChangePasswordForm consume
    // changePasswordSchema de @iwana/shared; app/auth/change-password/page.tsx
    // importa el mismo esquema (política única P-14, Ola 2) y
    // app/auth/reset-password/page.tsx declara su esquema local con el mismo
    // núcleo (min 10 + complejidad NIST). currentPassword solo exige no vacío.
    const validos = ['Nueva-clave-123!', 'Segura-2026$Xx', 'Abcdef123!x'];
    for (const newPassword of validos) {
      const parsed = changePasswordSchema.safeParse({
        currentPassword: 'clave-actual-1',
        newPassword,
        confirmPassword: newPassword,
      });
      expect(parsed.success).toBe(true);
    }

    const invalidos: Array<[string, string]> = [
      ['corta-1A!', 'mínimo 10'],
      ['nueva-clave-123!', 'mayúscula'],
      ['NUEVA-CLAVE-123!', 'minúscula'],
      ['Nueva-clave-ABC!', 'número'],
      ['NuevaClave1234', 'especial'],
    ];
    for (const [newPassword, motivo] of invalidos) {
      const parsed = changePasswordSchema.safeParse({
        currentPassword: 'clave-actual-1',
        newPassword,
        confirmPassword: newPassword,
      });
      expect(`${newPassword} (${motivo})`).toBeDefined();
      expect(parsed.success).toBe(false);
    }

    // currentPassword solo requerido: una credencial legada corta verifica.
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'x',
        newPassword: 'Nueva-clave-123!',
        confirmPassword: 'Nueva-clave-123!',
      }).success,
    ).toBe(true);
    expect(
      changePasswordSchema.safeParse({
        currentPassword: '',
        newPassword: 'Nueva-clave-123!',
        confirmPassword: 'Nueva-clave-123!',
      }).success,
    ).toBe(false);

    // Enlace estático: cambio obligatorio usa el esquema compartido.
    const appDir = path.join(__dirname, '..', '..', 'app', 'auth');
    const changePage = fs.readFileSync(path.join(appDir, 'change-password', 'page.tsx'), 'utf8');
    expect(changePage).toContain('changePasswordSchema');
    expect(changePage).toContain('@iwana/shared');

    // Enlace estático: reset local conserva el mismo núcleo min 10 + NIST.
    const resetPage = fs.readFileSync(path.join(appDir, 'reset-password', 'page.tsx'), 'utf8');
    expect(resetPage).toContain('min(10');
    expect(resetPage).toContain('/[A-Z]/');
    expect(resetPage).toContain('/[a-z]/');
    expect(resetPage).toContain('/[0-9]/');
    expect(resetPage).toContain('/[^A-Za-z0-9]/');
  });
});
