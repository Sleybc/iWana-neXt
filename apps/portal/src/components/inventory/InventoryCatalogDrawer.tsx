'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@iwana/ui';
import {
  InventoryCategoryStatus,
  InventoryItemKind,
  InventoryItemStatus,
  InventoryTrackingMode,
} from '@iwana/shared';
import type {
  CreateInventoryItemDto,
  InventoryCategoryRecord,
  InventoryItemRecord,
  UpdateInventoryItemDto,
} from '@/lib/api-client';
import { PortalAlert, PortalSectionHeader } from '@/components/shared/portal-ui';
import {
  getInventoryItemKindLabel,
  getInventoryItemStatusLabel,
  getInventoryTrackingModeLabel,
} from './inventory-labels';
import { SupplierPicker } from './SupplierPicker';

const fieldClassName =
  'w-full rounded-2xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary dark:border-dark-border dark:bg-dark-surface-3 dark:text-white';

type CatalogDrawerTab = 'general' | 'purchasing' | 'inventory' | 'assets' | 'commercial';

const TAB_LABELS: Record<CatalogDrawerTab, string> = {
  general: 'General',
  purchasing: 'Compras',
  inventory: 'Inventario',
  assets: 'Activos',
  commercial: 'Relación comercial',
};

interface CatalogFormState {
  sku: string;
  name: string;
  description: string;
  brand: string;
  model: string;
  itemKind: InventoryItemKind;
  categoryId: string;
  trackingMode: InventoryTrackingMode;
  unitOfMeasure: string;
  status: InventoryItemStatus;
  purchasable: boolean;
  preferredSupplierRefId: string | null;
  preferredSupplierName: string | null;
  supplierSku: string;
  purchaseUnitOfMeasure: string;
  purchaseToBaseUomFactor: string;
  standardCost: string;
  lastPurchaseCost: string;
  minimumOrderQty: string;
  orderMultiple: string;
  leadTimeDays: string;
  inventoryControlled: boolean;
  baseCost: string;
  minimumStock: string;
  reorderPoint: string;
  targetStock: string;
  assetControlled: boolean;
  usefulLifeMonths: string;
  commercialReferenceId: string;
}

function defaultFormState(defaultCategoryId = ''): CatalogFormState {
  return {
    sku: '',
    name: '',
    description: '',
    brand: '',
    model: '',
    itemKind: InventoryItemKind.STOCK,
    categoryId: defaultCategoryId,
    trackingMode: InventoryTrackingMode.CONSUMABLE,
    unitOfMeasure: 'unidad',
    status: InventoryItemStatus.ACTIVE,
    purchasable: true,
    preferredSupplierRefId: null,
    preferredSupplierName: null,
    supplierSku: '',
    purchaseUnitOfMeasure: '',
    purchaseToBaseUomFactor: '',
    standardCost: '0',
    lastPurchaseCost: '',
    minimumOrderQty: '',
    orderMultiple: '',
    leadTimeDays: '',
    inventoryControlled: true,
    baseCost: '0',
    minimumStock: '0',
    reorderPoint: '0',
    targetStock: '0',
    assetControlled: false,
    usefulLifeMonths: '',
    commercialReferenceId: '',
  };
}

