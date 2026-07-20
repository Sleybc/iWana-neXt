'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Input, Select } from '@iwana/ui';
import {
  InventoryCategoryStatus,
  InventoryItemKind,
  InventoryItemStatus,
  InventoryTrackingMode,
} from '@iwana/shared';
import type {
  InventoryCategoryRecord,
  InventoryItemRecord,
  UpdateInventoryItemDto,
} from '@/lib/api-client';
import {
  PortalAlert,
  PortalSectionHeader,
  portalTextareaClassName,
} from '@/components/shared/portal-ui';
import { PortalDiscardChangesDialog } from '@/components/shared/PortalDiscardChangesDialog';
import { useDiscardChangesGuard } from '@/components/shared/use-discard-changes-guard';
import { usePortalSideDrawerA11y } from '@/components/shared/use-portal-side-drawer-a11y';
import { InventoryMetaItem } from './InventoryMetaItem';
import {
  formatInventoryCostOrNone,
  getInventoryItemKindLabel,
  getInventoryItemStatusBadgeVariant,
  getInventoryItemStatusLabel,
  getInventoryTrackingModeLabel,
  INVENTORY_AVERAGE_COST_HELP_TEXT,
  INVENTORY_AVERAGE_COST_LABEL,
  INVENTORY_LAST_PURCHASE_COST_LABEL,
  INVENTORY_STANDARD_COST_LABEL,
} from './inventory-labels';

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
    commercialReferenceId: item.commercialReferenceId ?? '',
  };
}

function buildPayload(form: CatalogFormState): UpdateInventoryItemDto {
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    brand: form.brand.trim() || null,
    model: form.model.trim() || null,
    itemKind: form.itemKind,
    categoryId: form.categoryId,
    trackingMode: form.trackingMode,
    unitOfMeasure: form.unitOfMeasure.trim(),
    status: form.status,
    commercialReferenceId: form.commercialReferenceId.trim() || null,
  };
}

function catalogFormSignature(state: CatalogFormState): string {
  return JSON.stringify(state);
}

interface InventoryCatalogDrawerProps {
  open: boolean;
  item: InventoryItemRecord;
  categories: InventoryCategoryRecord[];
  commercialProductOptions: Array<{ id: string; name: string }>;
  isSubmitting: boolean;
  error: string | null;
  onClose: () => void;
  onUpdate: (id: string, payload: UpdateInventoryItemDto) => Promise<void>;
}

