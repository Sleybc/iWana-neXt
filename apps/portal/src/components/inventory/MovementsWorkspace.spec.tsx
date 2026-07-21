import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SerializedAssetStatus } from '@iwana/shared';
import type { InventoryItemRecord, StockLocationRecord } from '@/lib/api-client';
import { getSerializedAssetStatusLabel } from './inventory-labels';
import { MovementsWorkspace, type ReturnFormState, type SaleFormState } from './MovementsWorkspace';

const mockItems = [
  {
    id: 'item-1',
    sku: 'ONT-001',
    name: 'ONT WiFi 6',
  },
] as InventoryItemRecord[];

const mockLocations = [
  {
    id: 'loc-1',
    code: 'BOD-01',
    name: 'Bodega central',
  },
] as StockLocationRecord[];

const defaultSaleForm: SaleFormState = {
  itemId: '',
  locationId: '',
  quantity: '1',
  commercialRefId: '',
  serialNumber: '',
  notes: '',
};

const defaultReturnForm: ReturnFormState = {
  itemId: '',
  sourceLocationId: '',
  destinationLocationId: '',
  quantity: '1',
  serialNumber: '',
  targetStatus: SerializedAssetStatus.IN_TRANSIT,
  notes: '',
};

describe('MovementsWorkspace · Fase H5', () => {
  it('renderiza paneles de venta y devolución', () => {
    render(
      <MovementsWorkspace
        items={mockItems}
        locations={mockLocations}
        saleForm={defaultSaleForm}
        onSaleFormChange={jest.fn()}
        returnForm={defaultReturnForm}
        onReturnFormChange={jest.fn()}
        isSubmittingMovement={false}
        movementError={null}
        onSale={jest.fn()}
        onReturn={jest.fn()}
      />,
    );

    expect(screen.getByTestId('movements-workspace')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Registrar venta' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recibir devolución' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar venta' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Registrar retorno' })).toBeDisabled();
  });

  it('expone opciones de estado de retorno en español', async () => {
    const user = userEvent.setup();
    const onReturnFormChange = jest.fn();

    render(
      <MovementsWorkspace
        items={mockItems}
        locations={mockLocations}
        saleForm={defaultSaleForm}
        onSaleFormChange={jest.fn()}
        returnForm={defaultReturnForm}
        onReturnFormChange={onReturnFormChange}
        isSubmittingMovement={false}
        movementError={null}
        onSale={jest.fn()}
        onReturn={jest.fn()}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Estado del activo al llegar' }));
    expect(
      await screen.findByRole('option', {
        name: getSerializedAssetStatusLabel(SerializedAssetStatus.IN_TRANSIT),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', {
        name: getSerializedAssetStatusLabel(SerializedAssetStatus.IN_TESTING),
      }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('option', {
        name: getSerializedAssetStatusLabel(SerializedAssetStatus.IN_TESTING),
      }),
    );

    expect(onReturnFormChange).toHaveBeenCalledWith(
      expect.objectContaining({
        targetStatus: SerializedAssetStatus.IN_TESTING,
      }),
    );
  });
});
