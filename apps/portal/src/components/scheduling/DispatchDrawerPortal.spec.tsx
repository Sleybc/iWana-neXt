import { fireEvent, render, screen } from '@testing-library/react';

import { DispatchDrawerPortal } from './DispatchDrawerPortal';

describe('DispatchDrawerPortal', () => {
  it('apila el overlay por encima del shell para difuminar tambien el menu', () => {
    render(
      <DispatchDrawerPortal open onClose={jest.fn()}>
        <aside>Contenido del despacho</aside>
      </DispatchDrawerPortal>,
    );

    const layer = screen.getByText('Contenido del despacho').parentElement;
    const overlay = screen.getByRole('button', { name: 'Cerrar panel de despacho' });

    expect(layer).toHaveClass('z-(--z-drawer)');
    expect(overlay).toHaveClass('backdrop-blur-sm');
    expect(overlay).toHaveClass('absolute', 'inset-0');
  });

  it('cierra el despacho al activar el overlay', () => {
    const onClose = jest.fn();

    render(
      <DispatchDrawerPortal open onClose={onClose}>
        <aside>Contenido del despacho</aside>
      </DispatchDrawerPortal>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar panel de despacho' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
