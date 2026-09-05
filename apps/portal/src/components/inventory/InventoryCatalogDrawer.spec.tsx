import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
import {
  buildPayload,
  InventoryCatalogDrawer,
  validateCatalogBarcode,
  type CatalogFormState,
} from './InventoryCatalogDrawer';
import {
  formatInventoryCostOrNone,
  INVENTORY_AVERAGE_COST_HELP_TEXT,
  INVENTORY_AVERAGE_COST_LABEL,
  INVENTORY_BARCODE_PAIR_TYPE_MISSING_MESSAGE,
  INVENTORY_BARCODE_PAIR_VALUE_MISSING_MESSAGE,
  INVENTORY_CATALOG_COSTS_SECTION_HELP_TEXT,
  INVENTORY_CATALOG_PURCHASE_FACTOR_ERROR,
  INVENTORY_CATALOG_PURCHASE_UOM_DIMENSION_ERROR,
  INVENTORY_CATALOG_SUPPLIERS_NO_PERMISSION_HELP_TEXT,
  INVENTORY_LAST_PURCHASE_COST_LABEL,
  INVENTORY_NO_COST_LABEL,
  INVENTORY_STANDARD_COST_LABEL,
} from './inventory-labels';

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

describe('InventoryCatalogDrawer · costos F4', () => {
  it('muestra costo promedio y último costo de compra con ayuda (CA-F4-05)', () => {
    renderDrawer();

    expect(screen.getByText(INVENTORY_AVERAGE_COST_LABEL)).toBeInTheDocument();
    expect(screen.getByText(INVENTORY_LAST_PURCHASE_COST_LABEL)).toBeInTheDocument();
    // §4: mismo label exacto en Costos (solo lectura) y en Compras (captura).
    expect(screen.getAllByText(INVENTORY_STANDARD_COST_LABEL)).toHaveLength(2);
    // A2: el drawer usa la constante nueva; la compartida queda intacta en otras superficies.
    expect(screen.getByText(INVENTORY_CATALOG_COSTS_SECTION_HELP_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(INVENTORY_AVERAGE_COST_HELP_TEXT)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) => element?.textContent === formatInventoryCostOrNone('116500'),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) => element?.textContent === formatInventoryCostOrNone('115000'),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) => element?.textContent === formatInventoryCostOrNone('118000'),
      ),
    ).toBeInTheDocument();
  });

  it('muestra Sin costo cuando averageCost es 0', () => {
    renderDrawer({ item: { ...item, averageCost: '0', lastPurchaseCost: null } });

    expect(screen.getAllByText(INVENTORY_NO_COST_LABEL).length).toBeGreaterThanOrEqual(1);
  });

  it('muestra Sin costo cuando standardCost es 0 (mismo empty que promedio/último)', () => {
    renderDrawer({ item: { ...item, standardCost: '0' } });

    const costsSection = screen
      .getByText(INVENTORY_CATALOG_COSTS_SECTION_HELP_TEXT)
      .closest('section')!;
    const standardDt = within(costsSection).getByText(INVENTORY_STANDARD_COST_LABEL);
    expect(standardDt.closest('div')).toHaveTextContent(INVENTORY_NO_COST_LABEL);
    expect(screen.getByLabelText('Costo estándar')).toHaveValue('0');
  });

  it('averageCost y lastPurchaseCost jamás son de captura (CA-F1-08)', () => {
    renderDrawer();

    expect(screen.queryByLabelText(INVENTORY_AVERAGE_COST_LABEL)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(INVENTORY_LAST_PURCHASE_COST_LABEL)).not.toBeInTheDocument();
  });
});

