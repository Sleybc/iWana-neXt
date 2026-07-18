import { render, screen } from '@testing-library/react';
import { StockWorkspace } from './StockWorkspace';

jest.mock('./StockByProductTable', () => ({
  StockByProductTable: () => <div>Tabla por producto</div>,
}));

jest.mock('./StockLocationsMatrix', () => ({
  StockLocationsMatrix: () => <div>Matriz por bodega</div>,
}));

jest.mock('./StockKardexPanel', () => ({
  StockKardexPanel: () => <div>Panel kardex</div>,
}));

jest.mock('./StockItemDetailDrawer', () => ({
  StockItemDetailDrawer: () => null,
}));

jest.mock('./StockAdjustmentDialog', () => ({
  StockAdjustmentDialog: () => null,
}));

describe('StockWorkspace', () => {
  it('renders the three stock subviews', () => {
    render(
      <StockWorkspace items={[]} balances={[]} locations={[]} onAdjustmentRegistered={jest.fn()} />,
    );

    expect(screen.getByText('Por producto')).toBeInTheDocument();
    expect(screen.getByText('Por bodega')).toBeInTheDocument();
    expect(screen.getByText('Kardex')).toBeInTheDocument();
    expect(screen.getByText('Tabla por producto')).toBeInTheDocument();
  });

  it('abre Por bodega cuando el filtro de custodia es móvil', () => {
    render(
      <StockWorkspace
        items={[]}
        balances={[]}
        locations={[]}
        custodyFilter="mobile"
        onAdjustmentRegistered={jest.fn()}
      />,
    );

    expect(screen.getByRole('tab', { name: 'Por bodega', selected: true })).toBeInTheDocument();
    expect(screen.getByText('Matriz por bodega')).toBeInTheDocument();
  });
});
