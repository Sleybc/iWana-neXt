import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  InventoryItemCategory,
  InventoryItemKind,
  InventoryItemStatus,
  InventoryTrackingMode,
  StockBalanceCondition,
} from '@iwana/shared';
import { inventoryApi, type InventoryItemRecord, type StockBalanceRecord } from '@/lib/api-client';
import { StockItemDetailDrawer } from './StockItemDetailDrawer';
import { PORTAL_MODAL_DRAWER_STATE_EVENT } from '@/components/shared/portal-side-drawer-layers';
import {
  formatInventoryCostOrNone,
  INVENTORY_AVERAGE_COST_LABEL,
  INVENTORY_LAST_PURCHASE_COST_LABEL,
  INVENTORY_NO_COST_LABEL,
} from './inventory-labels';

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    inventoryApi: {
      ...actual.inventoryApi,
      listMovements: jest.fn(),
    },
  };
});

const listMovementsMock = inventoryApi.listMovements as jest.Mock;

const item: InventoryItemRecord = {
  id: 'item-1',
  tenantId: 'tenant-1',
  sku: 'ONT-001',
  name: 'ONT WiFi 6',
  description: null,
  brand: 'FiberCo',
  model: 'X6',
  itemKind: InventoryItemKind.STOCK,
  category: InventoryItemCategory.CPE,
  categoryId: 'cat-cpe',
  categoryName: 'CPE',
  categoryCode: 'CPE',
  trackingMode: InventoryTrackingMode.CONSUMABLE,
  unitOfMeasure: 'unidad',
  baseCost: '120000',
  minimumStock: '2',
  purchasable: true,
  inventoryControlled: true,
  assetControlled: false,
  preferredSupplierRefId: null,
  supplierSku: null,
  purchaseUnitOfMeasure: null,
  purchaseToBaseUomFactor: null,
  standardCost: '118000',
  lastPurchaseCost: '115000',
  averageCost: '116500',
  reorderPoint: '5',
  targetStock: '20',
  minimumOrderQty: null,
  orderMultiple: null,
  leadTimeDays: null,
  usefulLifeMonths: null,
  commercialReferenceId: null,
  status: InventoryItemStatus.ACTIVE,
  barcode: null,
  barcodeType: null,
  createdAt: '2026-06-25T12:00:00.000Z',
  updatedAt: '2026-06-25T12:00:00.000Z',
};

