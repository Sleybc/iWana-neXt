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

  it('should consultar la API y navegar al resultado seleccionado', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    (globalSearchApi.search as jest.Mock).mockResolvedValue({
      query: 'lili',
      tookMs: 10,
      groups: [
        {
          type: 'users',
          label: 'Usuarios',
          total: 2,
          items: [
            {
              id: 'user-1',
              type: 'user',
              title: 'Liliana Ruiz',
              subtitle: 'Empresa Demo · lili@empresa.com',
              meta: 'Administrador · Activo',
              route: '/users?tenant=empresa-demo&search=lili%40empresa.com&openUser=user-1',
              highlights: ['<mark>lili</mark>@empresa.com'],
            },
            {
              id: 'user-2',
              type: 'user',
              title: 'Lina Rojas',
              subtitle: 'Empresa Demo · lina@empresa.com',
              meta: 'Soporte · Activo',
              route: '/users?tenant=empresa-demo&search=lina%40empresa.com&openUser=user-2',
              highlights: [],
            },
          ],
        },
      ],
    });

    render(<GlobalSearch />);

    const input = screen.getByLabelText('Buscar en la plataforma');
    await user.click(input);
    await user.type(input, 'lili');

    await act(async () => {
      jest.advanceTimersByTime(200);
    });

    expect(globalSearchApi.search).toHaveBeenCalledWith('lili', 5, expect.any(Object));

    await screen.findAllByText('Liliana Ruiz');

    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(
        '/users?tenant=empresa-demo&search=lina%40empresa.com&openUser=user-2',
      );
    });
  });

  it('should abrir el buscador con Ctrl+K', async () => {
    render(<GlobalSearch />);

    const input = screen.getByLabelText('Buscar en la plataforma');
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

    (globalSearchApi.search as jest.Mock).mockRejectedValue(new Error('Typesense no disponible'));

    render(<GlobalSearch />);

    const input = screen.getByLabelText('Buscar en la plataforma');
    await user.click(input);
    await user.type(input, 'lili');

    await act(async () => {
      jest.advanceTimersByTime(200);
    });

    await screen.findByText('Typesense no disponible');
  });

  it('should limpiar la búsqueda al cambiar de ruta', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    const { rerender } = render(<GlobalSearch />);

    const input = screen.getByLabelText('Buscar en la plataforma');
    await user.click(input);
    await user.type(input, 'lili');

    expect(input).toHaveValue('lili');

    pathnameMock = '/users';
    searchParamsMock = new URLSearchParams('tenant=empresa-demo');
    rerender(<GlobalSearch />);

    await waitFor(() => {
      expect(input).toHaveValue('');
    });
  });
});