describe('InventoryCatalogDrawer · F1 encabezado y secciones', () => {
  it('usa el copy nuevo del header y retira el párrafo obsoleto (CA-F1-07)', () => {
    renderDrawer({
      supplierOptions: [{ id: 'supplier-1', name: 'Proveedor Alfa' }],
    });

    expect(
      screen.getByText(
        'Edita los datos del producto: identificación, compras, inventario, activos y relación comercial.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Edita los datos base del producto dentro del catálogo.'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'Compras, inventario y activos se administran desde sus secciones correspondientes.',
      ),
    ).not.toBeInTheDocument();
  });

  it('presenta las cinco secciones del HLD §7 con sus descripciones', () => {
    renderDrawer({
      supplierOptions: [{ id: 'supplier-1', name: 'Proveedor Alfa' }],
    });

    expect(screen.getByText('Datos del producto')).toBeInTheDocument();
    expect(screen.getByText('Compras')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Define si el producto se puede comprar y sus condiciones de abastecimiento.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Inventario')).toBeInTheDocument();
    expect(
      screen.getByText('Define si el producto se controla en bodega y sus niveles de referencia.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Activos')).toBeInTheDocument();
    expect(
      screen.getByText('Define si el producto se gestiona como activo y su vida útil.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Relación comercial')).toBeInTheDocument();
  });

  it('unidad de compra y factor presentes en la sección Compras (incorporación ADR-085)', () => {
    renderDrawer({
      supplierOptions: [{ id: 'supplier-1', name: 'Proveedor Alfa' }],
    });

    const purchaseCombo = screen.getByRole('combobox', { name: 'Unidad de compra' });
    expect(purchaseCombo).toBeInTheDocument();
    // Opcional: placeholder «Sin unidad de compra» cuando no hay dato guardado.
    expect(purchaseCombo).toHaveTextContent('Sin unidad de compra');
    expect(screen.getByLabelText('Factor de conversión a unidad base')).toBeInTheDocument();
    expect(screen.getByText(/Junto con el factor de conversión determina/)).toBeInTheDocument();
    expect(screen.getByText(/Cuántas unidades base trae una unidad de compra/)).toBeInTheDocument();
  });

  it('F5a: la unidad base se elige del catálogo canónico y persiste su código', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderDrawer({
      item: {
        ...item,
        trackingMode: InventoryTrackingMode.CONSUMABLE,
        assetControlled: false,
        unitOfMeasure: 'UNIT',
      },
      supplierOptions: [],
    });

    // Etiqueta en español, sin texto libre.
    expect(screen.queryByRole('textbox', { name: 'Unidad de medida' })).not.toBeInTheDocument();
    const unitSelect = screen.getByRole('combobox', { name: 'Unidad de medida' });
    expect(unitSelect).toHaveTextContent('Unidad');

    await user.click(unitSelect);
    await user.click(await screen.findByRole('option', { name: 'Caja' }));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate.mock.calls[0]![1]).toMatchObject({ unitOfMeasure: 'BOX' });
  });
});

describe('InventoryCatalogDrawer · F1 hidratación de los 14 campos', () => {
  const hydratedItem: InventoryItemRecord = {
    ...item,
    trackingMode: InventoryTrackingMode.CONSUMABLE,
    purchasable: false,
    preferredSupplierRefId: 'supplier-1',
    supplierSku: 'PROV-ONT-1',
    purchaseUnitOfMeasure: 'BOX',
    purchaseToBaseUomFactor: '100',
    baseCost: '120000',
    standardCost: '118000',
    minimumOrderQty: '10',
    orderMultiple: '5',
    leadTimeDays: 7,
    inventoryControlled: false,
    minimumStock: '2',
    reorderPoint: '5',
    targetStock: '20',
    assetControlled: false,
    usefulLifeMonths: 36,
  };

  it('hidrata booleanos, textos, strings numéricos y enteros number|null', () => {
    renderDrawer({
      item: hydratedItem,
      supplierOptions: [{ id: 'supplier-1', name: 'Proveedor Alfa' }],
    });

    expect(screen.getByRole('checkbox', { name: /Comprable/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Control de inventario/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Control de activo/ })).not.toBeChecked();
    expect(screen.getByRole('combobox', { name: 'Proveedor preferido' })).toHaveTextContent(
      'Proveedor Alfa',
    );
    expect(screen.getByLabelText('Código del proveedor')).toHaveValue('PROV-ONT-1');
    // Unidad de compra: código del catálogo → etiqueta en español; factor string crudo.
    expect(screen.getByRole('combobox', { name: 'Unidad de compra' })).toHaveTextContent('Caja');
    expect(screen.getByLabelText('Factor de conversión a unidad base')).toHaveValue('100');
    expect(screen.getByLabelText('Costo base')).toHaveValue('120000');
    expect(screen.getByLabelText('Costo estándar')).toHaveValue('118000');
    expect(screen.getByLabelText('Cantidad mínima de compra')).toHaveValue('10');
    expect(screen.getByLabelText('Múltiplo de compra')).toHaveValue('5');
    expect(screen.getByLabelText('Tiempo de entrega (días)')).toHaveValue('7');
    expect(screen.getByLabelText('Stock mínimo')).toHaveValue('2');
    expect(screen.getByLabelText('Punto de reorden')).toHaveValue('5');
    expect(screen.getByLabelText('Stock objetivo')).toHaveValue('20');
    expect(screen.getByLabelText('Vida útil (meses)')).toHaveValue('36');
  });

  it('edita y persiste los 14 campos vía onUpdate', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderDrawer({
      item: { ...item, trackingMode: InventoryTrackingMode.CONSUMABLE, assetControlled: false },
      supplierOptions: [
        { id: 'supplier-1', name: 'Proveedor Alfa' },
        { id: 'supplier-2', name: 'Proveedor Beta' },
      ],
    });

    await user.click(screen.getByRole('checkbox', { name: /Comprable/ }));
    await user.click(screen.getByRole('combobox', { name: 'Proveedor preferido' }));
    await user.click(screen.getByRole('option', { name: 'Proveedor Beta' }));
    await user.type(screen.getByLabelText('Código del proveedor'), 'BETA-9');
    await user.type(screen.getByLabelText('Cantidad mínima de compra'), '10');
    await user.type(screen.getByLabelText('Tiempo de entrega (días)'), '7');
    const stockMinimo = screen.getByLabelText('Stock mínimo');
    await user.clear(stockMinimo);
    await user.type(stockMinimo, '9');
    await user.click(screen.getByRole('checkbox', { name: /Control de inventario/ }));
    const usefulLife = screen.getByLabelText('Vida útil (meses)');
    await user.clear(usefulLife);
    await user.type(usefulLife, '24');

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    const payload = onUpdate.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload.purchasable).toBe(false);
    expect(payload.preferredSupplierRefId).toBe('supplier-2');
    expect(payload.supplierSku).toBe('BETA-9');
    expect(payload.minimumOrderQty).toBe(10);
    expect(payload.leadTimeDays).toBe(7);
    expect(payload.minimumStock).toBe(9);
    expect(payload.inventoryControlled).toBe(false);
    expect(payload.usefulLifeMonths).toBe(24);
  });
});

