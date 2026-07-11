import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { OffersManager } from './OffersManager';

jest.mock('@/components/commercial/BundlesManager', () => ({
  BundlesManager: () => <div data-testid="bundles-panel">Bundles panel</div>,
}));

jest.mock('@/components/commercial/PromotionsManager', () => ({
  PromotionsManager: () => <div data-testid="promotions-panel">Promotions panel</div>,
}));

describe('OffersManager', () => {
  it('renderiza Combos por defecto', () => {
    render(<OffersManager canEdit activeSubTab="bundles" onSubTabChange={jest.fn()} />);

    expect(screen.getByRole('tab', { name: 'Combos' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByTestId('bundles-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('promotions-panel')).not.toBeInTheDocument();
  });

  it('renderiza Promociones cuando el subtab activo es promotions', () => {
    render(<OffersManager canEdit activeSubTab="promotions" onSubTabChange={jest.fn()} />);

    expect(screen.getByRole('tab', { name: 'Promociones' })).toHaveAttribute(
      'data-state',
      'active',
    );
    expect(screen.getByTestId('promotions-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('bundles-panel')).not.toBeInTheDocument();
  });

  it('notifica cambio de subtab', () => {
    const onSubTabChange = jest.fn();
    render(<OffersManager canEdit activeSubTab="bundles" onSubTabChange={onSubTabChange} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Promociones' }));

    expect(onSubTabChange).toHaveBeenCalledWith('promotions');
  });
});