function formFromItem(item: InventoryItemRecord): CatalogFormState {
  return {
    sku: item.sku,
    name: item.name,
    description: item.description ?? '',
    brand: item.brand ?? '',
    model: item.model ?? '',
    itemKind: item.itemKind,
    categoryId: item.categoryId,
    trackingMode: item.trackingMode,
    unitOfMeasure: item.unitOfMeasure,
    status: item.status,
    purchasable: item.purchasable,
    preferredSupplierRefId: item.preferredSupplierRefId,
    preferredSupplierName: null,
    supplierSku: item.supplierSku ?? '',
    purchaseUnitOfMeasure: item.purchaseUnitOfMeasure ?? '',
    purchaseToBaseUomFactor: item.purchaseToBaseUomFactor ?? '',
    standardCost: item.standardCost,
    lastPurchaseCost: item.lastPurchaseCost ?? '',
    minimumOrderQty: item.minimumOrderQty ?? '',
    orderMultiple: item.orderMultiple ?? '',
    leadTimeDays: item.leadTimeDays !== null ? String(item.leadTimeDays) : '',
    inventoryControlled: item.inventoryControlled,
    baseCost: item.baseCost,
    minimumStock: item.minimumStock,
    reorderPoint: item.reorderPoint,
    targetStock: item.targetStock,
    assetControlled: item.assetControlled,
    usefulLifeMonths: item.usefulLifeMonths !== null ? String(item.usefulLifeMonths) : '',
    commercialReferenceId: item.commercialReferenceId ?? '',
  };
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildPayload(form: CatalogFormState): CreateInventoryItemDto {
  const requiresAssetControl =
    form.trackingMode === InventoryTrackingMode.SERIALIZED ||
    form.trackingMode === InventoryTrackingMode.FIXED_ASSET;

  return {
    sku: form.sku.trim(),
    name: form.name.trim(),
    description: form.description.trim() || null,
    brand: form.brand.trim() || null,
    model: form.model.trim() || null,
    itemKind: form.itemKind,
    categoryId: form.categoryId,
    trackingMode: form.trackingMode,
    unitOfMeasure: form.unitOfMeasure.trim(),
    status: form.status,
    purchasable: form.purchasable,
    preferredSupplierRefId: form.preferredSupplierRefId,
    supplierSku: form.supplierSku.trim() || null,
    purchaseUnitOfMeasure: form.purchaseUnitOfMeasure.trim() || null,
    purchaseToBaseUomFactor: parseOptionalNumber(form.purchaseToBaseUomFactor),
    standardCost: Number.parseFloat(form.standardCost || '0'),
    lastPurchaseCost: parseOptionalNumber(form.lastPurchaseCost),
    minimumOrderQty: parseOptionalNumber(form.minimumOrderQty),
    orderMultiple: parseOptionalNumber(form.orderMultiple),
    leadTimeDays: form.leadTimeDays.trim() === '' ? null : Number.parseInt(form.leadTimeDays, 10),
    inventoryControlled: form.inventoryControlled,
    assetControlled: requiresAssetControl ? true : form.assetControlled,
    baseCost: Number.parseFloat(form.baseCost || '0'),
    minimumStock: Number.parseFloat(form.minimumStock || '0'),
    reorderPoint: Number.parseFloat(form.reorderPoint || '0'),
    targetStock: Number.parseFloat(form.targetStock || '0'),
    usefulLifeMonths:
      form.usefulLifeMonths.trim() === '' ? null : Number.parseInt(form.usefulLifeMonths, 10),
    commercialReferenceId: form.commercialReferenceId.trim() || null,
  };
}

interface InventoryCatalogDrawerProps {
  open: boolean;
  item: InventoryItemRecord | null;
  categories: InventoryCategoryRecord[];
  isSubmitting: boolean;
  error: string | null;
  onClose: () => void;
  onCreate: (payload: CreateInventoryItemDto) => Promise<void>;
  onUpdate: (id: string, payload: UpdateInventoryItemDto) => Promise<void>;
  onCreateCategory: () => void;
}

export function InventoryCatalogDrawer({
  open,
  item,
  categories,
  isSubmitting,
  error,
  onClose,
  onCreate,
  onUpdate,
  onCreateCategory,
}: InventoryCatalogDrawerProps) {
  const [activeTab, setActiveTab] = useState<CatalogDrawerTab>('general');
  const [form, setForm] = useState<CatalogFormState>(defaultFormState);
  const isEditMode = Boolean(item);

  const activeCategories = useMemo(
    () =>
      categories.filter((category) => category.status === InventoryCategoryStatus.ACTIVE),
    [categories],
  );
  const selectableCategories = [...activeCategories];
  if (
    item &&
    item.categoryId &&
    !selectableCategories.some((category) => category.id === item.categoryId)
  ) {
    selectableCategories.unshift({
      id: item.categoryId,
      tenantId: item.tenantId,
      code: item.categoryCode,
      name: `${item.categoryName} (inactiva)`,
      description: null,
      status: InventoryCategoryStatus.INACTIVE,
      sortOrder: 0,
      productCount: 0,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    });
  }

  useEffect(() => {
    if (!open) {
      setActiveTab('general');
      setForm(defaultFormState());
      return;
    }

    if (item) {
      setForm(formFromItem(item));
      return;
    }

    const defaultCategoryId = activeCategories[0]?.id ?? '';
    setForm(defaultFormState(defaultCategoryId));
  }, [open, item, activeCategories]);

  const canSubmit =
    form.sku.trim().length > 0 &&
    form.name.trim().length > 0 &&
    form.unitOfMeasure.trim().length > 0 &&
    form.categoryId.trim().length > 0;

  async function handleSubmit() {
    const payload = buildPayload(form);
    if (isEditMode && item) {
      await onUpdate(item.id, payload);
      return;
    }
    await onCreate(payload);
  }

  function updateForm<K extends keyof CatalogFormState>(key: K, value: CatalogFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col overflow-hidden p-0">
        <div className="border-b border-gray-200 px-6 py-4 dark:border-dark-border">
          <DialogHeader>
            <DialogTitle>{isEditMode ? 'Editar producto' : 'Nuevo producto'}</DialogTitle>
          </DialogHeader>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            Administra el maestro operativo para compras, inventario y lifecycle.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error ? (
            <PortalAlert
              variant="error"
              title="No fue posible guardar el artículo"
              description={error}
            />
          ) : null}

          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as CatalogDrawerTab)}
          >
            <TabsList className="mb-4 flex flex-wrap rounded-2xl bg-iwana-surface-soft p-1 dark:bg-dark-surface-3">
              {(Object.keys(TAB_LABELS) as CatalogDrawerTab[]).map((tab) => (
                <TabsTrigger key={tab} value={tab}>
                  {TAB_LABELS[tab]}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="general" className="space-y-4">
              <PortalSectionHeader
                title="Identificación"
                description="Datos base visibles en catálogo y compras."
              />
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label="SKU"
                  value={form.sku}
                  onChange={(e) => updateForm('sku', e.target.value)}
                />
                <Input
                  label="Nombre"
                  value={form.name}
                  onChange={(e) => updateForm('name', e.target.value)}
                />
                <label className="space-y-1 text-sm md:col-span-2">
                  <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                    Descripción
                  </span>
                  <textarea
                    rows={3}
                    value={form.description}
                    onChange={(e) => updateForm('description', e.target.value)}
                    className={fieldClassName}
                  />
                </label>
                <Input
                  label="Marca"
                  value={form.brand}
                  onChange={(e) => updateForm('brand', e.target.value)}
                />
                <Input
                  label="Modelo"
                  value={form.model}
                  onChange={(e) => updateForm('model', e.target.value)}
                />
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                    Tipo de artículo
                  </span>
                  <select
                    value={form.itemKind}
                    onChange={(e) => updateForm('itemKind', e.target.value as InventoryItemKind)}
                    className={fieldClassName}
                  >
                    {Object.values(InventoryItemKind).map((value) => (
                      <option key={value} value={value}>
                        {getInventoryItemKindLabel(value)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="space-y-2">
                  <label className="space-y-1 text-sm">
                    <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                      Categoría
                    </span>
                    <select
                      value={form.categoryId}
                      onChange={(e) => updateForm('categoryId', e.target.value)}
                      className={fieldClassName}
                    >
                      <option value="">Selecciona una categoría</option>
                      {selectableCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button type="button" variant="secondary" size="sm" onClick={onCreateCategory}>
                    Crear categoría
                  </Button>
                </div>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                    Trazabilidad
                  </span>
                  <select
                    value={form.trackingMode}
                    onChange={(e) =>
                      updateForm('trackingMode', e.target.value as InventoryTrackingMode)
                    }
                    className={fieldClassName}
                  >
                    {Object.values(InventoryTrackingMode).map((value) => (
                      <option key={value} value={value}>
                        {getInventoryTrackingModeLabel(value)}
                      </option>
                    ))}
                  </select>
                </label>
                <Input
                  label="Unidad de medida"
                  value={form.unitOfMeasure}
                  onChange={(e) => updateForm('unitOfMeasure', e.target.value)}
                />
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                    Estado
                  </span>
                  <select
                    value={form.status}
                    onChange={(e) => updateForm('status', e.target.value as InventoryItemStatus)}
                    className={fieldClassName}
                  >
                    {Object.values(InventoryItemStatus).map((value) => (
                      <option key={value} value={value}>
                        {getInventoryItemStatusLabel(value)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </TabsContent>

            <TabsContent value="purchasing" className="space-y-4">
              <PortalSectionHeader
                title="Abastecimiento"
                description="Atributos usados por Compras y proveeduría."
              />
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex items-center gap-2 text-sm md:col-span-2">
                  <input
                    type="checkbox"
                    checked={form.purchasable}
                    onChange={(e) => updateForm('purchasable', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                    Habilitado para compras
                  </span>
                </label>
                <div className="md:col-span-2">
                  <SupplierPicker
                    label="Proveedor preferido"
                    value={form.preferredSupplierRefId}
                    selectedLabel={form.preferredSupplierName}
                    onChange={(partyRefId, displayName) => {
                      setForm((current) => ({
                        ...current,
                        preferredSupplierRefId: partyRefId,
                        preferredSupplierName: displayName,
                      }));
                    }}
                  />
                </div>
                <Input
                  label="SKU del proveedor"
                  value={form.supplierSku}
                  onChange={(e) => updateForm('supplierSku', e.target.value)}
                />
                <Input
                  label="Unidad de compra"
                  value={form.purchaseUnitOfMeasure}
                  onChange={(e) => updateForm('purchaseUnitOfMeasure', e.target.value)}
                />
                <Input
                  label="Factor a unidad base"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={form.purchaseToBaseUomFactor}
                  onChange={(e) => updateForm('purchaseToBaseUomFactor', e.target.value)}
                />
                <Input
                  label="Costo estándar"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.standardCost}
                  onChange={(e) => updateForm('standardCost', e.target.value)}
                />
                <Input
                  label="Último costo de compra"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.lastPurchaseCost}
                  onChange={(e) => updateForm('lastPurchaseCost', e.target.value)}
                />
                <Input
                  label="Cantidad mínima de pedido"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.minimumOrderQty}
                  onChange={(e) => updateForm('minimumOrderQty', e.target.value)}
                />
                <Input
                  label="Múltiplo de pedido"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.orderMultiple}
                  onChange={(e) => updateForm('orderMultiple', e.target.value)}
                />
                <Input
                  label="Plazo de entrega (días)"
                  type="number"
                  min="0"
                  step="1"
                  value={form.leadTimeDays}
                  onChange={(e) => updateForm('leadTimeDays', e.target.value)}
                />
              </div>
            </TabsContent>

            <TabsContent value="inventory" className="space-y-4">
              <PortalSectionHeader
                title="Inventario"
                description="Umbrales y control de existencias."
              />
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex items-center gap-2 text-sm md:col-span-2">
                  <input
                    type="checkbox"
                    checked={form.inventoryControlled}
                    onChange={(e) => updateForm('inventoryControlled', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                    Controlado por inventario
                  </span>
                </label>
                <Input
                  label="Costo base"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.baseCost}
                  onChange={(e) => updateForm('baseCost', e.target.value)}
                />
                <Input
                  label="Stock mínimo"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.minimumStock}
                  onChange={(e) => updateForm('minimumStock', e.target.value)}
                />
                <Input
                  label="Punto de reorden"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.reorderPoint}
                  onChange={(e) => updateForm('reorderPoint', e.target.value)}
                />
                <Input
                  label="Stock objetivo"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.targetStock}
                  onChange={(e) => updateForm('targetStock', e.target.value)}
                />
              </div>
            </TabsContent>

            <TabsContent value="assets" className="space-y-4">
              <PortalSectionHeader title="Activos" description="Lifecycle y control patrimonial." />
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex items-center gap-2 text-sm md:col-span-2">
                  <input
                    type="checkbox"
                    checked={form.assetControlled}
                    onChange={(e) => updateForm('assetControlled', e.target.checked)}
                    disabled={
                      form.trackingMode === InventoryTrackingMode.SERIALIZED ||
                      form.trackingMode === InventoryTrackingMode.FIXED_ASSET
                    }
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                    Controlado como activo
                  </span>
                </label>
                <Input
                  label="Vida útil (meses)"
                  type="number"
                  min="1"
                  step="1"
                  value={form.usefulLifeMonths}
                  onChange={(e) => updateForm('usefulLifeMonths', e.target.value)}
                />
              </div>
            </TabsContent>

            <TabsContent value="commercial" className="space-y-4">
              <PortalSectionHeader
                title="Relación comercial"
                description="Vínculo informativo con oferta comercial sin cruzar módulos."
              />
              <Input
                label="Referencia comercial"
                value={form.commercialReferenceId}
                onChange={(e) => updateForm('commercialReferenceId', e.target.value)}
                helperText="Identificador opcional para correlacionar con catálogo comercial."
              />
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4 dark:border-dark-border">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            loading={isSubmitting}
            disabled={!canSubmit}
            onClick={() => void handleSubmit()}
          >
            {isEditMode ? 'Guardar cambios' : 'Crear producto'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
