import { fireEvent, render, screen } from '@testing-library/react';

import { DispatchDrawerPortal } from './DispatchDrawerPortal';

describe('DispatchDrawerPortal', () => {
  it('apila el overlay por encima del shell para difuminar tambien el menu', () => {
    render(
      <DispatchDrawerPortal open onClose={jest.fn()}>
        <aside>Contenido del despacho</aside>
      </DispatchDrawerPortal>,
    );

    // La capa está portalada a `document.body`: se llega a ella por el panel,
    // nunca por el contenedor de render, que queda vacío.
    const layer = screen.getByText('Contenido del despacho').parentElement;
    const overlay = document.body.querySelector<HTMLElement>('[data-portal-veil]');

    expect(layer).toHaveClass('z-(--z-modal)');
    expect(overlay).not.toBeNull();
    expect(overlay).toHaveAttribute('aria-hidden', 'true');
    expect(overlay).toHaveClass('backdrop-blur-sm');
    expect(overlay).toHaveClass('bg-(--color-veil)');
    expect(overlay).toHaveClass('absolute', 'inset-0');
  });

  it('cierra el despacho al activar el overlay', () => {
    const onClose = jest.fn();

    render(
      <DispatchDrawerPortal open onClose={onClose}>
        <aside>Contenido del despacho</aside>
      </DispatchDrawerPortal>,
    );

    // El velo cierra en `mousedown`, no en `click`.
    const overlay = document.body.querySelector<HTMLElement>('[data-portal-veil]');
    expect(overlay).not.toBeNull();
    fireEvent.mouseDown(overlay as HTMLElement);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