describe('InventoryCatalogDrawer · F1 buildPayload (14 campos + 2 de UoM de compra)', () => {
  const baseForm: CatalogFormState = {
    sku: 'ONT-001',
    name: 'ONT WiFi 6',
    description: 'Terminal',
    brand: 'FiberCo',
    model: 'X6',
    barcode: '',
    barcodeType: '',
    itemKind: InventoryItemKind.SERIALIZED,
    categoryId: 'cat-cpe',
    trackingMode: InventoryTrackingMode.CONSUMABLE,
    unitOfMeasure: 'UNIT',
    status: InventoryItemStatus.ACTIVE,
    commercialReferenceId: '',
    purchasable: true,
    preferredSupplierRefId: '',
    supplierSku: '',
    purchaseUnitOfMeasure: '',
    purchaseToBaseUomFactor: '',
    baseCost: '',
    standardCost: '',
    minimumOrderQty: '',
    orderMultiple: '',
    leadTimeDays: '',
    inventoryControlled: true,
    minimumStock: '',
    reorderPoint: '',
    targetStock: '',
    assetControlled: false,
    usefulLifeMonths: '',
  };

  it('emite los 28 campos completos con unidad de compra y factor', () => {
    const payload = buildPayload({
      ...baseForm,
      purchasable: false,
      preferredSupplierRefId: 'supplier-1',
      supplierSku: '  PROV-1  ',
      purchaseUnitOfMeasure: 'BOX',
      purchaseToBaseUomFactor: '100',
      baseCost: '120000',
      standardCost: '118000',
      minimumOrderQty: '10',
      orderMultiple: '5',
      leadTimeDays: '7',
      inventoryControlled: false,
      minimumStock: '2',
      reorderPoint: '5',
      targetStock: '20',
      assetControlled: true,
      usefulLifeMonths: '36',
    });

    expect(payload).toEqual({
      name: 'ONT WiFi 6',
      description: 'Terminal',
      brand: 'FiberCo',
      model: 'X6',
      barcode: null,
      barcodeType: null,
      itemKind: InventoryItemKind.SERIALIZED,
      categoryId: 'cat-cpe',
      trackingMode: InventoryTrackingMode.CONSUMABLE,
      unitOfMeasure: 'UNIT',
      status: InventoryItemStatus.ACTIVE,
      commercialReferenceId: null,
      purchasable: false,
      preferredSupplierRefId: 'supplier-1',
      supplierSku: 'PROV-1',
      purchaseUnitOfMeasure: 'BOX',
      purchaseToBaseUomFactor: 100,
      baseCost: 120000,
      standardCost: 118000,
      minimumOrderQty: 10,
      orderMultiple: 5,
      leadTimeDays: 7,
      inventoryControlled: false,
      minimumStock: 2,
      reorderPoint: 5,
      targetStock: 20,
      assetControlled: true,
      usefulLifeMonths: 36,
    });
    expect(Object.keys(payload)).toHaveLength(28);
  });

  it('vacíos e inválidos caen a defaults (0 o null)', () => {
    const payload = buildPayload({
      ...baseForm,
      preferredSupplierRefId: '   ',
      supplierSku: '   ',
      purchaseUnitOfMeasure: '   ',
      purchaseToBaseUomFactor: '   ',
      baseCost: 'no-numérico',
    });

    expect(payload.preferredSupplierRefId).toBeNull();
    expect(payload.supplierSku).toBeNull();
    expect(payload.barcode).toBeNull();
    expect(payload.barcodeType).toBeNull();
    expect(payload.purchaseUnitOfMeasure).toBeNull();
    expect(payload.purchaseToBaseUomFactor).toBeNull();
    expect(payload.baseCost).toBe(0);
    expect(payload.standardCost).toBe(0);
    expect(payload.minimumOrderQty).toBeNull();
    expect(payload.orderMultiple).toBeNull();
    expect(payload.leadTimeDays).toBeNull();
    expect(payload.minimumStock).toBe(0);
    expect(payload.reorderPoint).toBe(0);
    expect(payload.targetStock).toBe(0);
    expect(payload.usefulLifeMonths).toBeNull();
  });

  it.each([InventoryTrackingMode.SERIALIZED, InventoryTrackingMode.FIXED_ASSET])(
    'fuerza assetControlled=true con trackingMode %s aunque el form diga false',
    (trackingMode) => {
      const payload = buildPayload({ ...baseForm, trackingMode, assetControlled: false });

      expect(payload.assetControlled).toBe(true);
    },
  );
});

