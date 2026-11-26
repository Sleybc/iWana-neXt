import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlatformRole, UserStatus, type PlatformUserDirectoryEntry } from '@iwana/shared';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';
import PlatformUsersPage from './page';

/** El foco está dentro de `element` y no se perdió en `body`. */
const expectFocusIn = (element: HTMLElement) => {
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toContainElement(element);
};

const COPY = PLATFORM_UI_COPY.platformUserDirectory;
const mockDirectory = jest.fn();

jest.mock('@/lib/api-client', () => ({
  platformUsersApi: { directory: (...args: unknown[]) => mockDirectory(...args) },
}));

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'u-yo', type: 'platform', role: PlatformRole.IWANA_SUPPORT },
    refreshProfile: jest.fn(),
  }),
}));

jest.mock('@/components/layout/PageHeader', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

const account = (id: string): PlatformUserDirectoryEntry => ({
  id,
  firstName: 'Cuenta',
  lastName: id,
  role: PlatformRole.IWANA_SUPPORT,
  status: UserStatus.ACTIVE,
  mfaEnabled: true,
  passwordResetRequired: false,
  lastLoginAt: null,
});

const page = (total: number) => ({
  items: Array.from({ length: Math.min(total, 20) }, (_, i) => account(`c${i}`)),
  total,
  pageSize: 20,
});

const status = () =>
  screen.getAllByRole('status').find((node) => node.classList.contains('sr-only'))!;

beforeEach(() => {
  mockDirectory.mockReset();
});

describe('PlatformUsersPage — anuncio de resultados', () => {
  it('no anuncia la carga inicial ni cada tecla; anuncia el total tras buscar', async () => {
    const user = userEvent.setup();
    mockDirectory.mockResolvedValueOnce(page(5)).mockResolvedValueOnce(page(2));
    render(<PlatformUsersPage />);
    await screen.findByRole('heading', { name: COPY.total(5) });
    expect(status()).toHaveTextContent('');

    await user.type(screen.getByLabelText(COPY.searchLabel), 'Cuenta');
    expect(status()).toHaveTextContent('');
    expect(mockDirectory).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: COPY.searchAction }));
    await waitFor(() => expect(status()).toHaveTextContent(COPY.found(2)));
  });

  it('anuncia el vacío de un filtro sin resultados', async () => {
    const user = userEvent.setup();
    mockDirectory.mockResolvedValueOnce(page(5)).mockResolvedValueOnce(page(0));
    render(<PlatformUsersPage />);
    await screen.findByRole('heading', { name: COPY.total(5) });

    await user.click(screen.getByRole('combobox', { name: COPY.statusFilter }));
    await user.click(screen.getByRole('option', { name: COPY.suspendedGroup }));
    await waitFor(() => expect(status()).toHaveTextContent(COPY.found(0)));
  });
});

describe('PlatformUsersPage — limpiar sin búsqueda aplicada', () => {
  it('no deja un anuncio pendiente que salte al cambiar de página', async () => {
    const user = userEvent.setup();
    mockDirectory.mockResolvedValue(page(25));
    render(<PlatformUsersPage />);
    await screen.findByRole('heading', { name: COPY.total(25) });

    await user.type(screen.getByLabelText(COPY.searchLabel), 'Cuenta');
    await user.click(screen.getByRole('button', { name: COPY.clearFilters }));
    await user.click(screen.getByRole('button', { name: COPY.next }));
    await waitFor(() => expect(mockDirectory).toHaveBeenCalledTimes(2));
    await screen.findByText(COPY.page(2, 2));
    expect(status()).toHaveTextContent('');
  });
});

describe('PlatformUsersPage — foco al reintentar', () => {
  it('lleva el foco al encabezado de resultados si el reintento carga', async () => {
    const user = userEvent.setup();
    mockDirectory.mockRejectedValueOnce(new Error('caída')).mockResolvedValueOnce(page(3));
    render(<PlatformUsersPage />);

    await user.click(await screen.findByRole('button', { name: PLATFORM_UI_COPY.dashboard.retry }));
    const heading = await screen.findByRole('heading', { name: COPY.total(3) });
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it('lleva el foco al aviso si el reintento vuelve a fallar', async () => {
    const user = userEvent.setup();
    mockDirectory.mockRejectedValue(new Error('caída'));
    render(<PlatformUsersPage />);

    await user.click(await screen.findByRole('button', { name: PLATFORM_UI_COPY.dashboard.retry }));
    await waitFor(() => expect(mockDirectory).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expectFocusIn(screen.getByRole('button', { name: PLATFORM_UI_COPY.dashboard.retry })),
    );
  });
});
