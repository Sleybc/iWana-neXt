import { configure, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps } from 'react';
import {
  InventoryCategoryStatus,
  InventoryItemCategory,
  InventoryItemKind,
  InventoryItemStatus,
  InventoryTrackingMode,
} from '@iwana/shared';
import type { InventoryCategoryRecord, InventoryItemRecord } from '@/lib/api-client';
import { InventoryCatalogDrawer, validateCatalogItemCoherence } from './InventoryCatalogDrawer';
import {
  INVENTORY_CATALOG_ITEM_KIND_HELP_TEXT,
  INVENTORY_CATALOG_TRACKING_MODE_HELP_TEXT,
  INVENTORY_ITEM_KIND_TRACKING_MISMATCH_MESSAGE,
} from './inventory-labels';

/**
 * Coherencia del maestro `itemKind` ↔ `trackingMode` (MOD12 Fase S2 · Track A,
 * CA-S2-01/02).
 *
 * Vive en su propio spec y no dentro de `InventoryCatalogDrawer.spec.tsx`: los
 * 6 casos de este bloque llevaron aquel archivo a 42 tests y el conjunto pasó a
 * agotar el reloj del caso «reorderPoint negativo (A3)», que falla en archivo
 * completo y pasa aislado. Subir su timeout ya se intentó (`0ef8b88d`) sin
 * resolverlo: la causa es la carga acumulada del archivo, no la espera.
 */

// Mismo presupuesto de espera que el spec hermano: el drawer valida en `blur` y
// pinta en un re-render posterior (ver la nota extensa en
// `InventoryCatalogDrawer.spec.tsx`).
configure({ asyncUtilTimeout: 5000 });

const item: InventoryItemRecord = {
  id: 'item-1',
  tenantId: 'tenant-1',
  sku: 'ONT-001',
  name: 'ONT WiFi 6',
  description: null,
  brand: 'FiberCo',
  model: 'X6',
  itemKind: InventoryItemKind.SERIALIZED,
  category: InventoryItemCategory.CPE,
  categoryId: 'cat-cpe',
  categoryName: 'CPE',
  categoryCode: 'CPE',
  trackingMode: InventoryTrackingMode.SERIALIZED,
  unitOfMeasure: 'UNIT',
  baseCost: '120000',
  minimumStock: '2',
  purchasable: true,
  inventoryControlled: true,
  assetControlled: true,
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
  usefulLifeMonths: 36,
  commercialReferenceId: null,
  status: InventoryItemStatus.ACTIVE,
  barcode: null,
  barcodeType: null,
  createdAt: '2026-06-25T12:00:00.000Z',
  updatedAt: '2026-06-25T12:00:00.000Z',
};

