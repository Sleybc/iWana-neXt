import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  StockBalanceCondition,
  StockIssueStatus,
  StockIssueType,
  StockLocationType,
} from '@iwana/shared';
import { STOCK_COMMITTED_NEXT_STEP_TEXT } from './inventory-labels';
import { StockIssueComposer } from './StockIssueComposer';

jest.mock('./InventoryLocationPicker', () => ({
  InventoryLocationPicker: ({
    id,
    label,
    onChange,
  }: {
    id?: string;
    label?: string;
    onChange: (id: string | null, item: { id: string; label: string } | null) => void;
  }) => (
    <button
      type="button"
      aria-label={label ?? 'Bodega'}
      data-testid={id}
      onClick={() => {
        if (id === 'issue-destination') {
          onChange('loc-2', { id: 'loc-2', label: 'TEC-01 · Custodia técnico' });
          return;
        }
        onChange('loc-1', { id: 'loc-1', label: 'BOD-01 · Bodega principal' });
      }}
    >
      Elegir {label}
    </button>
  ),
}));

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    inventoryApi: {
      ...actual.inventoryApi,
      listBalances: jest.fn().mockResolvedValue({
        data: [
          {
            id: 'bal-1',
            tenantId: 'tenant-1',
            itemId: 'item-1',
            locationId: 'loc-1',
            lotId: null,
            condition: 'NEW',
            quantityOnHand: '3',
            quantityReserved: '0',
            createdAt: '2026-07-01T00:00:00.000Z',
            updatedAt: '2026-07-01T00:00:00.000Z',
          },
          {
            id: 'bal-2',
            tenantId: 'tenant-1',
            itemId: 'item-2',
            locationId: 'loc-1',
            lotId: null,
            condition: 'NEW',
            quantityOnHand: '5',
            quantityReserved: '0',
            createdAt: '2026-07-01T00:00:00.000Z',
            updatedAt: '2026-07-01T00:00:00.000Z',
          },
        ],
        meta: { nextCursor: null, total: 2, hasMore: false },
      }),
      listAssets: jest.fn().mockResolvedValue({
        data: [],
        meta: { nextCursor: null, total: 0, hasMore: false },
      }),
      getItem: jest.fn().mockResolvedValue({
        id: 'item-1',
        tenantId: 'tenant-1',
        sku: 'ONT-001',
        name: 'ONT WiFi 6',
        categoryName: 'Equipos',
        unitOfMeasure: 'unidad',
      }),
      searchItemsForPicker: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    },
  };
});

const baseItem = {
  id: 'item-1',
  tenantId: 'tenant-1',
  sku: 'ONT-001',
  name: 'ONT WiFi 6',
  categoryName: 'Equipos',
  unitOfMeasure: 'unidad',
} as const;

const baseLocation = {
  id: 'loc-1',
  tenantId: 'tenant-1',
  code: 'BOD-01',
  name: 'Bodega principal',
  type: StockLocationType.MAIN_WAREHOUSE,
  status: 'ACTIVE',
} as const;

const mobileLocation = {
  id: 'loc-2',
  tenantId: 'tenant-1',
  code: 'TEC-01',
  name: 'Custodia técnico',
  type: StockLocationType.MOBILE_TECHNICIAN,
  status: 'ACTIVE',
} as const;

const balances = [
  {
    id: 'bal-1',
    tenantId: 'tenant-1',
    itemId: 'item-1',
    locationId: 'loc-1',
    lotId: null,
    condition: StockBalanceCondition.NEW,
    quantityOnHand: '3',
    quantityReserved: '0',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  },
  {
    id: 'bal-2',
    tenantId: 'tenant-1',
    itemId: 'item-2',
    locationId: 'loc-1',
    lotId: null,
    condition: StockBalanceCondition.NEW,
    quantityOnHand: '8',
    quantityReserved: '0',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  },
] as const;

