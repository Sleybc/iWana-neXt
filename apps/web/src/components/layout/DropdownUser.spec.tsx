/**
 * Tests de DropdownUser (consola plataforma) + platformRoleToLabel.
 *
 * CA-S1-12-R / CA-S1-13-R / asChild: ejercen el SUT real (sin mock de DropdownUser
 * ni de @iwana/ui). Solo se mockean dependencias externas (auth, navigation, Link).
 *
 * SEGURIDAD: sin PII real ni credenciales — datos ficticios de prueba.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DropdownUser, platformRoleToLabel } from './DropdownUser';

const logoutMock = jest.fn().mockResolvedValue(undefined);
const pushMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...props
  }: React.PropsWithChildren<{ href: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({
    user: {
      displayName: 'Operador Prueba',
      role: 'SYSTEM_ADMIN',
    },
    logout: logoutMock,
  }),
}));

async function openUserMenu(user: ReturnType<typeof userEvent.setup>) {
  const trigger = screen.getByRole('button', { name: 'Menú de usuario' });
  await user.click(trigger);
  await waitFor(() => {
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });
  return trigger;
}

describe('Avatar del trigger (contrato Avatar v1.0)', () => {
  it('muestra las iniciales canónicas del displayName ("Operador Prueba" → "OP")', () => {
    render(<DropdownUser />);
    const trigger = screen.getByRole('button', { name: 'Menú de usuario' });
    expect(trigger).toHaveTextContent('OP');
  });

  it('es decorativo porque el nombre visible está adyacente', () => {
    render(<DropdownUser />);
    const trigger = screen.getByRole('button', { name: 'Menú de usuario' });
    const avatar = trigger.querySelector('div[aria-hidden="true"]');
    expect(avatar).not.toBeNull();
    expect(avatar).toHaveTextContent('OP');
    expect(trigger.querySelector('[role="img"]')).toBeNull();
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

describe('DropdownUser (CA-S1-12-R / CA-S1-13-R / CA-S1-ROV / asChild)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('CA-S1-12-R: Escape cierra el menú y restaura el foco al trigger', async () => {
    const user = userEvent.setup();
    render(<DropdownUser />);

    const trigger = await openUserMenu(user);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it('CA-S1-13-R: clic externo cierra el menú', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <DropdownUser />
        <button type="button">Fuera del menú</button>
      </div>,
    );

    await openUserMenu(user);

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Fuera del menú' }));

    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Menú de usuario' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('CA-S1-ROV: ArrowDown / ArrowUp / Home / End mueven el foco entre menuitems', async () => {
    const user = userEvent.setup();
    render(<DropdownUser />);

    await openUserMenu(user);
    const profile = screen.getByRole('menuitem', { name: /Editar perfil/i });
    const settings = screen.getByRole('menuitem', { name: /Configuración/i });
    const logout = screen.getByRole('menuitem', { name: /Cerrar sesión/i });

    profile.focus();
    expect(profile).toHaveFocus();

    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(settings).toHaveFocus();

    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(logout).toHaveFocus();

    fireEvent.keyDown(document, { key: 'ArrowUp' });
    expect(settings).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Home' });
    expect(profile).toHaveFocus();

    fireEvent.keyDown(document, { key: 'End' });
    expect(logout).toHaveFocus();
  });

  it('items asChild (Link) conservan role menuitem y href de navegación', async () => {
    const user = userEvent.setup();
    render(<DropdownUser />);

    await openUserMenu(user);

    const profile = screen.getByRole('menuitem', { name: /Editar perfil/i });
    const settings = screen.getByRole('menuitem', { name: /Configuración/i });
    const logout = screen.getByRole('menuitem', { name: /Cerrar sesión/i });

    expect(profile.tagName).toBe('A');
    expect(profile).toHaveAttribute('href', '/profile');
    expect(settings.tagName).toBe('A');
    expect(settings).toHaveAttribute('href', '/settings');
    expect(logout.tagName).toBe('BUTTON');
  });
});