describe('StockItemDetailDrawer · costos F4 / G6 P2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listMovementsMock.mockResolvedValue({ data: [], total: 0, page: 1, limit: 10 });
  });

  it('usa meta-tiles de catálogo (surface-soft + eyebrow-muted) para costos', async () => {
    render(
      <StockItemDetailDrawer open item={item} balances={[]} locations={[]} onClose={jest.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByText(INVENTORY_AVERAGE_COST_LABEL)).toBeInTheDocument();
    });

    const averageLabel = screen.getByText(INVENTORY_AVERAGE_COST_LABEL);
    const averageTile = averageLabel.closest('div');
    expect(averageTile).toHaveClass(
      'rounded-2xl',
      'bg-iwana-surface-soft',
      'dark:bg-dark-surface-3',
    );
    expect(averageLabel).toHaveClass('portal-eyebrow-muted');
    expect(
      screen.getByText(
        (_, element) => element?.textContent === formatInventoryCostOrNone('116500'),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(INVENTORY_LAST_PURCHASE_COST_LABEL)).toBeInTheDocument();
  });

  it('muestra Sin costo cuando averageCost y lastPurchaseCost están vacíos', async () => {
    render(
      <StockItemDetailDrawer
        open
        item={{ ...item, averageCost: '0', lastPurchaseCost: null }}
        balances={[]}
        locations={[]}
        onClose={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByText(INVENTORY_NO_COST_LABEL).length).toBeGreaterThanOrEqual(2);
    });
  });

  it('difunde el estado modal al abrir para que el chrome quede inerte bajo el velo', async () => {
    const estados: boolean[] = [];
    const escucha = (event: Event) => {
      estados.push((event as CustomEvent<{ open: boolean }>).detail.open);
    };
    window.addEventListener(PORTAL_MODAL_DRAWER_STATE_EVENT, escucha);

    const { rerender } = render(
      <StockItemDetailDrawer
        open={false}
        item={item}
        balances={[]}
        locations={[]}
        onClose={jest.fn()}
      />,
    );

    // Cerrado no difunde: el chrome sigue operable.
    expect(estados).toEqual([]);

    rerender(
      <StockItemDetailDrawer open item={item} balances={[]} locations={[]} onClose={jest.fn()} />,
    );

    await waitFor(() => expect(estados).toEqual([true]));

    window.removeEventListener(PORTAL_MODAL_DRAWER_STATE_EVENT, escucha);
  });

  it('libera el estado modal al desmontar con el drawer abierto', async () => {
    const estados: boolean[] = [];
    const escucha = (event: Event) => {
      estados.push((event as CustomEvent<{ open: boolean }>).detail.open);
    };
    window.addEventListener(PORTAL_MODAL_DRAWER_STATE_EVENT, escucha);

    const { unmount } = render(
      <StockItemDetailDrawer open item={item} balances={[]} locations={[]} onClose={jest.fn()} />,
    );

    await waitFor(() => expect(estados).toEqual([true]));

    unmount();

    // Navegar fuera con el drawer abierto no puede dejar el chrome inerte.
    await waitFor(() => expect(estados).toEqual([true, false]));

    window.removeEventListener(PORTAL_MODAL_DRAWER_STATE_EVENT, escucha);
  });

  it('velo y panel comparten la capa z-modal, por encima del chrome (ADR-075)', async () => {
    const onClose = jest.fn();
    render(
      <StockItemDetailDrawer open item={item} balances={[]} locations={[]} onClose={onClose} />,
    );

    // El velo NO es un `<button>`: es hermano del panel `aria-modal`, fuera de
    // su subárbol, y toda AT que honre `aria-modal` lo omite. Se localiza por
    // `data-portal-veil`, el marcador que declara `ModalLayer`. La consulta
    // sale de `document.body` porque la capa está portalada: preguntarle al
    // contenedor de render devolvería siempre vacío y el aserto sería vacuo.
    const velo = document.body.querySelector<HTMLElement>('[data-portal-veil]');
    expect(velo).not.toBeNull();
    expect(velo?.tagName).toBe('DIV');
    expect(velo).toHaveAttribute('aria-hidden', 'true');
    // El velo vive DENTRO de la capa del drawer: `--z-shell-raised` (200) no
    // puede cubrir el Sidebar, que ocupa `--z-shell-panel` (300).
    expect(velo).toHaveClass('absolute');
    expect(velo).not.toHaveClass('z-(--z-shell-raised)');
    expect(velo?.parentElement).toHaveClass('z-(--z-modal)');
    // Una sola clase para los dos temas: el token se redefine bajo `.dark`, así
    // que no hay variante `dark:` que olvidar.
    expect(velo).toHaveClass('bg-(--color-veil)');
    expect(velo?.className).not.toMatch(/dark:bg-black/);
    // El velo desenfoca el chrome que queda debajo (sidebar, header y subnav).
    expect(velo).toHaveClass('backdrop-blur-sm');

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveClass('relative');
    expect(dialog.parentElement).toHaveClass('z-(--z-modal)');

    // Cierra en `mousedown`, no en `click`.
    fireEvent.mouseDown(velo as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);

    // Flush del fetch del kardex para que la resolución de `listMovements`
    // quede dentro de act() y no genere actualizaciones fuera de act.
    await waitFor(() => {
      expect(screen.getByText('Sin movimientos')).toBeInTheDocument();
    });
  });
});

describe('StockItemDetailDrawer · lote legible en saldos por bodega', () => {
  const lotBalances: StockBalanceRecord[] = [
    {
      id: 'bal-1',
      tenantId: 'tenant-1',
      itemId: 'item-1',
      locationId: 'loc-1',
      lotId: 'a4bf078e-1111-4111-8111-111111111111',
      lotNumber: '09092026',
      condition: StockBalanceCondition.NEW,
      quantityOnHand: '300.00',
      quantityReserved: '0.00',
      createdAt: '2026-09-09T10:00:00.000Z',
      updatedAt: '2026-09-09T10:00:00.000Z',
    },
    {
      id: 'bal-2',
      tenantId: 'tenant-1',
      itemId: 'item-1',
      locationId: 'loc-1',
      lotId: 'b5cf189f-2222-4222-8222-222222222222',
      condition: StockBalanceCondition.NEW,
      quantityOnHand: '10.00',
      quantityReserved: '0.00',
      createdAt: '2026-09-09T10:00:00.000Z',
      updatedAt: '2026-09-09T10:00:00.000Z',
    },
    {
      id: 'bal-3',
      tenantId: 'tenant-1',
      itemId: 'item-1',
      locationId: 'loc-1',
      lotId: null,
      condition: StockBalanceCondition.NEW,
      quantityOnHand: '5.00',
      quantityReserved: '0.00',
      createdAt: '2026-09-09T10:00:00.000Z',
      updatedAt: '2026-09-09T10:00:00.000Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    listMovementsMock.mockResolvedValue({ data: [], total: 0, page: 1, limit: 10 });
  });

  it('muestra el número de lote capturado al registrar la compra', async () => {
    render(
      <StockItemDetailDrawer
        open
        item={item}
        balances={lotBalances}
        locations={[]}
        onClose={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('09092026')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Lote a4bf078e/i)).not.toBeInTheDocument();
  });

  it('degrada a UUID corto sin lotNumber y a Sin lote sin lotId', async () => {
    render(
      <StockItemDetailDrawer
        open
        item={item}
        balances={lotBalances}
        locations={[]}
        onClose={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('09092026')).toBeInTheDocument();
    });
    expect(screen.getByText('Lote b5cf189f')).toBeInTheDocument();
    expect(screen.getByText('Sin lote')).toBeInTheDocument();
  });
});