describe('StockIssueComposer', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: jest.fn().mockImplementation(() => ({
        matches: true,
        media: '',
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });
  });

  it('renders create-mode sections and submits multiple lines', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn().mockResolvedValue(undefined);

    render(
      <StockIssueComposer
        items={[
          baseItem,
          {
            ...baseItem,
            id: 'item-2',
            sku: 'CAB-010',
            name: 'Cable drop',
            unitOfMeasure: 'metro',
          } as any,
        ]}
        balances={[...balances]}
        locations={[baseLocation, mobileLocation] as any}
        destinationOptions={
          new Map([[StockLocationType.MOBILE_TECHNICIAN, [mobileLocation] as any]]) as any
        }
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Datos de la salida' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Con material/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    await user.click(screen.getByRole('button', { name: 'Destino' }));

    await user.click(await screen.findByRole('checkbox', { name: /Seleccionar ONT/i }));
    await user.click(screen.getByRole('button', { name: /Agregar 1 producto/i }));

    expect(screen.getAllByText('ONT-001 · ONT WiFi 6').length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByRole('columnheader', { name: 'Disponible en origen' }).length,
    ).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole('button', { name: 'Crear salida' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: StockIssueType.TECHNICIAN_CUSTODY,
        sourceLocationId: 'loc-1',
        destinationLocationId: 'loc-2',
        lines: [
          expect.objectContaining({ itemId: 'item-1', condition: StockBalanceCondition.NEW }),
        ],
      }),
    );
  });

  it('appends next-step guidance when create fails with a remote stock error', () => {
    render(
      <StockIssueComposer
        items={[baseItem as any]}
        balances={[balances[0]!]}
        locations={[baseLocation, mobileLocation] as any}
        destinationOptions={
          new Map([[StockLocationType.MOBILE_TECHNICIAN, [mobileLocation] as any]]) as any
        }
        error="No hay suficiente material disponible: hay cantidad comprometida por salidas abiertas."
        onSubmit={jest.fn()}
      />,
    );

    expect(screen.getByText('No se pudo crear la salida')).toBeInTheDocument();
    expect(
      screen.getByText(
        'No hay suficiente material disponible: hay cantidad comprometida por salidas abiertas.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(STOCK_COMMITTED_NEXT_STEP_TEXT)).toBeInTheDocument();
  });

  it('shows stock suggestions and warns when quantity exceeds available balance', async () => {
    const user = userEvent.setup();

    render(
      <StockIssueComposer
        items={[baseItem as any]}
        balances={[balances[0]!]}
        locations={[baseLocation, mobileLocation] as any}
        destinationOptions={
          new Map([[StockLocationType.MOBILE_TECHNICIAN, [mobileLocation] as any]]) as any
        }
        onSubmit={jest.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Origen' }));

    expect(await screen.findByText(/Disponible en origen: 3/)).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /Seleccionar ONT/i }));
    await user.click(screen.getByRole('button', { name: /Agregar 1 producto/i }));

    const quantityInput = screen.getByLabelText(/Cantidad ONT-001/i);
    await user.clear(quantityInput);
    await user.type(quantityInput, '9');

    expect(screen.getByText(/Supera el material disponible en origen/i)).toBeInTheDocument();
  });

  it('loads edit mode with guardrail and disables save until there are changes', async () => {
    const onUpdate = jest.fn().mockResolvedValue(undefined);

    render(
      <StockIssueComposer
        mode="edit"
        editIssue={
          {
            id: 'issue-1',
            tenantId: 'tenant-1',
            type: StockIssueType.TECHNICIAN_CUSTODY,
            status: StockIssueStatus.REQUESTED,
            sourceLocationId: 'loc-1',
            destinationLocationId: 'loc-2',
            destinationRefId: null,
            originRefId: null,
            commercialRefId: null,
            reason: null,
            costCenter: null,
            handoffMethod: null,
            handoffNotes: null,
            handoffAttachments: null,
            createdByUserId: null,
            dispatchedByUserId: null,
            closedAt: null,
            stockMovementId: null,
            createdAt: '2026-07-01T00:00:00.000Z',
            updatedAt: '2026-07-01T00:00:00.000Z',
            lines: [
              {
                id: 'line-1',
                tenantId: 'tenant-1',
                issueId: 'issue-1',
                itemId: 'item-1',
                requestedQty: '1.00',
                dispatchedQty: null,
                lotId: null,
                serializedAssetId: null,
                condition: StockBalanceCondition.NEW,
                createdAt: '2026-07-01T00:00:00.000Z',
                updatedAt: '2026-07-01T00:00:00.000Z',
              },
            ],
          } as any
        }
        items={[baseItem as any]}
        balances={[balances[0]!]}
        locations={[baseLocation, mobileLocation] as any}
        destinationOptions={
          new Map([[StockLocationType.MOBILE_TECHNICIAN, [mobileLocation] as any]]) as any
        }
        onSubmit={jest.fn()}
        onUpdate={onUpdate}
      />,
    );

    expect(screen.getByText('Edición disponible en estado solicitada')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Contexto de la salida' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  });
});
