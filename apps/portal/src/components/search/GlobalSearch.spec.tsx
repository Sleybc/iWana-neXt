import '@testing-library/jest-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GlobalSearch } from './GlobalSearch';
import { globalSearchApi } from '@/lib/api-client';

const pushMock = jest.fn();
let pathnameMock = '/dashboard';
let searchParamsMock = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => pathnameMock,
  useSearchParams: () => searchParamsMock,
}));

jest.mock('@/lib/api-client', () => ({
  globalSearchApi: {
    search: jest.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(
      public readonly status: number,
      public readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

describe('GlobalSearch', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    pathnameMock = '/dashboard';
    searchParamsMock = new URLSearchParams();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('should consultar la búsqueda global y navegar al resultado seleccionado', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    (globalSearchApi.search as jest.Mock).mockResolvedValue({
      query: 'lili',
      tookMs: 12,
      groups: [
        {
          type: 'users',
          label: 'Usuarios',
          total: 1,
          items: [
            {
              id: 'user-1',
              type: 'user',
              title: 'Liliana Ruiz',
              subtitle: 'lili@empresa.com · NOC',
              meta: 'ADMIN',
              route: '/dashboard/users?search=lili%40empresa.com',
              highlights: ['<mark>lili</mark>@empresa.com'],
            },
          ],
        },
      ],
    });

    render(<GlobalSearch />);

    const input = screen.getByLabelText('Buscar en el portal empresarial');
    await user.click(input);
    await user.type(input, 'lili');

    await act(async () => {
      jest.advanceTimersByTime(200);
    });

    expect(globalSearchApi.search).toHaveBeenCalledWith('lili', 5, expect.any(Object));

    await screen.findByText('Liliana Ruiz');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/dashboard/users?search=lili%40empresa.com');
    });
  });

  it('should abrir el buscador con Ctrl+K', async () => {
    render(<GlobalSearch />);

    const input = screen.getByLabelText('Buscar en el portal empresarial');
    expect(document.activeElement).not.toBe(input);

    await act(async () => {
      const keyboardEvent = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true });
      document.dispatchEvent(keyboardEvent);
    });

    await waitFor(() => {
      expect(document.activeElement).toBe(input);
    });
  });

  it('should mostrar error recuperable cuando falla la consulta', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    (globalSearchApi.search as jest.Mock).mockRejectedValue(new Error('No fue posible buscar'));

    render(<GlobalSearch />);

    const input = screen.getByLabelText('Buscar en el portal empresarial');
    await user.click(input);
    await user.type(input, 'lili');

    await act(async () => {
      jest.advanceTimersByTime(200);
    });

    await screen.findByText('No fue posible buscar');
  });

  it('should limpiar la búsqueda al cambiar de ruta', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const { rerender } = render(<GlobalSearch />);

    const input = screen.getByLabelText('Buscar en el portal empresarial');
    await user.click(input);
    await user.type(input, 'lili');

    expect(input).toHaveValue('lili');

    pathnameMock = '/dashboard/users';
    searchParamsMock = new URLSearchParams('search=lili%40empresa.com');
    rerender(<GlobalSearch />);

    await waitFor(() => {
      expect(input).toHaveValue('');
    });
  });
});
