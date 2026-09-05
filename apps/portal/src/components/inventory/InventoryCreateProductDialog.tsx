'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown } from 'lucide-react';
import { Button, Input, Select } from '@iwana/ui';
import {
  buildCompositeSkuBase,
  InventoryBarcodeType,
  InventoryCategoryStatus,
  InventoryItemKind,
  InventoryItemStatus,
  InventoryTrackingMode,
  isInventoryUnitOfMeasureCode,
  validateBarcodeValue,
} from '@iwana/shared';
import { useForm, Controller, type FieldErrors } from 'react-hook-form';
import { z } from 'zod';
import type { CreateInventoryItemDto, InventoryCategoryRecord } from '@/lib/api-client';
import {
  PortalAlert,
  portalTextareaClassName,
  portalWellClassName,
} from '@/components/shared/portal-ui';
import { PortalDiscardChangesDialog } from '@/components/shared/PortalDiscardChangesDialog';
import { useDiscardChangesGuard } from '@/components/shared/use-discard-changes-guard';
import { usePortalSideDrawerA11y } from '@/components/shared/use-portal-side-drawer-a11y';
import {
  getInventoryItemKindLabel,
  getInventoryTrackingModeLabel,
  INVENTORY_BARCODE_CREATE_HELP_TEXT,
  INVENTORY_BARCODE_LABEL,
  INVENTORY_BARCODE_NO_CODE_LABEL,
  INVENTORY_BARCODE_PAIR_TYPE_MISSING_MESSAGE,
  INVENTORY_BARCODE_PAIR_VALUE_MISSING_MESSAGE,
  INVENTORY_BARCODE_TYPE_LABEL,
  INVENTORY_BARCODE_TYPE_OPTIONS,
  INVENTORY_UNIT_OF_MEASURE_OPTIONS,
} from './inventory-labels';

function isDeclaredBarcodeType(value: string): value is InventoryBarcodeType {
  return (Object.values(InventoryBarcodeType) as string[]).includes(value);
}

const createProductSchema = z
  .object({
    name: z.string().trim().min(1, 'Completa el nombre del producto.'),
    categoryId: z.string().trim().min(1, 'Selecciona una categoría.'),
    itemKind: z.nativeEnum(InventoryItemKind),
    trackingMode: z.nativeEnum(InventoryTrackingMode),
    // F5a (ADR-085 D1): la unidad base se elige del catálogo canónico, ya no es texto libre.
    unitOfMeasure: z
      .string()
      .trim()
      .refine(isInventoryUnitOfMeasureCode, 'Selecciona una unidad de medida del catálogo.'),
    description: z.string(),
    brand: z.string(),
    model: z.string(),
    // F4 (PRD §11): código de barras opcional (regla 1); el par va junto (CA-F4-08).
    barcode: z.string(),
    barcodeType: z.string(),
  })
  .superRefine((values, ctx) => {
    const barcode = values.barcode.trim();
    const barcodeType = values.barcodeType.trim();

    if (!barcode && !barcodeType) {
      return;
    }

    if (barcode && !barcodeType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['barcodeType'],
        message: INVENTORY_BARCODE_PAIR_TYPE_MISSING_MESSAGE,
      });
      return;
    }

    if (!barcode && barcodeType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['barcode'],
        message: INVENTORY_BARCODE_PAIR_VALUE_MISSING_MESSAGE,
      });
      return;
    }

    // Respuesta inmediata con la misma fuente que el backend (cero deriva);
    // el dígito de control EAN13/UPCA es autoritativo en backend.
    if (!isDeclaredBarcodeType(barcodeType)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['barcodeType'],
        message: INVENTORY_BARCODE_PAIR_TYPE_MISSING_MESSAGE,
      });
      return;
    }

    const check = validateBarcodeValue(barcodeType, barcode);
    if (!check.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['barcode'], message: check.message });
    }
  });

type InventoryCreateProductDialogValues = z.infer<typeof createProductSchema>;

export interface InventoryCreateProductDialogPayload extends Omit<
  CreateInventoryItemDto,
  | 'sku'
  | 'categoryId'
  | 'itemKind'
  | 'trackingMode'
  | 'unitOfMeasure'
  | 'status'
  | 'purchasable'
  | 'inventoryControlled'
> {
  categoryId: string;
  itemKind: InventoryItemKind;
  trackingMode: InventoryTrackingMode;
  unitOfMeasure: string;
  status: InventoryItemStatus;
  purchasable: boolean;
  inventoryControlled: boolean;
}