describe('InventoryCatalogDrawer · F1 degradación del selector sin permiso', () => {
  it('deshabilita con explicación y preserva el refId original al guardar', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderDrawer({
      item: {
        ...item,
        trackingMode: InventoryTrackingMode.CONSUMABLE,
        assetControlled: false,
        preferredSupplierRefId: 'supplier-9',
      },
      canReadPurchasing: false,
    });

    const supplierCombo = screen.getByRole('combobox', { name: 'Proveedor preferido' });
    expect(supplierCombo).toBeDisabled();
    expect(supplierCombo).toHaveTextContent('Proveedor guardado');
    expect(
      screen.getByText(INVENTORY_CATALOG_SUPPLIERS_NO_PERMISSION_HELP_TEXT),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate.mock.calls[0]![1].preferredSupplierRefId).toBe('supplier-9');
  });

  it('muestra Sin proveedor preferido cuando no hay refId guardado', () => {
    renderDrawer({ canReadPurchasing: false });

    expect(screen.getByRole('combobox', { name: 'Proveedor preferido' })).toHaveTextContent(
      'Sin proveedor preferido',
    );
  });

  it('estado cargando: deshabilitado con su copy', () => {
    renderDrawer({ supplierOptionsLoading: true });

    const supplierCombo = screen.getByRole('combobox', { name: 'Proveedor preferido' });
    expect(supplierCombo).toBeDisabled();
    expect(supplierCombo).toHaveTextContent('Cargando proveedores…');
    expect(screen.getByText('Cargando la lista de proveedores.')).toBeInTheDocument();
  });

  it('error de carga: deshabilitado, conserva el nombre resoluble y explica el reintento', () => {
    renderDrawer({
      item: { ...item, preferredSupplierRefId: 'supplier-1' },
      supplierOptionsError: 'Error de red',
      preferredSupplierName: 'Proveedor Alfa',
    });

    const supplierCombo = screen.getByRole('combobox', { name: 'Proveedor preferido' });
    expect(supplierCombo).toBeDisabled();
    expect(supplierCombo).toHaveTextContent('Proveedor Alfa');
    expect(
      screen.getByText(
        'No pudimos cargar la lista de proveedores. Reintenta abriendo de nuevo el producto.',
      ),
    ).toBeInTheDocument();
  });

  it('error de carga sin nombre resoluble: muestra Proveedor guardado', () => {
    renderDrawer({
      item: { ...item, preferredSupplierRefId: 'supplier-1' },
      supplierOptionsError: 'Error de red',
      preferredSupplierName: null,
    });

    expect(screen.getByRole('combobox', { name: 'Proveedor preferido' })).toHaveTextContent(
      'Proveedor guardado',
    );
  });

  it('tenant sin proveedores: select activo con opción deshabilitada y ayuda', async () => {
    const user = userEvent.setup();
    renderDrawer({ supplierOptions: [] });

    const supplierCombo = screen.getByRole('combobox', { name: 'Proveedor preferido' });
    expect(supplierCombo).toBeEnabled();
    expect(screen.getByText('Puedes crearlos en Compras > Proveedores.')).toBeInTheDocument();

    await user.click(supplierCombo);

    const emptyOption = await screen.findByRole('option', { name: 'Sin proveedores registrados' });
    expect(emptyOption).toBeDisabled();
  });
});

