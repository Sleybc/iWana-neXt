import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { OffersManager } from './OffersManager';

jest.mock('@iwana/ui', () => ({
  cn: (...classes: Array<string | boolean | undefined>) => classes.filter(Boolean).join(' '),
}));

jest.mock('lucide-react', () => ({
  Gift: () => <span data-testid="icon-gift" />,
  Package: () => <span data-testid="icon-package" />,
}));

jest.mock('@/components/commercial/BundlesManager', () => ({
  BundlesManager: () => <div data-testid="bundles-panel">Bundles panel</div>,
}));

jest.mock('@/components/commercial/PromotionsManager', () => ({
  PromotionsManager: () => <div data-testid="promotions-panel">Promotions panel</div>,
}));

describe('OffersManager', () => {
  it('renderiza Combos por defecto', () => {
    render(<OffersManager canEdit />);

    expect(screen.getByRole('tab', { name: 'Combos' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('bundles-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('promotions-panel')).not.toBeInTheDocument();
  });

  it('cambia a Promociones al hacer click en la pestaña', () => {
    render(<OffersManager canEdit />);

    fireEvent.click(screen.getByRole('tab', { name: 'Promociones' }));

    expect(screen.getByRole('tab', { name: 'Promociones' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('promotions-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('bundles-panel')).not.toBeInTheDocument();
  });

  it('soporta navegacion con teclado entre subtabs', () => {
    render(<OffersManager canEdit />);

    const bundlesTab = screen.getByRole('tab', { name: 'Combos' });
    fireEvent.keyDown(bundlesTab, { key: 'ArrowRight' });

    expect(screen.getByRole('tab', { name: 'Promociones' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('promotions-panel')).toBeInTheDocument();
  });
});
