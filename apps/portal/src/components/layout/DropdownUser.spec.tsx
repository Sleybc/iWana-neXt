/**
 * Tests de DropdownUser (portal empresarial).
 *
 * CA-S1-12-R / CA-S1-13-R / CA-S1-ROV / asChild: ejercen el SUT real (sin mock
 * de DropdownUser ni de @iwana/ui). Solo dependencias externas (auth, navigation, Link).
 *
 * SEGURIDAD: sin PII real ni credenciales — datos ficticios de prueba.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DropdownUser } from './DropdownUser';

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
      displayName: 'Operador Portal',
      subtitle: 'Administrador',
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

function getMenuItems() {
  return {
    profile: screen.getByRole('menuitem', { name: /Mi perfil/i }),
    settings: screen.getByRole('menuitem', { name: /Configuración/i }),
    logout: screen.getByRole('menuitem', { name: /Cerrar sesión/i }),
  };
}

describe('DropdownUser portal (CA-S1-12-R / CA-S1-13-R / CA-S1-ROV / asChild)', () => {
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
    const { profile, settings, logout } = getMenuItems();

    profile.focus();
    expect(profile).toHaveFocus();

    // Roving vive en la primitiva DropdownMenu (listener document).
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
    const { profile, settings, logout } = getMenuItems();

    expect(profile.tagName).toBe('A');
    expect(profile).toHaveAttribute('href', '/dashboard/profile');
    expect(settings.tagName).toBe('A');
    expect(settings).toHaveAttribute('href', '/dashboard/settings');
    expect(logout.tagName).toBe('BUTTON');
  });
});
