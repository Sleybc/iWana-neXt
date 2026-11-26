import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { getPendingPlatformMfaLogin } from '@/lib/api-client';
import { MfaVerifyForm } from './MfaVerifyForm';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('./AuthProvider', () => ({ useAuth: () => ({ completeMfaLogin: jest.fn() }) }));
jest.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {},
  getPendingPlatformMfaLogin: jest.fn(),
}));

describe('MfaVerifyForm', () => {
  it('avisa y no acepta códigos si la recarga perdió el primer paso', () => {
    jest.mocked(getPendingPlatformMfaLogin).mockReturnValue(null);
    render(<MfaVerifyForm />);

    expect(screen.getByRole('alert')).toHaveTextContent('Vuelve al login para continuar.');
    screen.getAllByRole('textbox').forEach((input) => expect(input).toBeDisabled());
  });

  it('acepta códigos si el primer paso sigue vigente', () => {
    jest
      .mocked(getPendingPlatformMfaLogin)
      .mockReturnValue({ email: 'persona@example.invalid', password: 'x' });
    render(<MfaVerifyForm />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    screen.getAllByRole('textbox').forEach((input) => expect(input).toBeEnabled());
  });
});