export function InventoryCatalogDrawer({
  open,
  item,
  categories,
  commercialProductOptions,
  isSubmitting,
  error,
  onClose,
  onUpdate,
}: InventoryCatalogDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const [form, setForm] = useState<CatalogFormState>(defaultFormState);
  const [baselineForm, setBaselineForm] = useState<CatalogFormState | null>(null);

  const activeCategories = useMemo(
    () => categories.filter((category) => category.status === InventoryCategoryStatus.ACTIVE),
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
      codePrefix: item.categoryCode.slice(0, 8).toUpperCase(),
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
      setForm(defaultFormState());
      setBaselineForm(null);
      return;
    }

    const initialForm = formFromItem(item);
    setForm(initialForm);
    setBaselineForm(initialForm);
  }, [open, item]);

  const isDirty =
    baselineForm !== null && catalogFormSignature(form) !== catalogFormSignature(baselineForm);

  const { discardOpen, requestClose, confirmDiscard, cancelDiscard } = useDiscardChangesGuard({
    open,
    isDirty,
    onClose,
  });

  usePortalSideDrawerA11y(open && !discardOpen, drawerRef, requestClose);

  const canSubmit =
    form.name.trim().length > 0 &&
    form.unitOfMeasure.trim().length > 0 &&
    form.categoryId.trim().length > 0;
  const categoryLabel =
    selectableCategories.find((category) => category.id === form.categoryId)?.name ??
    item.categoryName ??
    'Sin categoría';

  async function handleSubmit() {
    const payload = buildPayload(form);
    await onUpdate(item.id, payload);
  }

  function updateForm<K extends keyof CatalogFormState>(key: K, value: CatalogFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[1200] bg-black/45">
      <button
        type="button"
        tabIndex={-1}
        className="absolute inset-0 cursor-default"
        aria-label="Cerrar edición de producto"
        onClick={requestClose}
      />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-labelledby="inventory-catalog-edit-title"
        aria-modal="true"
        tabIndex={-1}
        className="absolute inset-y-0 right-0 z-[1201] flex w-full max-w-4xl flex-col border-l border-gray-200 bg-white shadow-2xl outline-none dark:border-dark-border dark:bg-dark-surface-2"
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5 dark:border-dark-border">
          <div className="min-w-0">
            <p className="portal-eyebrow">Catálogo</p>
            <h2
              id="inventory-catalog-edit-title"
              className="mt-1 text-xl font-semibold text-gray-900 dark:text-white"
            >
              Editar producto
            </h2>
            <p className="mt-1 text-base font-medium text-gray-800 dark:text-gray-100">
              {form.name || item.name}
            </p>
            <p className="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400">{form.sku}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant={getInventoryItemStatusBadgeVariant(form.status)}>
                {getInventoryItemStatusLabel(form.status)}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Edita los datos base del producto dentro del catálogo.
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={requestClose}>
            Cerrar
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error ? (
            <PortalAlert
              variant="error"
              title="No fue posible guardar el producto"
              description={error}
            />
          ) : null}

          <dl className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <InventoryMetaItem label="Tipo" value={getInventoryItemKindLabel(form.itemKind)} />
            <InventoryMetaItem label="Categoría" value={categoryLabel} />
            <InventoryMetaItem
              label="Control de material"
              value={getInventoryTrackingModeLabel(form.trackingMode)}
            />
            <InventoryMetaItem label="Estado" value={getInventoryItemStatusLabel(form.status)} />
          </dl>

          <section className="mb-5 space-y-3">
            <PortalSectionHeader title="Costos" description={INVENTORY_AVERAGE_COST_HELP_TEXT} />
            <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <InventoryMetaItem
                label={INVENTORY_AVERAGE_COST_LABEL}
                value={formatInventoryCostOrNone(item.averageCost)}
              />
              <InventoryMetaItem
                label={INVENTORY_LAST_PURCHASE_COST_LABEL}
                value={formatInventoryCostOrNone(item.lastPurchaseCost)}
              />
              <InventoryMetaItem
                label={INVENTORY_STANDARD_COST_LABEL}
                value={formatInventoryCostOrNone(item.standardCost)}
              />
            </dl>
          </section>

          <div className="space-y-4">
            <PortalSectionHeader
              title="Datos del producto"
              description="Actualiza la información base visible en el catálogo."
            />
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Código"
                value={form.sku}
                disabled
                helperText="El código no se puede modificar después de crear el producto."
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
                  className={portalTextareaClassName}
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
              <Select
                label="Tipo de producto"
                value={form.itemKind}
                options={Object.values(InventoryItemKind).map((value) => ({
                  value,
                  label: getInventoryItemKindLabel(value),
                }))}
                onChange={(e) => updateForm('itemKind', e.target.value as InventoryItemKind)}
              />
              <Select
                label="Categoría"
                value={form.categoryId}
                options={[
                  { value: '', label: 'Selecciona una categoría' },
                  ...selectableCategories.map((category) => ({
                    value: category.id,
                    label: category.name,
                  })),
                ]}
                onChange={(e) => updateForm('categoryId', e.target.value)}
              />
              <Select
                label="Control de material"
                value={form.trackingMode}
                options={Object.values(InventoryTrackingMode).map((value) => ({
                  value,
                  label: getInventoryTrackingModeLabel(value),
                }))}
                onChange={(e) =>
                  updateForm('trackingMode', e.target.value as InventoryTrackingMode)
                }
              />
              <Input
                label="Unidad de medida"
                value={form.unitOfMeasure}
                onChange={(e) => updateForm('unitOfMeasure', e.target.value)}
              />
              <Select
                label="Estado"
                value={form.status}
                options={Object.values(InventoryItemStatus).map((value) => ({
                  value,
                  label: getInventoryItemStatusLabel(value),
                }))}
                onChange={(e) => updateForm('status', e.target.value as InventoryItemStatus)}
              />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Compras, inventario y activos se administran desde sus secciones correspondientes.
            </p>
          </div>

          <div className="space-y-4 border-t border-gray-100 pt-5 dark:border-dark-border">
            <PortalSectionHeader
              title="Relación comercial"
              description="Vincula este producto operativo con un producto adicional de la oferta comercial."
            />
            <Select
              label="Referencia comercial"
              value={form.commercialReferenceId}
              options={[
                { value: '', label: 'Sin referencia comercial' },
                ...commercialProductOptions.map((product) => ({
                  value: product.id,
                  label: product.name,
                })),
              ]}
              onChange={(event) => updateForm('commercialReferenceId', event.target.value)}
              helperText="Opcional. Usa el catálogo de Comercial > Productos adicionales."
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4 dark:border-dark-border">
          <Button type="button" variant="secondary" onClick={requestClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            loading={isSubmitting}
            disabled={!canSubmit}
            onClick={() => void handleSubmit()}
          >
            Guardar cambios
          </Button>
        </div>
      </aside>

      <PortalDiscardChangesDialog
        open={discardOpen}
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
      />
    </div>
  );
}
