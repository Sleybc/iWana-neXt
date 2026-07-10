import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StockBalanceCondition, StockIssueType, StockLocationType } from '@iwana/shared';
import { StockIssueComposer } from './StockIssueComposer';

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
    expect(screen.getByRole('tab', { name: /Con stock/i })).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Origen' }));
    await user.click(screen.getByRole('option', { name: /BOD-01 · Bodega principal/i }));
    await user.click(screen.getByRole('combobox', { name: 'Destino' }));
    await user.click(screen.getByRole('option', { name: /Custodia técnico/i }));

    await user.click(screen.getByRole('tab', { name: /Catálogo/i }));
    await user.click(screen.getByRole('checkbox', { name: /ONT WiFi 6/i }));
    await user.click(screen.getByRole('checkbox', { name: /Cable drop/i }));
    await user.click(screen.getByRole('button', { name: 'Agregar 2 productos' }));

    expect(screen.getAllByText('ONT-001 · ONT WiFi 6').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('CAB-010 · Cable drop').length).toBeGreaterThanOrEqual(1);
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
          { itemId: 'item-1', requestedQty: 1, condition: StockBalanceCondition.NEW },
          { itemId: 'item-2', requestedQty: 1, condition: StockBalanceCondition.NEW },
        ],
      }),
    );
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

    await user.click(screen.getByRole('combobox', { name: 'Origen' }));
    await user.click(screen.getByRole('option', { name: /BOD-01 · Bodega principal/i }));

    expect(screen.getByText(/Disponible en origen: 3/)).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /ONT WiFi 6/i }));
    await user.click(screen.getByRole('button', { name: 'Agregar 1 producto' }));

    const quantityInput = screen.getByLabelText(/Cantidad ONT-001/i);
    await user.clear(quantityInput);
    await user.type(quantityInput, '9');

    expect(screen.getByText(/Supera el saldo visible en origen/i)).toBeInTheDocument();
  });
});
