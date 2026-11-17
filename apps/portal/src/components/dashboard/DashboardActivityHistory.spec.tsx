import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserRole } from '@iwana/shared';
import { DashboardActivityHistory } from './DashboardActivityHistory';

const useAuthMock = jest.fn();
const listPage = jest.fn();

jest.mock('@/components/auth/AuthProvider', () => ({ useAuth: () => useAuthMock() }));
jest.mock('@/lib/api-client', () => ({
  auditApi: { listPage: (...args: unknown[]) => listPage(...args) },
}));

beforeEach(() => {
  listPage.mockReset();
});

it('usa el cursor de la respuesta para pedir la siguiente página', async () => {
  useAuthMock.mockReturnValue({ isLoading: false, user: { id: 'admin-id', role: UserRole.ADMIN } });
  listPage
    .mockResolvedValueOnce({ data: [], nextCursor: 'older-cursor', total: 21 })
    .mockResolvedValueOnce({ data: [], nextCursor: null, total: 21 });

  render(<DashboardActivityHistory />);
  await userEvent.click(await screen.findByRole('button', { name: 'Ver cambios anteriores' }));

  expect(listPage).toHaveBeenNthCalledWith(1, { limit: 20 });
  expect(listPage).toHaveBeenNthCalledWith(2, { limit: 20, cursor: 'older-cursor' });
  expect(
    await screen.findByRole('button', { name: 'Volver al inicio del historial' }),
  ).toBeVisible();
});

it('un perfil no autorizado no solicita el historial', () => {
  useAuthMock.mockReturnValue({
    isLoading: false,
    user: { id: 'support-id', role: UserRole.SUPPORT },
  });
  render(<DashboardActivityHistory />);
  expect(screen.getByText('No tienes acceso a este historial')).toBeVisible();
  expect(listPage).not.toHaveBeenCalled();
});
