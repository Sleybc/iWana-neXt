import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  PurchaseRequestLineSourceKind,
  PurchaseRequestPriority,
  PurchaseRequestType,
} from '@iwana/shared';
import { inventoryApi, type ReplenishmentSuggestionRecord } from '@/lib/api-client';
import { StockReplenishmentPanel } from './StockReplenishmentPanel';

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    inventoryApi: {
      ...actual.inventoryApi,
      listReplenishmentSuggestions: jest.fn(),
    },
  };
});

const listReplenishmentSuggestionsMock = inventoryApi.listReplenishmentSuggestions as jest.Mock;

function buildSuggestion(
  overrides: Partial<ReplenishmentSuggestionRecord> = {},
): ReplenishmentSuggestionRecord {
  return {
    itemId: 'item-1',
    itemSku: 'CAB-01',
    itemName: 'Cable drop',
    unitOfMeasure: 'metro',
    available: '0',
    pendingPurchase: '0',
    minimumStock: '10',
    reorderPoint: '20',
    targetStock: '40',
    suggestedQty: '40',
    orderMultiple: '10',
    minimumOrderQty: '10',
    leadTimeDays: 5,
    preferredSupplier: { partyRefId: 'party-1', displayName: 'Proveedor Alfa' },
    estimatedUnitCost: '1000',
    estimatedLineValue: '40000',
    criticality: 'out',
    ...overrides,
  };
}

describe('StockReplenishmentPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('carga sugerencias y preselecciona criticidad sin stock', async () => {
    listReplenishmentSuggestionsMock.mockResolvedValue([
      buildSuggestion({ itemId: 'item-out', itemSku: 'OUT-01', criticality: 'out' }),
      buildSuggestion({
        itemId: 'item-min',
        itemSku: 'MIN-01',
        itemName: 'Conector',
        criticality: 'below-minimum',
        available: '5',
        suggestedQty: '15',
      }),
    ]);

    render(<StockReplenishmentPanel onGeneratePurchaseRequest={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('OUT-01')).toBeInTheDocument();
    });

    expect(listReplenishmentSuggestionsMock).toHaveBeenCalled();
    expect(screen.getByLabelText(/Seleccionar OUT-01/i)).toBeChecked();
    expect(screen.getByLabelText(/Seleccionar MIN-01/i)).not.toBeChecked();
    expect(screen.getByText('Agotado')).toBeInTheDocument();
    expect(screen.getByText('Bajo mínimo')).toBeInTheDocument();
  });

  it('permite editar cantidad sugerida y construye initialValues al generar', async () => {
    const onGenerate = jest.fn();
    listReplenishmentSuggestionsMock.mockResolvedValue([
      buildSuggestion({ itemId: 'item-1', suggestedQty: '40' }),
    ]);

    const user = userEvent.setup();
    render(<StockReplenishmentPanel onGeneratePurchaseRequest={onGenerate} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Cantidad sugerida para CAB-01/i)).toBeInTheDocument();
    });

    const qtyInput = screen.getByLabelText(/Cantidad sugerida para CAB-01/i);
    await user.clear(qtyInput);
    await user.type(qtyInput, '55');

    fireEvent.click(screen.getByRole('button', { name: /Generar solicitud de compra \(1\)/i }));

    expect(onGenerate).toHaveBeenCalledTimes(1);
    const values = onGenerate.mock.calls[0][0];
    expect(values.requestType).toBe(PurchaseRequestType.REPLENISHMENT);
    expect(values.priority).toBe(PurchaseRequestPriority.NORMAL);
    expect(values.requestingArea).toBe('Existencias');
    expect(values.title).toMatch(
      /^Reposición sugerida \d{4}-\d{2}-\d{2} — 1 ítem bajo punto de reorden$/,
    );
    expect(values.justification).toContain('1 producto bajo punto de reorden');
    expect(values.neededByDate).toBeNull();
    expect(values.lines).toHaveLength(1);
    expect(values.lines[0].sourceKind).toBe(PurchaseRequestLineSourceKind.REPLENISHMENT_SUGGESTION);
    expect(values.lines[0].inventoryItemId).toBe('item-1');
    expect(values.lines[0].quantityRequested).toBe('55');
    expect(values.lines[0].suggestedPartyRefId).toBe('party-1');
    expect(values.lines[0].freeTextDescription).toBe('CAB-01 - Cable drop');
  });

  it('muestra estado vacío cuando no hay sugerencias', async () => {
    listReplenishmentSuggestionsMock.mockResolvedValue([]);

    render(<StockReplenishmentPanel onGeneratePurchaseRequest={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Sin ítems bajo punto de reorden')).toBeInTheDocument();
    });
  });
});