interface InventoryCreateProductDialogProps {
  open: boolean;
  categories: InventoryCategoryRecord[];
  isSubmitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: InventoryCreateProductDialogPayload) => Promise<void>;
  onCreateCategoryClick?: () => void;
  categoryInlineContent?: ReactNode;
  categorySelectionOverride?: string | null;
}

const DEFAULT_VALUES: InventoryCreateProductDialogValues = {
  name: '',
  categoryId: '',
  itemKind: InventoryItemKind.STOCK,
  trackingMode: InventoryTrackingMode.CONSUMABLE,
  unitOfMeasure: 'UNIT',
  description: '',
  brand: '',
  model: '',
  barcode: '',
  barcodeType: '',
};

const ITEM_KIND_OPTIONS = Object.values(InventoryItemKind).map((value) => ({
  value,
  label: getInventoryItemKindLabel(value),
}));

const TRACKING_OPTIONS = Object.values(InventoryTrackingMode).map((value) => ({
  value,
  label: getInventoryTrackingModeLabel(value),
}));

function buildPayload(
  values: InventoryCreateProductDialogValues,
): InventoryCreateProductDialogPayload {
  // '' → null en ambos: el par viaja junto o no viaja (CA-F4-08); el backend
  // convierte blancos en ausencia y valida el dígito de control.
  const barcode = values.barcode.trim();
  const barcodeType = values.barcodeType.trim();
  return {
    name: values.name.trim(),
    categoryId: values.categoryId,
    itemKind: values.itemKind,
    trackingMode: values.trackingMode,
    unitOfMeasure: values.unitOfMeasure.trim(),
    description: values.description.trim() || null,
    brand: values.brand.trim() || null,
    model: values.model.trim() || null,
    barcode: barcode || null,
    barcodeType: barcodeType ? (barcodeType as InventoryBarcodeType) : null,
    purchasable: true,
    inventoryControlled: true,
    status: InventoryItemStatus.ACTIVE,
  };
}

function buildValidationSummary(
  errors: FieldErrors<InventoryCreateProductDialogValues>,
  submitCount: number,
): string | null {
  if (submitCount === 0) {
    return null;
  }

  const missingFields = [
    errors.name ? 'el nombre' : null,
    errors.categoryId ? 'la categoría' : null,
    errors.trackingMode ? 'el control de material' : null,
    errors.unitOfMeasure ? 'la unidad de medida' : null,
  ].filter((value): value is string => value !== null);

  if (missingFields.length === 0) {
    return null;
  }

  if (missingFields.length === 1) {
    return `Completa ${missingFields[0]} antes de crear el producto.`;
  }

  if (missingFields.length === 2) {
    return `Completa ${missingFields[0]} y ${missingFields[1]} antes de crear el producto.`;
  }

  return `Completa ${missingFields.slice(0, -1).join(', ')} y ${missingFields.at(-1)} antes de crear el producto.`;
}

