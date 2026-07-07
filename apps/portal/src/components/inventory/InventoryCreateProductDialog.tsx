'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  cn,
} from '@iwana/ui';
import {
  buildCompositeSkuBase,
  InventoryCategoryStatus,
  InventoryItemKind,
  InventoryItemStatus,
  InventoryTrackingMode,
} from '@iwana/shared';
import { useForm, Controller, type FieldErrors } from 'react-hook-form';
import { z } from 'zod';
import type { CreateInventoryItemDto, InventoryCategoryRecord } from '@/lib/api-client';
import { PortalAlert, portalTextareaClassName } from '@/components/shared/portal-ui';
import { getInventoryItemKindLabel, getInventoryTrackingModeLabel } from './inventory-labels';

const createProductSchema = z.object({
  name: z.string().trim().min(1, 'Completa el nombre del producto.'),
  categoryId: z.string().trim().min(1, 'Selecciona una categoría.'),
  itemKind: z.nativeEnum(InventoryItemKind),
  trackingMode: z.nativeEnum(InventoryTrackingMode),
  unitOfMeasure: z.string().trim().min(1, 'Completa la unidad de medida.'),
  description: z.string(),
  brand: z.string(),
  model: z.string(),
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
  unitOfMeasure: 'unidad',
  description: '',
  brand: '',
  model: '',
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
  return {
    name: values.name.trim(),
    categoryId: values.categoryId,
    itemKind: values.itemKind,
    trackingMode: values.trackingMode,
    unitOfMeasure: values.unitOfMeasure.trim(),
    description: values.description.trim() || null,
    brand: values.brand.trim() || null,
    model: values.model.trim() || null,
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
    errors.trackingMode ? 'la trazabilidad' : null,
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
    formState: { errors, submitCount },
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

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent
        aria-labelledby="inventory-create-product-dialog-title"
        className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader>
          <p className="portal-eyebrow">Catálogo</p>
          <DialogTitle id="inventory-create-product-dialog-title" className="mt-1">
            Nuevo producto
          </DialogTitle>
          <DialogDescription>
            Crea un producto para agregarlo al catálogo. Podrás completar compras, inventario y
            otros datos después.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={handleSubmit(async (values) => {
            await onSubmit(buildPayload(values));
          })}
        >
          {error ? (
            <PortalAlert
              variant="error"
              title="No fue posible crear el producto"
              description={error}
            />
          ) : null}
          {validationSummary ? (
            <PortalAlert
              variant="warning"
              title="Revisa el formulario"
              description={validationSummary}
            />
          ) : null}

          <Input
            label="Nombre"
            aria-label="Nombre"
            autoFocus
            requiredIndicator={true}
            error={errors.name?.message}
            {...register('name')}
          />

          <div className="space-y-2">
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
                className="rounded-2xl border border-gray-200 bg-iwana-surface-soft p-3 dark:border-dark-border dark:bg-dark-surface-3"
              >
                {categoryInlineContent}
              </div>
            ) : null}
          </div>

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

          <Controller
            name="trackingMode"
            control={control}
            render={({ field }) => (
              <Select
                id="inventory-create-product-tracking"
                label="Trazabilidad"
                aria-label="Trazabilidad"
                options={TRACKING_OPTIONS}
                value={field.value}
                {...(errors.trackingMode?.message ? { error: errors.trackingMode.message } : {})}
                onChange={(event) => field.onChange(event.target.value as InventoryTrackingMode)}
              />
            )}
          />

          <Input
            label="Unidad de medida"
            aria-label="Unidad de medida"
            requiredIndicator={true}
            error={errors.unitOfMeasure?.message}
            {...register('unitOfMeasure')}
          />

          {skuPreview ? (
            <div className="rounded-2xl border border-iwana-primary-100 bg-iwana-primary-50 p-3 text-sm dark:border-iwana-primary-900/50 dark:bg-iwana-primary-950/20">
              <p className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                SKU sugerido
              </p>
              <p className="mt-1 font-mono text-xs text-gray-900 dark:text-white">{skuPreview}</p>
              <p className="mt-1 text-xs text-iwana-secondary-700 dark:text-gray-400">
                Se asignará automáticamente al crear el producto.
              </p>
            </div>
          ) : null}

          <details className="group rounded-2xl border border-gray-200 p-4 dark:border-dark-border">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Agregar descripción, marca y modelo
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Estos datos son opcionales y puedes completarlos más adelante.
                </p>
              </div>
              <ChevronDown
                className="h-4 w-4 shrink-0 text-iwana-primary transition-transform group-open:rotate-180"
                aria-hidden
              />
            </summary>

            <div className="mt-4 space-y-4">
              <label htmlFor="inventory-create-product-description" className="space-y-1 text-sm">
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

              <Input label="Marca" aria-label="Marca" {...register('brand')} />
              <Input label="Modelo" aria-label="Modelo" {...register('model')} />
            </div>
          </details>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Crear producto
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
