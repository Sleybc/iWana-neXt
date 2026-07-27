import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { inventoryApi } from '@/lib/api-client';
import { StockAdjustmentDialog } from './StockAdjustmentDialog';

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    inventoryApi: {
      ...actual.inventoryApi,
      createAdjustment: jest.fn(),
    },
  };
});

jest.mock('./InventoryItemPicker', () => ({
  InventoryItemPicker: ({
    label,
    value,
    onChange,
  }: {
    label?: string;
    value: string | null;
    onChange: (id: string | null, item: { id: string; label: string } | null) => void;
  }) => (
    <button
      type="button"
      aria-label={label ?? 'Producto'}
      onClick={() => onChange('item-001', { id: 'item-001', label: 'Cable UTP' })}
    >
      {value ?? 'sin producto'}
    </button>
  ),
}));

jest.mock('./InventoryLocationPicker', () => ({
  InventoryLocationPicker: ({
    label,
    value,
    onChange,
  }: {
    label?: string;
    value: string | null;
    onChange: (id: string | null, item: { id: string; label: string } | null) => void;
  }) => (
    <button
      type="button"
      aria-label={label ?? 'Bodega'}
      onClick={() => onChange('loc-001', { id: 'loc-001', label: 'Central' })}
    >
      {value ?? 'sin bodega'}
    </button>
  ),
}));

const createAdjustmentMock = inventoryApi.createAdjustment as jest.Mock;

describe('StockAdjustmentDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(globalThis, 'crypto', {
      value: { randomUUID: () => '11111111-1111-4111-8111-111111111111' },
      configurable: true,
    });
  });

  it('submits a signed outbound adjustment', async () => {
    const user = userEvent.setup();
    createAdjustmentMock.mockResolvedValue({
      movement: { movementNumber: 'MOV-000123' },
      lines: [],
    });
    const onRegistered = jest.fn();
    const onClose = jest.fn();

    render(
      <StockAdjustmentDialog
        open
        preselectedItemId="item-001"
        preselectedItemLabel="Cable UTP"
        onClose={onClose}
        onAdjustmentRegistered={onRegistered}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Bodega' }));
    await user.click(screen.getByRole('combobox', { name: 'Dirección' }));
    await user.click(await screen.findByRole('option', { name: 'Salida' }));
    await user.clear(screen.getByLabelText('Cantidad'));
    await user.type(screen.getByLabelText('Cantidad'), '2');
    await user.click(screen.getByRole('button', { name: 'Registrar ajuste' }));

    await waitFor(() => {
      expect(createAdjustmentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: 'item-001',
          locationId: 'loc-001',
          quantityDelta: -2,
          idempotencyKey: '11111111-1111-4111-8111-111111111111',
        }),
      );
    });
    expect(onRegistered).toHaveBeenCalledWith('MOV-000123');
    expect(onClose).toHaveBeenCalled();
  });
});