describe('InventoryCatalogDrawer · F1 reglas cruzadas y validación', () => {
  it('con serial o activo fijo el control de activo va marcado, bloqueado y con aviso', () => {
    renderDrawer();

    const assetCheckbox = screen.getByRole('checkbox', { name: /Control de activo/ });
    expect(assetCheckbox).toBeChecked();
    expect(assetCheckbox).toBeDisabled();
    expect(
      screen.getByText('Los productos con serial o activo fijo requieren control de activo.'),
    ).toBeInTheDocument();
  });

  it('cambiar Control de material a Con serial marca y bloquea el control de activo', async () => {
    const user = userEvent.setup();
    renderDrawer({
      item: { ...item, trackingMode: InventoryTrackingMode.CONSUMABLE, assetControlled: false },
      supplierOptions: [],
    });

    expect(screen.getByRole('checkbox', { name: /Control de activo/ })).not.toBeChecked();

    await user.click(screen.getByRole('combobox', { name: 'Control de material' }));
    await user.click(screen.getByRole('option', { name: 'Con serial' }));

    const assetCheckbox = screen.getByRole('checkbox', { name: /Control de activo/ });
    expect(assetCheckbox).toBeChecked();
    expect(assetCheckbox).toBeDisabled();
    expect(
      screen.getByText('Los productos con serial o activo fijo requieren control de activo.'),
    ).toBeInTheDocument();
  });

  it('reorderPoint negativo: el error reemplaza al helper y bloquea el guardado (A3)', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderDrawer({
      item: { ...item, trackingMode: InventoryTrackingMode.CONSUMABLE, assetControlled: false },
      supplierOptions: [],
    });

    const reorderPoint = screen.getByLabelText('Punto de reorden');
    await user.clear(reorderPoint);
    await user.type(reorderPoint, '-2');
    fireEvent.blur(reorderPoint);

    expect(
      await screen.findByText('El punto de reorden no puede ser negativo.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Nivel de referencia para sugerir reposición.'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(onUpdate).not.toHaveBeenCalled();

    await user.clear(reorderPoint);
    await user.type(reorderPoint, '4');
    fireEvent.blur(reorderPoint);

    await waitFor(() =>
      expect(
        screen.queryByText('El punto de reorden no puede ser negativo.'),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Nivel de referencia para sugerir reposición.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate.mock.calls[0]![1].reorderPoint).toBe(4);
  });

  it('costo negativo en blur muestra su error exacto', async () => {
    const user = userEvent.setup();
    renderDrawer({ supplierOptions: [] });

    const baseCost = screen.getByLabelText('Costo base');
    await user.clear(baseCost);
    await user.type(baseCost, '-5');
    fireEvent.blur(baseCost);

    expect(await screen.findByText('El costo no puede ser negativo.')).toBeInTheDocument();
    expect(
      screen.queryByText('Costo de compra de referencia para este producto.'),
    ).not.toBeInTheDocument();
  });
});

describe('InventoryCatalogDrawer · UoM de compra (incorporación ADR-085 tras F5a/F5b)', () => {
  const consumableItem: InventoryItemRecord = {
    ...item,
    trackingMode: InventoryTrackingMode.CONSUMABLE,
    assetControlled: false,
    unitOfMeasure: 'UNIT',
    purchaseUnitOfMeasure: null,
    purchaseToBaseUomFactor: null,
  };

  it('edita unidad de compra + factor y los persiste vía onUpdate', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderDrawer({ item: consumableItem, supplierOptions: [] });

    await user.click(screen.getByRole('combobox', { name: 'Unidad de compra' }));
    await user.click(await screen.findByRole('option', { name: 'Paquete' }));
    await user.type(screen.getByLabelText('Factor de conversión a unidad base'), '2.5');

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate.mock.calls[0]![1]).toMatchObject({
      purchaseUnitOfMeasure: 'PACK',
      purchaseToBaseUomFactor: 2.5,
    });
  });

  it('guía D2: combo entre dimensiones distintas marca el error y bloquea el guardado', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderDrawer({ item: consumableItem, supplierOptions: [] });

    // Base UNIT (Conteo) frente a compra Metro (Longitud): dimensionalmente incompatible.
    await user.click(screen.getByRole('combobox', { name: 'Unidad de compra' }));
    await user.click(await screen.findByRole('option', { name: 'Metro' }));
    await user.type(screen.getByLabelText('Factor de conversión a unidad base'), '100');

    expect(
      await screen.findByText(INVENTORY_CATALOG_PURCHASE_UOM_DIMENSION_ERROR),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Unidad en la que el proveedor entrega el producto/),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('guía D2: combo de empaque dentro de Conteo (Caja sobre base Unidad) guarda sin error', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderDrawer({ item: consumableItem, supplierOptions: [] });

    await user.click(screen.getByRole('combobox', { name: 'Unidad de compra' }));
    await user.click(await screen.findByRole('option', { name: 'Caja' }));
    await user.type(screen.getByLabelText('Factor de conversión a unidad base'), '100');

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByText(INVENTORY_CATALOG_PURCHASE_UOM_DIMENSION_ERROR),
    ).not.toBeInTheDocument();
    expect(onUpdate.mock.calls[0]![1]).toMatchObject({
      purchaseUnitOfMeasure: 'BOX',
      purchaseToBaseUomFactor: 100,
    });
  });

  it('factor ≤ 0 con unidad de compra: error en blur y guardado bloqueado hasta corregir', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderDrawer({ item: consumableItem, supplierOptions: [] });

    await user.click(screen.getByRole('combobox', { name: 'Unidad de compra' }));
    await user.click(await screen.findByRole('option', { name: 'Caja' }));
    const factor = screen.getByLabelText('Factor de conversión a unidad base');
    await user.type(factor, '0');
    fireEvent.blur(factor);

    expect(await screen.findByText(INVENTORY_CATALOG_PURCHASE_FACTOR_ERROR)).toBeInTheDocument();
    expect(
      screen.queryByText(/Cuántas unidades base trae una unidad de compra/),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(onUpdate).not.toHaveBeenCalled();

    await user.clear(factor);
    await user.type(factor, '100');
    fireEvent.blur(factor);

    await waitFor(() =>
      expect(screen.queryByText(INVENTORY_CATALOG_PURCHASE_FACTOR_ERROR)).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate.mock.calls[0]![1]).toMatchObject({
      purchaseUnitOfMeasure: 'BOX',
      purchaseToBaseUomFactor: 100,
    });
  });

  it('elegir Sin unidad de compra limpia los errores del par y guarda en null', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderDrawer({
      item: {
        ...consumableItem,
        purchaseUnitOfMeasure: 'BOX',
        purchaseToBaseUomFactor: '100',
      },
      supplierOptions: [],
    });

    // Se fuerza el error del factor y luego se retira la unidad de compra: la regla deja de aplicar.
    const factor = screen.getByLabelText('Factor de conversión a unidad base');
    await user.clear(factor);
    await user.type(factor, '0');
    fireEvent.blur(factor);
    expect(await screen.findByText(INVENTORY_CATALOG_PURCHASE_FACTOR_ERROR)).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Unidad de compra' }));
    await user.click(await screen.findByRole('option', { name: 'Sin unidad de compra' }));

    await waitFor(() =>
      expect(screen.queryByText(INVENTORY_CATALOG_PURCHASE_FACTOR_ERROR)).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate.mock.calls[0]![1]).toMatchObject({
      purchaseUnitOfMeasure: null,
      // La UI no borra el campo silenciosamente (spec §5.2): el '0' del usuario viaja como 0.
      purchaseToBaseUomFactor: 0,
    });
  });
});

