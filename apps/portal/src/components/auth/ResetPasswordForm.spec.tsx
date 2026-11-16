import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError, authApi } from '@/lib/api-client';
import { ResetPasswordForm } from './ResetPasswordForm';

let searchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
}));

const VALID_PASSWORD = 'Clave-Segura-2026';
const TECHNICAL_TERMS = /token|backend|login/i;

function renderWith(query: string) {
  searchParams = new URLSearchParams(query);
  return render(<ResetPasswordForm />);
}

async function fillPasswords(user: ReturnType<typeof userEvent.setup>, password = VALID_PASSWORD) {
  await user.type(screen.getByLabelText('Nueva contraseña'), password);
  await user.type(screen.getByLabelText('Confirmar contraseña'), password);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ResetPasswordForm', () => {
  it('en modo invitación muestra el título, el texto y el botón de crear', () => {
    renderWith('tenant=isp-demo&token=abc123&origen=invitacion');
    expect(screen.getByRole('heading', { level: 1, name: 'Crea tu contraseña' })).toBeVisible();
    expect(
      screen.getByText('Elige una contraseña para entrar al portal de tu empresa'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Crear contraseña' })).toBeVisible();
  });

  it('sin la marca de invitación conserva el restablecimiento', () => {
    renderWith('tenant=isp-demo&token=abc123');
    expect(screen.getByRole('heading', { level: 1, name: 'Nueva contraseña' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Restablecer contraseña' })).toBeVisible();
  });

  it('oculta empresa y código cuando llegan en el enlace, pero los envía', async () => {
    const resetSpy = jest
      .spyOn(authApi, 'resetPassword')
      .mockResolvedValue({ message: 'Contrasena restablecida correctamente.' });
    const user = userEvent.setup();
    renderWith('tenant=isp-demo&token=abc123&origen=invitacion');

    expect(screen.queryByLabelText('Empresa')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/token|código/i)).not.toBeInTheDocument();

    await fillPasswords(user);
    await user.click(screen.getByRole('button', { name: 'Crear contraseña' }));

    await waitFor(() =>
      expect(resetSpy).toHaveBeenCalledWith('abc123', VALID_PASSWORD, undefined, 'isp-demo'),
    );
  });

  it('muestra el campo empresa si el enlace no la trae', () => {
    renderWith('token=abc123');
    expect(screen.getByLabelText('Empresa')).toBeVisible();
  });

  it('sin código en el enlace explica que no es válido y ofrece pedir otro', () => {
    renderWith('tenant=isp-demo&origen=invitacion');
    expect(
      screen.getByText('El enlace no es válido o ya venció. Pide uno nuevo.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pedir un enlace nuevo' })).toHaveAttribute(
      'href',
      '/auth/forgot-password',
    );
    expect(screen.queryByRole('button', { name: 'Crear contraseña' })).not.toBeInTheDocument();
  });

  it('un enlace vencido que rechaza la API lleva al mismo aviso', async () => {
    jest
      .spyOn(authApi, 'resetPassword')
      .mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Token de reset expirado.'));
    const user = userEvent.setup();
    renderWith('tenant=isp-demo&token=abc123');
    await fillPasswords(user);
    await user.click(screen.getByRole('button', { name: 'Restablecer contraseña' }));

    expect(
      await screen.findByText('El enlace no es válido o ya venció. Pide uno nuevo.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Token de reset/)).not.toBeInTheDocument();
  });

  it('mantiene la validación de la contraseña', async () => {
    const resetSpy = jest.spyOn(authApi, 'resetPassword');
    const user = userEvent.setup();
    renderWith('tenant=isp-demo&token=abc123&origen=invitacion');
    await fillPasswords(user, 'corta');
    await user.click(screen.getByRole('button', { name: 'Crear contraseña' }));

    expect(await screen.findByText('Mínimo 10 caracteres.')).toBeInTheDocument();
    expect(resetSpy).not.toHaveBeenCalled();
  });

  it('tras crear la contraseña por invitación confirma y lleva a iniciar sesión', async () => {
    jest
      .spyOn(authApi, 'resetPassword')
      .mockResolvedValue({ message: 'Contrasena restablecida correctamente.' });
    const user = userEvent.setup();
    renderWith('tenant=isp-demo&token=abc123&origen=invitacion');
    await fillPasswords(user);
    await user.click(screen.getByRole('button', { name: 'Crear contraseña' }));

    expect(
      await screen.findByText('Tu contraseña quedó lista. Ya puedes entrar.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute(
      'href',
      '/auth/login',
    );
    expect(screen.queryByLabelText('Nueva contraseña')).not.toBeInTheDocument();
  });

  it.each([
    ['formulario', 'tenant=isp-demo&token=abc123&origen=invitacion'],
    ['enlace inválido', 'tenant=isp-demo'],
  ])('no muestra términos técnicos en el %s', (_label, query) => {
    const { container } = renderWith(query);
    expect(container.textContent ?? '').not.toMatch(TECHNICAL_TERMS);
    expect(screen.getByRole('link', { name: 'Volver al inicio de sesión' })).toHaveAttribute(
      'href',
      '/auth/login',
    );
  });
});