const categories: InventoryCategoryRecord[] = [
  {
    id: 'cat-cpe',
    tenantId: 'tenant-1',
    code: 'CPE',
    codePrefix: 'CPE',
    name: 'CPE',
    description: null,
    status: InventoryCategoryStatus.ACTIVE,
    sortOrder: 1,
    productCount: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

type DrawerProps = ComponentProps<typeof InventoryCatalogDrawer>;

function renderDrawer(overrides: Partial<DrawerProps> = {}) {
  const onClose = jest.fn();
  const onUpdate = jest.fn().mockResolvedValue(undefined);
  render(
    <InventoryCatalogDrawer
      open
      item={item}
      categories={categories}
      commercialProductOptions={[]}
      supplierOptions={[]}
      supplierOptionsLoading={false}
      supplierOptionsError={null}
      canReadPurchasing
      preferredSupplierName={null}
      isSubmitting={false}
      error={null}
      onClose={onClose}
      onUpdate={onUpdate}
      {...overrides}
    />,
  );
  return { onClose, onUpdate };
}

describe('InventoryCatalogDrawer · Fase S2 coherencia del maestro (CA-S2-01/02)', () => {
  /** Ítem almacenable consumible: sin serial en ninguno de los dos campos. */
  const consumableStockItem: InventoryItemRecord = {
    ...item,
    itemKind: InventoryItemKind.STOCK,
    trackingMode: InventoryTrackingMode.CONSUMABLE,
    assetControlled: false,
  };

  it('muestra el helperText de guía en ambos Selects (copy G1)', () => {
    renderDrawer({ item: consumableStockItem });

    expect(screen.getByText(INVENTORY_CATALOG_ITEM_KIND_HELP_TEXT)).toBeInTheDocument();
    expect(screen.getByText(INVENTORY_CATALOG_TRACKING_MODE_HELP_TEXT)).toBeInTheDocument();
  });

  it('elegir "Con serial" en Tipo de producto ajusta Control de material a "Con serial" en el mismo cambio (CA-S2-02)', async () => {
    const user = userEvent.setup();
    renderDrawer({ item: consumableStockItem });

    const trackingCombo = screen.getByRole('combobox', { name: 'Control de material' });
    expect(trackingCombo).toHaveTextContent('Consumible');

    await user.click(screen.getByRole('combobox', { name: 'Tipo de producto' }));
    await user.click(await screen.findByRole('option', { name: 'Con serial' }));

    expect(screen.getByRole('combobox', { name: 'Tipo de producto' })).toHaveTextContent(
      'Con serial',
    );
    expect(trackingCombo).toHaveTextContent('Con serial');
    // La guía existente de control de activo sigue encadenada al mismo cambio.
    expect(screen.getByRole('checkbox', { name: /Control de activo/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Control de activo/ })).toBeDisabled();
  });

  it('elegir "Activo fijo" en Control de material ajusta Tipo de producto a "Con serial" (guía inversa G1)', async () => {
    const user = userEvent.setup();
    renderDrawer({ item: consumableStockItem });

    await user.click(screen.getByRole('combobox', { name: 'Control de material' }));
    await user.click(await screen.findByRole('option', { name: 'Activo fijo' }));

    expect(screen.getByRole('combobox', { name: 'Tipo de producto' })).toHaveTextContent(
      'Con serial',
    );
    expect(screen.getByRole('checkbox', { name: /Control de activo/ })).toBeChecked();
  });

  it('la guía proactiva persiste la pareja coherente vía onUpdate', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderDrawer({ item: consumableStockItem });

    await user.click(screen.getByRole('combobox', { name: 'Tipo de producto' }));
    await user.click(await screen.findByRole('option', { name: 'Con serial' }));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate.mock.calls[0]![1]).toMatchObject({
      itemKind: InventoryItemKind.SERIALIZED,
      trackingMode: InventoryTrackingMode.SERIALIZED,
      assetControlled: true,
    });
  });

  it('la vía guiada marca sucio igual que la edición directa: Cancelar pide confirmación (S2.1 C5)', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDrawer({ item: consumableStockItem });

    await user.click(screen.getByRole('combobox', { name: 'Tipo de producto' }));
    await user.click(await screen.findByRole('option', { name: 'Con serial' }));

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    // El cambio guiado cuenta como edición: no se descarta en silencio.
    expect(await screen.findByRole('dialog', { name: 'Descartar cambios' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ítem ya inconsistente: el guardado se bloquea con el mensaje exacto y se libera al corregir (CA-S2-01)', async () => {
    const user = userEvent.setup();
    // El caso real del catálogo: Tipo "Con serial" guardado con Control "Consumible".
    const inconsistentItem: InventoryItemRecord = {
      ...item,
      itemKind: InventoryItemKind.SERIALIZED,
      trackingMode: InventoryTrackingMode.CONSUMABLE,
      assetControlled: false,
    };
    const { onUpdate } = renderDrawer({ item: inconsistentItem });

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(
      await screen.findByText(INVENTORY_ITEM_KIND_TRACKING_MISMATCH_MESSAGE),
    ).toBeInTheDocument();
    expect(onUpdate).not.toHaveBeenCalled();

    await user.click(screen.getByRole('combobox', { name: 'Control de material' }));
    await user.click(await screen.findByRole('option', { name: 'Con serial' }));

    await waitFor(() =>
      expect(
        screen.queryByText(INVENTORY_ITEM_KIND_TRACKING_MISMATCH_MESSAGE),
      ).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate.mock.calls[0]![1]).toMatchObject({
      itemKind: InventoryItemKind.SERIALIZED,
      trackingMode: InventoryTrackingMode.SERIALIZED,
    });
  });

  it('validateCatalogItemCoherence: pareja coherente válida, contradicción con el copy G1', () => {
    expect(
      validateCatalogItemCoherence({
        itemKind: InventoryItemKind.SERIALIZED,
        trackingMode: InventoryTrackingMode.SERIALIZED,
      }),
    ).toBeNull();
    expect(
      validateCatalogItemCoherence({
        itemKind: InventoryItemKind.SERIALIZED,
        trackingMode: InventoryTrackingMode.FIXED_ASSET,
      }),
    ).toBeNull();
    expect(
      validateCatalogItemCoherence({
        itemKind: InventoryItemKind.STOCK,
        trackingMode: InventoryTrackingMode.CONSUMABLE,
      }),
    ).toBeNull();
    expect(
      validateCatalogItemCoherence({
        itemKind: InventoryItemKind.SERIALIZED,
        trackingMode: InventoryTrackingMode.CONSUMABLE,
      }),
    ).toBe(INVENTORY_ITEM_KIND_TRACKING_MISMATCH_MESSAGE);
    expect(
      validateCatalogItemCoherence({
        itemKind: InventoryItemKind.CONSUMABLE,
        trackingMode: InventoryTrackingMode.FIXED_ASSET,
      }),
    ).toBe(INVENTORY_ITEM_KIND_TRACKING_MISMATCH_MESSAGE);
  });
});
