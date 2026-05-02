import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { LoginForm } from './LoginForm';

const pushMock = jest.fn();
const loginMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

jest.mock('./AuthProvider', () => ({
  useAuth: () => ({
    login: loginMock,
  }),
}));

function LoginFormWrapper({ initialTenantSlug = '' }: { initialTenantSlug?: string }) {
  const [tenantSlug, setTenantSlug] = useState(initialTenantSlug);

  return (
    <LoginForm
      tenantSlug={tenantSlug}
      tenantLocked={false}
      onTenantSlugChange={(value) => setTenantSlug(value)}
    />
  );
}

describe('LoginForm (portal)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('muestra empresa bloqueada cuando viene por variable de entorno', () => {
    render(<LoginForm tenantSlug="isp-env" tenantLocked onTenantSlugChange={jest.fn()} />);

    const tenantInput = screen.getByPlaceholderText('ejemplo: isp-demo');
    expect(tenantInput).toBeDisabled();
    expect(screen.getByText(/Empresa bloqueada por configuración de entorno/i)).toBeInTheDocument();
  });

  it('bloquea submit local si la empresa está vacía y no llama login', async () => {
    render(<LoginForm tenantSlug="" tenantLocked={false} onTenantSlugChange={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: 'admin@isp-demo.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'Admin123*' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    await waitFor(() => {
      expect(screen.getByText('Ingresa el identificador de la empresa.')).toBeInTheDocument();
    });

    expect(loginMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('normaliza empresa (trim + lowercase) antes de invocar login', async () => {
    loginMock.mockResolvedValue('authenticated');

    render(<LoginFormWrapper />);

    fireEvent.change(screen.getByPlaceholderText('ejemplo: isp-demo'), {
      target: { value: '  ISP-DEMO  ' },
    });
    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: 'admin@isp-demo.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'Admin123*' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith('admin@isp-demo.com', 'Admin123*', 'isp-demo');
    });

    expect(pushMock).toHaveBeenCalledWith('/dashboard');
  });
});
