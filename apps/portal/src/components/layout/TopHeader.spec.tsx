import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TopHeader } from './TopHeader';

const globalSearchOpenChange = jest.fn();

jest.mock('@/components/search/GlobalSearch', () => ({
  GlobalSearch: ({
    openRequestId = 0,
    onOpenChange,
  }: {
    openRequestId?: number;
    onOpenChange?: (open: boolean) => void;
  }) => {
    React.useEffect(() => {
      if (openRequestId > 0) {
        onOpenChange?.(true);
        globalSearchOpenChange(openRequestId);
      }
    }, [openRequestId, onOpenChange]);

    return (
      <div data-testid="global-search">
        <input aria-label="Buscar en el portal empresarial" />
        <button type="button" onClick={() => onOpenChange?.(false)}>
          Cerrar búsqueda interna
        </button>
      </div>
    );
  },
}));

jest.mock('./DropdownUser', () => ({
  DropdownUser: () => <div data-testid="dropdown-user" />,
}));

jest.mock('./ThemeToggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

jest.mock('./NotificationBell', () => ({
  NotificationBell: () => <div data-testid="notification-bell" />,
}));

describe('TopHeader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('expone targets táctiles ≥ 44 px en hamburger, home mobile y buscar', () => {
    render(
      <TopHeader
        desktopCollapsed={false}
        setDesktopCollapsed={jest.fn()}
        mobileOpen={false}
        setMobileOpen={jest.fn()}
      />,
    );

    const openMenu = screen.getByRole('button', { name: 'Abrir menú' });
    expect(openMenu.className).toMatch(/h-11/);
    expect(openMenu.className).toMatch(/w-11/);

    const home = screen.getByRole('link', { name: 'Ir al dashboard' });
    expect(home.className).toMatch(/min-h-11/);
    expect(home.className).toMatch(/min-w-11/);

    const searchTrigger = screen.getByRole('button', { name: 'Buscar' });
    expect(searchTrigger.className).toMatch(/h-11|min-h-11/);
  });

  it('expone un control táctil Buscar bajo 1024 px que abre la misma instancia de GlobalSearch', async () => {
    const user = userEvent.setup();

    render(
      <TopHeader
        desktopCollapsed={false}
        setDesktopCollapsed={jest.fn()}
        mobileOpen={false}
        setMobileOpen={jest.fn()}
      />,
    );

    expect(screen.getAllByTestId('global-search')).toHaveLength(1);

    const searchTrigger = screen.getByRole('button', { name: 'Buscar' });
    expect(searchTrigger.className).toMatch(/h-11|min-h-11/);

    await user.click(searchTrigger);

    expect(globalSearchOpenChange).toHaveBeenCalled();
    expect(screen.getAllByTestId('global-search')).toHaveLength(1);
  });

  it('al cerrar el menú móvil el disparador hamburger recupera el foco', async () => {
    const setMobileOpen = jest.fn();
    const { rerender } = render(
      <TopHeader
        desktopCollapsed={false}
        setDesktopCollapsed={jest.fn()}
        mobileOpen={false}
        setMobileOpen={setMobileOpen}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Abrir menú' });
    trigger.focus();
    expect(trigger).toHaveFocus();

    rerender(
      <TopHeader
        desktopCollapsed={false}
        setDesktopCollapsed={jest.fn()}
        mobileOpen
        setMobileOpen={setMobileOpen}
      />,
    );

    rerender(
      <TopHeader
        desktopCollapsed={false}
        setDesktopCollapsed={jest.fn()}
        mobileOpen={false}
        setMobileOpen={setMobileOpen}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Abrir menú' })).toHaveFocus();
    });
  });

  it('no usa hex de marca en el encabezado', () => {
    const { container } = render(
      <TopHeader
        desktopCollapsed={false}
        setDesktopCollapsed={jest.fn()}
        mobileOpen={false}
        setMobileOpen={jest.fn()}
      />,
    );

    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(container.innerHTML).toMatch(/z-\(--z-sticky\)/);
  });
});
