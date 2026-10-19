// apps/web/src/app/(protected)/layout.spec.tsx
import '@testing-library/jest-dom';
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import ProtectedLayout from './layout-client';

const replaceMock = jest.fn();
// Gate de navegación instantánea: el mock de useAuth es mutable para recorrer
// los estados de sesión (loading / no autenticado / autenticado).
interface MockAuthState {
  user: { id: string } | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

let currentAuth: MockAuthState = {
  user: { id: 'user-1' },
  isAuthenticated: true,
  isLoading: false,
};
let currentPathname = '/dashboard';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => currentPathname,
}));

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => currentAuth,
}));

jest.mock('@/components/layout/Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar" />,
}));

jest.mock('@/components/layout/TopHeader', () => ({
  TopHeader: () => <div data-testid="top-header" />,
}));

describe('ProtectedLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentAuth = { user: { id: 'user-1' }, isAuthenticated: true, isLoading: false };
    currentPathname = '/dashboard';
  });

  it('mientras se valida la sesión renderiza el fallback y NO monta chrome ni hijos', () => {
    currentAuth = { user: null, isAuthenticated: false, isLoading: true };

    render(
      <ProtectedLayout>
        <div>Contenido protegido</div>
      </ProtectedLayout>,
    );

    expect(screen.getByText('Validando sesión...')).toBeInTheDocument();
    // Ni el chrome del layout ni los hijos del subárbol protegido quedan montados
    expect(screen.queryByTestId('sidebar')).toBeNull();
    expect(screen.queryByTestId('top-header')).toBeNull();
    expect(screen.queryByText('Contenido protegido')).toBeNull();
    // El redirect solo dispara cuando la validación termina (isLoading=false)
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('sin sesión termina en redirect al login con next ya codificado', async () => {
    currentAuth = { user: null, isAuthenticated: false, isLoading: false };
    currentPathname = '/dashboard/auditoria';

    render(
      <ProtectedLayout>
        <div>Contenido protegido</div>
      </ProtectedLayout>,
    );

    // La puerta real del effect del layout: replace con next codificado
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith(
        `/auth/login?next=${encodeURIComponent('/dashboard/auditoria')}`,
      );
    });
    // El shell de validación queda en el sitio (sin suspender) mientras la ruta
    // se reemplaza: el árbol está comprometido, solo que sin chrome ni hijos.
    expect(screen.getByText('Validando sesión...')).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar')).toBeNull();
    expect(screen.queryByText('Contenido protegido')).toBeNull();
  });

  it('resuelve el gate y monta el árbol cuando el usuario queda autenticado', async () => {
    currentAuth = { user: null, isAuthenticated: false, isLoading: true };

    const { rerender } = render(
      <ProtectedLayout>
        <div>Contenido protegido</div>
      </ProtectedLayout>,
    );

    // Presesión: solo el fallback
    expect(screen.getByText('Validando sesión...')).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar')).toBeNull();
    expect(screen.queryByText('Contenido protegido')).toBeNull();

    // Sesión resuelta: el gate entrega el árbol y se reemplaza el fallback
    await act(async () => {
      currentAuth = { user: { id: 'user-1' }, isAuthenticated: true, isLoading: false };
      rerender(
        <ProtectedLayout>
          <div>Contenido protegido</div>
        </ProtectedLayout>,
      );
    });

    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('top-header')).toBeInTheDocument();
    expect(screen.getByText('Contenido protegido')).toBeInTheDocument();
    expect(screen.queryByText('Validando sesión...')).toBeNull();
    // Con sesión el layout no redirige
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