describe('InventoryCatalogDrawer · F4 código de barras (PRD §11)', () => {
  it('hidrata código y formato, editables a diferencia del código (regla 6)', () => {
    renderDrawer({
      item: { ...item, barcode: '4006381333931', barcodeType: 'EAN13' as never },
    });

    expect(screen.getByLabelText('Código de barras')).toHaveValue('4006381333931');
    expect(screen.getByRole('combobox', { name: 'Formato del código' })).toHaveTextContent(
      'EAN-13',
    );
    // El código sigue bloqueado; el código de barras no.
    expect(screen.getByLabelText('Código')).toBeDisabled();
    expect(screen.getByLabelText('Código de barras')).toBeEnabled();
    expect(
      screen.getByText(
        'Opcional. Se puede corregir después, a diferencia del código. Para quitarlo, deja vacíos el código y el formato.',
      ),
    ).toBeInTheDocument();
  });

  it('edita el par y lo persiste vía onUpdate (CA-F4-01)', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderDrawer({ item });

    // fireEvent.change para el tecleo largo: userEvent trunca el tecleo en
    // este drawer (quirk jsdom, ver informe F4 §Bloqueos); no es bug de producto.
    fireEvent.change(screen.getByLabelText('Código de barras'), {
      target: { value: '8412345678905' },
    });
    fireEvent.click(screen.getByRole('combobox', { name: 'Formato del código' }));
    fireEvent.click(await screen.findByRole('option', { name: 'EAN-13' }));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate.mock.calls[0]![1]).toMatchObject({
      barcode: '8412345678905',
      barcodeType: 'EAN13',
    });
  });

  it('limpiar ambos campos guarda null/null y quita el código (CA-F4-01)', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderDrawer({
      item: { ...item, barcode: '4006381333931', barcodeType: 'EAN13' as never },
    });

    const barcodeInput = screen.getByLabelText('Código de barras');
    await user.clear(barcodeInput);
    await user.click(screen.getByRole('combobox', { name: 'Formato del código' }));
    await user.click(await screen.findByRole('option', { name: 'Sin código de barras' }));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate.mock.calls[0]![1]).toMatchObject({ barcode: null, barcodeType: null });
  });

  it('dígito de control inválido muestra el motivo y bloquea el guardado (CA-F4-03)', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderDrawer({ item });

    fireEvent.change(screen.getByLabelText('Código de barras'), {
      target: { value: '8412345678904' },
    });
    fireEvent.click(screen.getByRole('combobox', { name: 'Formato del código' }));
    fireEvent.click(await screen.findByRole('option', { name: 'EAN-13' }));
    fireEvent.blur(screen.getByLabelText('Código de barras'));

    expect(
      await screen.findByText(
        'El dígito de control del código EAN13 no es válido: revisa que el número esté completo y sin errores de tecleo.',
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('pareja a medias bloquea el guardado (CA-F4-08)', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderDrawer({ item });

    fireEvent.change(screen.getByLabelText('Código de barras'), {
      target: { value: '4006381333931' },
    });
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(
      await screen.findByText('Indica el formato del código: el formato va junto al código.'),
    ).toBeInTheDocument();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('validateCatalogBarcode: par ausente válido, mitades rechazadas, dígito verificado', () => {
    expect(validateCatalogBarcode({ barcode: '', barcodeType: '' })).toBeNull();
    expect(validateCatalogBarcode({ barcode: '   ', barcodeType: '' })).toBeNull();
    expect(validateCatalogBarcode({ barcode: '4006381333931', barcodeType: '' })).toBe(
      INVENTORY_BARCODE_PAIR_TYPE_MISSING_MESSAGE,
    );
    expect(validateCatalogBarcode({ barcode: '', barcodeType: 'EAN13' })).toBe(
      INVENTORY_BARCODE_PAIR_VALUE_MISSING_MESSAGE,
    );
    expect(validateCatalogBarcode({ barcode: '4006381333931', barcodeType: 'EAN13' })).toBeNull();
    expect(validateCatalogBarcode({ barcode: '8412345678904', barcodeType: 'EAN13' })).toBe(
      'El dígito de control del código EAN13 no es válido: revisa que el número esté completo y sin errores de tecleo.',
    );
  });
});