export function InventoryCreateProductDialog({
  open,
  categories,
  isSubmitting,
  error,
  onClose,
  onSubmit,
  onCreateCategoryClick,
  categoryInlineContent,
  categorySelectionOverride,
}: InventoryCreateProductDialogProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const categorySelectRef = useRef<HTMLSelectElement | null>(null);
  const selectableCategories = useMemo(
    () => categories.filter((category) => category.status === InventoryCategoryStatus.ACTIVE),
    [categories],
  );
  const categoryOptions = useMemo(
    () => [
      { value: '', label: 'Selecciona una categoría' },
      ...selectableCategories.map((category) => ({
        value: category.id,
        label: category.name,
      })),
    ],
    [selectableCategories],
  );

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    control,
    formState: { errors, submitCount, isDirty },
  } = useForm<InventoryCreateProductDialogValues>({
    resolver: zodResolver(createProductSchema),
    defaultValues: DEFAULT_VALUES,
  });
  const watchedValues = watch();

  useEffect(() => {
    if (!open) {
      return;
    }

    reset({
      ...DEFAULT_VALUES,
      categoryId: selectableCategories[0]?.id ?? '',
    });
  }, [open, reset]);

  useEffect(() => {
    if (!open || watchedValues.categoryId || selectableCategories.length === 0) {
      return;
    }

    setValue('categoryId', selectableCategories[0]!.id);
  }, [open, selectableCategories, setValue, watchedValues.categoryId]);

  useEffect(() => {
    if (!open || !categorySelectionOverride) {
      return;
    }

    setValue('categoryId', categorySelectionOverride, {
      shouldDirty: true,
      shouldValidate: true,
    });
    categorySelectRef.current?.focus();
  }, [categorySelectionOverride, open, setValue]);

  const { discardOpen, requestClose, confirmDiscard, cancelDiscard } = useDiscardChangesGuard({
    open,
    isDirty,
    onClose,
  });

  usePortalSideDrawerA11y(open && !discardOpen, drawerRef, requestClose);

  const validationSummary = buildValidationSummary(errors, submitCount);
  const selectedCategory = useMemo(
    () => selectableCategories.find((category) => category.id === watchedValues.categoryId),
    [selectableCategories, watchedValues.categoryId],
  );
  const skuPreview =
    selectedCategory && watchedValues.name.trim()
      ? buildCompositeSkuBase({
          categoryCodePrefix: selectedCategory.codePrefix,
          itemKind: watchedValues.itemKind,
          name: watchedValues.name,
          brand: watchedValues.brand,
          model: watchedValues.model,
        })
      : null;

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[1200] bg-black/45">
      <button
        type="button"
        tabIndex={-1}
        className="absolute inset-0 cursor-default"
        aria-label="Cerrar nuevo producto"
        onClick={requestClose}
      />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-labelledby="inventory-create-product-dialog-title"
        aria-describedby="inventory-create-product-dialog-description"
        aria-modal="true"
        tabIndex={-1}
        className="absolute inset-y-0 right-0 z-[1201] flex w-full max-w-2xl flex-col border-l border-gray-200 bg-white shadow-2xl outline-none dark:border-dark-border dark:bg-dark-surface-2"
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5 dark:border-dark-border">
          <div className="min-w-0">
            <p className="portal-eyebrow">Catálogo</p>
            <h2
              id="inventory-create-product-dialog-title"
              className="mt-1 text-xl font-semibold text-gray-900 dark:text-white"
            >
              Nuevo producto
            </h2>
            <p
              id="inventory-create-product-dialog-description"
              className="mt-2 text-sm text-gray-500 dark:text-gray-400"
            >
              Crea un producto para agregarlo al catálogo. Podrás completar compras, inventario y
              activos fijos después.
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={requestClose} disabled={isSubmitting}>
            Cerrar
          </Button>
        </div>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={handleSubmit(async (values) => {
            await onSubmit(buildPayload(values));
          })}
        >
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {error ? (
                <PortalAlert
                  variant="error"
                  title="No fue posible crear el producto"
                  description={error}
                  className="md:col-span-2 min-w-0"
                />
              ) : null}
              {validationSummary ? (
                <PortalAlert
                  variant="warning"
                  title="Revisa el formulario"
                  description={validationSummary}
                  className="md:col-span-2 min-w-0"
                />
              ) : null}

              <div className="md:col-span-2 min-w-0">
                <Input
                  label="Nombre"
                  aria-label="Nombre"
                  autoFocus
                  requiredIndicator={true}
                  error={errors.name?.message}
                  {...register('name')}
                />
              </div>

              <div className="space-y-2 md:col-span-2 min-w-0">
                <Controller
                  name="categoryId"
                  control={control}
                  render={({ field }) => (
                    <Select
                      id="inventory-create-product-category"
                      label="Categoría"
                      aria-label="Categoría"
                      options={categoryOptions}
                      value={field.value}
                      ref={(element) => {
                        field.ref(element);
                        categorySelectRef.current = element;
                      }}
                      {...(errors.categoryId?.message ? { error: errors.categoryId.message } : {})}
                      onChange={(event) => field.onChange(event.target.value)}
                    />
                  )}
                />
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={() => onCreateCategoryClick?.()}
                >
                  Crear categoría aquí
                </Button>
                {categoryInlineContent ? (
                  <div
                    role="region"
                    aria-label="Creación inline de categoría"
                    className={portalWellClassName}
                  >
                    {categoryInlineContent}
                  </div>
                ) : null}
              </div>

              <div className="min-w-0">
                <Controller
                  name="itemKind"
                  control={control}
                  render={({ field }) => (
                    <Select
                      id="inventory-create-product-item-kind"
                      label="Tipo de producto"
                      aria-label="Tipo de producto"
                      options={ITEM_KIND_OPTIONS}
                      value={field.value}
                      onChange={(event) => field.onChange(event.target.value as InventoryItemKind)}
                    />
                  )}
                />
              </div>

              <div className="min-w-0">
                <Controller
                  name="trackingMode"
                  control={control}
                  render={({ field }) => (
                    <Select
                      id="inventory-create-product-tracking"
                      label="Control de material"
                      aria-label="Control de material"
                      options={TRACKING_OPTIONS}
                      value={field.value}
                      {...(errors.trackingMode?.message
                        ? { error: errors.trackingMode.message }
                        : {})}
                      onChange={(event) =>
                        field.onChange(event.target.value as InventoryTrackingMode)
                      }
                    />
                  )}
                />
              </div>

              <div className="md:col-span-2 min-w-0">
                <Controller
                  name="unitOfMeasure"
                  control={control}
                  render={({ field }) => (
                    <Select
                      id="inventory-create-product-unit"
                      label="Unidad de medida"
                      aria-label="Unidad de medida"
                      options={[...INVENTORY_UNIT_OF_MEASURE_OPTIONS]}
                      value={field.value}
                      {...(errors.unitOfMeasure?.message
                        ? { error: errors.unitOfMeasure.message }
                        : {})}
                      onChange={(event) => field.onChange(event.target.value)}
                    />
                  )}
                />
              </div>

              <div className="min-w-0">
                <Input label="Marca" aria-label="Marca" {...register('brand')} />
              </div>
              <div className="min-w-0">
                <Input
                  label="Modelo"
                  aria-label="Modelo"
                  helperText="Opcional. Ambos forman parte del código del producto, que no se puede modificar después."
                  {...register('model')}
                />
              </div>

              <div className="min-w-0">
                <Input
                  label={INVENTORY_BARCODE_LABEL}
                  aria-label={INVENTORY_BARCODE_LABEL}
                  helperText={INVENTORY_BARCODE_CREATE_HELP_TEXT}
                  error={errors.barcode?.message}
                  {...register('barcode')}
                />
              </div>

              <div className="min-w-0">
                <Controller
                  name="barcodeType"
                  control={control}
                  render={({ field }) => (
                    <Select
                      id="inventory-create-product-barcode-type"
                      label={INVENTORY_BARCODE_TYPE_LABEL}
                      aria-label={INVENTORY_BARCODE_TYPE_LABEL}
                      options={[
                        { value: '', label: INVENTORY_BARCODE_NO_CODE_LABEL },
                        ...INVENTORY_BARCODE_TYPE_OPTIONS,
                      ]}
                      value={field.value}
                      {...(errors.barcodeType?.message
                        ? { error: errors.barcodeType.message }
                        : {})}
                      onChange={(event) => field.onChange(event.target.value)}
                      helperText="Va junto al código: uno sin el otro se rechaza."
                    />
                  )}
                />
              </div>

              {skuPreview ? (
                <div className="rounded-2xl border border-iwana-primary-100 bg-iwana-primary-50 p-3 text-sm md:col-span-2 min-w-0 dark:border-iwana-primary-900/50 dark:bg-iwana-primary-950/20">
                  <p className="font-medium text-iwana-primary dark:text-gray-200">
                    Código sugerido
                  </p>
                  <p className="mt-1 font-mono text-xs text-gray-900 dark:text-white">
                    {skuPreview}
                  </p>
                  <p className="mt-1 text-xs text-iwana-primary dark:text-gray-400">
                    Se asigna automáticamente al crear el producto.
                  </p>
                </div>
              ) : null}

              <details className="group rounded-2xl border border-gray-200 p-4 md:col-span-2 min-w-0 dark:border-dark-border">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      Agregar descripción
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      La puedes completar más adelante. No forma parte del código del producto.
                    </p>
                  </div>
                  <ChevronDown
                    className="h-4 w-4 shrink-0 text-iwana-primary transition-transform group-open:rotate-180"
                    aria-hidden
                  />
                </summary>

                <div className="mt-4 space-y-4">
                  <label
                    htmlFor="inventory-create-product-description"
                    className="space-y-1 text-sm"
                  >
                    <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                      Descripción
                    </span>
                    <textarea
                      id="inventory-create-product-description"
                      aria-label="Descripción"
                      {...register('description')}
                      className={portalTextareaClassName}
                    />
                  </label>
                </div>
              </details>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4 dark:border-dark-border">
            <Button
              type="button"
              variant="secondary"
              onClick={requestClose}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Crear producto
            </Button>
          </div>
        </form>
      </aside>

      <PortalDiscardChangesDialog
        open={discardOpen}
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
      />
    </div>
  );
}
