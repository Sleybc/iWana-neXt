import { fireEvent, render, screen, within } from '@testing-library/react';
import { Layers } from 'lucide-react';
import { PortalModuleSubnav, type PortalModuleSubnavGroup } from './portal-ui';

const groups: PortalModuleSubnavGroup[] = [
  {
    id: 'catalog',
    label: 'Catálogo',
    items: [
      { id: 'plans', label: 'Planes', icon: Layers },
      { id: 'products', label: 'Productos' },
    ],
  },
  {
    id: 'rules',
    label: 'Reglas',
    items: [{ id: 'tax-simulator', label: 'Simulador' }],
  },
];

function mockMatchMediaLg(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('1024') ? matches : false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }),
  });
}

describe('PortalModuleSubnav', () => {
  it('en lg+ marca el destino activo con subrayado lima y aria-current', () => {
    mockMatchMediaLg(true);
    const onValueChange = jest.fn();

    render(
      <PortalModuleSubnav
        groups={groups}
        value="plans"
        onValueChange={onValueChange}
        ariaLabel="Secciones comerciales"
      />,
    );

    const nav = screen.getByRole('navigation', { name: 'Secciones comerciales' });
    expect(nav).toHaveClass('flex-row');
    expect(nav).toHaveClass('overflow-x-auto');
    expect(nav).toHaveClass('lg:sticky');
    expect(nav).toHaveClass('lg:top-(--portal-sticky-offset)');
    expect(nav).toHaveClass('lg:z-(--z-sticky)');

    const active = screen.getByRole('button', { name: 'Planes' });
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(active).toHaveClass('bg-iwana-surface-soft');
    expect(active).toHaveClass('gap-2');
    const icon = active.querySelector('svg');
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).toHaveClass('text-iwana-secondary-700');
    const lima = active.querySelector('.bg-iwana-secondary');
    expect(lima).not.toBeNull();
    expect(lima).toHaveClass('bottom-0');
    expect(lima).toHaveClass('h-0.5');
    expect(lima).not.toHaveClass('w-1');

    fireEvent.click(screen.getByRole('button', { name: 'Simulador' }));
    expect(onValueChange).toHaveBeenCalledWith('tax-simulator');
  });

  it('bajo lg abre el selector de sección y cierra al elegir', () => {
    mockMatchMediaLg(false);
    const onValueChange = jest.fn();

    render(
      <PortalModuleSubnav
        groups={groups}
        value="products"
        onValueChange={onValueChange}
        ariaLabel="Secciones comerciales"
      />,
    );

    expect(
      screen.queryByRole('navigation', { name: 'Secciones comerciales' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sección: Productos' }));
    expect(screen.getByRole('dialog', { name: 'Elegir sección' })).toBeInTheDocument();
    expect(screen.getByText('Catálogo')).toBeInTheDocument();
    expect(screen.getByText('Reglas')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Simulador' }));
    expect(onValueChange).toHaveBeenCalledWith('tax-simulator');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('en el dialog móvil marca el activo con barra lima vertical', () => {
    mockMatchMediaLg(false);

    render(
      <PortalModuleSubnav
        groups={groups}
        value="plans"
        onValueChange={jest.fn()}
        ariaLabel="Secciones comerciales"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sección: Planes' }));
    const active = screen.getByRole('button', { name: 'Planes' });
    const lima = active.querySelector('.bg-iwana-secondary');
    expect(lima).toHaveClass('w-1');
    expect(lima).not.toHaveClass('h-0.5');
  });

  it('expone grupos con eyebrows y no usa tablist', () => {
    mockMatchMediaLg(true);

    render(
      <PortalModuleSubnav
        groups={groups}
        value="plans"
        onValueChange={jest.fn()}
        ariaLabel="Secciones comerciales"
      />,
    );

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Catálogo' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Reglas' })).toBeInTheDocument();
  });
});

describe('PortalModuleSubnav — hideLabel (v1.3, spec subnav Inventario §2.2)', () => {
  const anchoredGroups: PortalModuleSubnavGroup[] = [
    {
      id: 'overview',
      label: 'Vista general',
      hideLabel: true,
      items: [{ id: 'overview', label: 'Vista general', icon: Layers }],
    },
    ...groups,
  ];

  it('en lg+ oculta el eyebrow, nombra la lista con aria-label y no deja aria-labelledby colgante', () => {
    mockMatchMediaLg(true);

    render(
      <PortalModuleSubnav
        groups={anchoredGroups}
        value="overview"
        onValueChange={jest.fn()}
        ariaLabel="Secciones de inventario"
      />,
    );

    // Ningún eyebrow "Vista general": el texto visible es solo el ítem (button).
    const eyebrows = Array.from(document.querySelectorAll('p.portal-eyebrow')).map(
      (node) => node.textContent,
    );
    expect(eyebrows).toEqual(['Catálogo', 'Reglas']);

    const hiddenList = screen.getByRole('list', { name: 'Vista general' });
    expect(hiddenList).toHaveAttribute('aria-label', 'Vista general');
    expect(hiddenList).not.toHaveAttribute('aria-labelledby');

    // El wrapper del grupo recibe la compensación documentada en tokens.
    expect(hiddenList.parentElement).toHaveClass('portal-subnav-group-sans-label');
    expect(hiddenList.parentElement).toHaveClass('space-y-1');

    // El divisor solo precede a grupos con index > 0: el grupo anclado no lleva.
    // Los separators llevan aria-hidden y no salen en queries por rol: query DOM.
    expect(document.querySelectorAll('[role="separator"]')).toHaveLength(2);
  });

  it('en el dialog <lg aplica igual: grupo sin eyebrow y lista con aria-label', () => {
    mockMatchMediaLg(false);

    render(
      <PortalModuleSubnav
        groups={anchoredGroups}
        value="overview"
        onValueChange={jest.fn()}
        ariaLabel="Secciones de inventario"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sección: Vista general' }));

    const dialog = screen.getByRole('dialog', { name: 'Elegir sección' });
    const eyebrows = Array.from(dialog.querySelectorAll('p.portal-eyebrow')).map(
      (node) => node.textContent,
    );
    expect(eyebrows).toEqual(['Catálogo', 'Reglas']);

    const hiddenList = within(dialog).getByRole('list', { name: 'Vista general' });
    expect(hiddenList).toHaveAttribute('aria-label', 'Vista general');
    expect(hiddenList).not.toHaveAttribute('aria-labelledby');
    expect(hiddenList.parentElement).toHaveClass('portal-subnav-group-sans-label');
  });
});
