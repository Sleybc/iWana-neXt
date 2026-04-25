/**
 * Tests unitarios de DropdownUser — UserAvatar.
 *
 * Verifica:
 * - UserAvatar muestra la inicial en mayúsculas del displayName.
 * - UserAvatar muestra 'U' como fallback cuando displayName está vacío.
 *
 * MOCKS:
 * - next/navigation → useRouter stub.
 * - @/components/auth/AuthProvider → useAuth stub.
 * - @iwana/ui → cn stub (retorna strings de clase concatenados).
 * - lucide-react → stubs de iconos.
 *
 * SEGURIDAD: Sin PII real — datos ficticios de prueba.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { platformRoleToLabel, UserAvatar } from './DropdownUser';

// ---------------------------------------------------------------------------
// Mocks de dependencias externas requeridas por el módulo DropdownUser
// ---------------------------------------------------------------------------

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({
    user: null,
    logout: jest.fn(),
  }),
}));

jest.mock('@iwana/ui', () => ({
  cn: (...classes: (string | boolean | undefined)[]) => classes.filter(Boolean).join(' '),
}));

jest.mock('lucide-react', () => ({
  ChevronDown: () => <span data-testid="icon-chevron" />,
  LogOut: () => <span data-testid="icon-logout" />,
  Settings: () => <span data-testid="icon-settings" />,
  User: () => <span data-testid="icon-user" />,
  Headphones: () => <span data-testid="icon-headphones" />,
}));

// ---------------------------------------------------------------------------
// Tests de UserAvatar
// ---------------------------------------------------------------------------

describe('UserAvatar', () => {
  it('muestra la inicial en mayúsculas del displayName', () => {
    render(<UserAvatar displayName="Juan Pérez" />);
    expect(screen.getByText('J')).toBeInTheDocument();
  });

  it('muestra "U" como fallback cuando displayName está vacío', () => {
    render(<UserAvatar displayName="" />);
    expect(screen.getByText('U')).toBeInTheDocument();
  });
});

describe('platformRoleToLabel', () => {
  it('mapea roles de plataforma a labels visibles en español', () => {
    expect(platformRoleToLabel('SYSTEM_ADMIN')).toBe('Administrador de plataforma');
    expect(platformRoleToLabel('IWANA_SUPPORT')).toBe('Soporte iWana');
  });

  it('conserva roles desconocidos para no ocultar datos inesperados', () => {
    expect(platformRoleToLabel('CUSTOM_ROLE')).toBe('CUSTOM_ROLE');
  });
});
