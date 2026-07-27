'use client';

import { useEffect, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CircleAlert } from 'lucide-react';
import {
  CheckboxCard,
  DatePicker,
  Input,
  MultiSelect,
  Select,
  type MultiSelectOption,
} from '@iwana/ui';
import { CatalogItemType, DiscountType } from '@iwana/shared';
import type { CommercialBundle, CreateBundleDto, UpdateBundleDto } from '@/lib/api-client';
import { PortalAlert, portalTextareaClassName } from '@/components/shared/portal-ui';

const createBundleFormSchema = z
  .object({
    name: z.string().trim().min(2, 'Mínimo 2 caracteres.').max(200, 'Máximo 200 caracteres.'),
    description: z.string().trim().max(400, 'Máximo 400 caracteres.').optional(),
    discountType: z.enum([DiscountType.PERCENTAGE, DiscountType.FIXED_AMOUNT]),
    discountValue: z.coerce.number().min(0, 'No puede ser negativo.'),
    validFrom: z.string().min(1, 'Ingresa la fecha inicial.'),
    validTo: z.string().optional(),
    itemIds: z.array(z.string()).min(2, 'Selecciona al menos 2 ítems.'),
    optionalItemIds: z.array(z.string()).default([]),
  })
  .superRefine((values, ctx) => {
    if (values.discountType === DiscountType.PERCENTAGE && values.discountValue > 100) {
      ctx.addIssue({
        path: ['discountValue'],
        code: z.ZodIssueCode.custom,
        message: 'El porcentaje no puede ser mayor a 100.',
      });
    }

    if (values.validTo && values.validTo < values.validFrom) {
      ctx.addIssue({
        path: ['validTo'],
        code: z.ZodIssueCode.custom,
        message: 'La fecha final no puede ser menor que la inicial.',
      });
    }
  });

const editBundleFormSchema = z
  .object({
    name: z.string().trim().min(2, 'Mínimo 2 caracteres.').max(200, 'Máximo 200 caracteres.'),
    description: z.string().trim().max(400, 'Máximo 400 caracteres.').optional(),
    discountType: z.enum([DiscountType.PERCENTAGE, DiscountType.FIXED_AMOUNT]),
    discountValue: z.coerce.number().min(0, 'No puede ser negativo.'),
    validFrom: z.string().min(1, 'Ingresa la fecha inicial.'),
    validTo: z.string().optional(),
    itemIds: z.array(z.string()).default([]),
    optionalItemIds: z.array(z.string()).default([]),
  })
  .superRefine((values, ctx) => {
    if (values.discountType === DiscountType.PERCENTAGE && values.discountValue > 100) {
      ctx.addIssue({
        path: ['discountValue'],
        code: z.ZodIssueCode.custom,
        message: 'El porcentaje no puede ser mayor a 100.',
      });
    }

    if (values.validTo && values.validTo < values.validFrom) {
      ctx.addIssue({
        path: ['validTo'],
        code: z.ZodIssueCode.custom,
        message: 'La fecha final no puede ser menor que la inicial.',
      });
    }
  });

type BundleFormValues = z.infer<typeof createBundleFormSchema>;

export interface BundleCatalogSelectableItem {
  id: string;
  name: string;
  type: CatalogItemType;
  isActive: boolean;
}

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toISOString().slice(0, 10);
}

function getDefaultBundleFormValues(): BundleFormValues {
  return {
    name: '',
    description: '',
    discountType: DiscountType.PERCENTAGE,
    discountValue: 10,
    validFrom: new Date().toISOString().slice(0, 10),
    validTo: '',
    itemIds: [],
    optionalItemIds: [],
  };
}

function toBundleFormValues(bundle: CommercialBundle): BundleFormValues {
  const discountType =
    bundle.discountType === DiscountType.FIXED_AMOUNT
      ? DiscountType.FIXED_AMOUNT
      : DiscountType.PERCENTAGE;

  return {
    name: bundle.name,
    description: bundle.description ?? '',
    discountType,
    discountValue: Number(bundle.discountValue),
    validFrom: toDateInputValue(bundle.validFrom),
    validTo: toDateInputValue(bundle.validTo),
    itemIds: [],
    optionalItemIds: [],
  };
}

interface CreateBundleFormProps {
  formId: string;
  open: boolean;
  canEdit: boolean;
  isSubmitting: boolean;
  serverError: string | null;
  availableItems: BundleCatalogSelectableItem[];
  mode?: 'create' | 'edit';
  initialBundle?: CommercialBundle | null;
  onSubmit: (dto: CreateBundleDto | UpdateBundleDto) => Promise<void>;
}

function getTypeLabel(type: CatalogItemType): string {
  if (type === CatalogItemType.PLAN) return 'Plan';
  if (type === CatalogItemType.PRODUCT) return 'Producto';
  return 'Servicio';
}

export function CreateBundleForm({
  formId,
  open,
  canEdit,
  isSubmitting,
  serverError,
  availableItems,
  mode = 'create',
  initialBundle = null,
  onSubmit,
}: CreateBundleFormProps) {
  const isEditMode = mode === 'edit';
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    control,
    formState: { errors },
  } = useForm<BundleFormValues>({
    resolver: zodResolver(isEditMode ? editBundleFormSchema : createBundleFormSchema),
    defaultValues: getDefaultBundleFormValues(),
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    if (isEditMode && initialBundle) {
      reset(toBundleFormValues(initialBundle));
      return;
    }

    reset(getDefaultBundleFormValues());
  }, [open, isEditMode, initialBundle, reset]);

  const selectedItemIds = watch('itemIds');
  const optionalItemIds = watch('optionalItemIds');

  const selectedItems = useMemo(
    () => availableItems.filter((item) => selectedItemIds.includes(item.id)),
    [availableItems, selectedItemIds],
  );

  const handleItemsChange = (next: string[]) => {
    setValue('itemIds', next, { shouldDirty: true, shouldValidate: true });
    const nextOptional = watch('optionalItemIds').filter((id) => next.includes(id));
    setValue('optionalItemIds', nextOptional, { shouldDirty: true, shouldValidate: true });
  };

  const submitBundle = async (values: BundleFormValues) => {
    if (isEditMode) {
      const payload: UpdateBundleDto = {
        name: values.name.trim(),
        discountType: values.discountType,
        discountValue: values.discountValue.toFixed(2),
        validFrom: new Date(`${values.validFrom}T00:00:00`).toISOString(),
        ...(values.description?.trim() && { description: values.description.trim() }),
        ...(values.validTo
          ? { validTo: new Date(`${values.validTo}T23:59:59`).toISOString() }
          : {}),
      };

      await onSubmit(payload);
      return;
    }

    const payload: CreateBundleDto = {
      name: values.name.trim(),
      discountType: values.discountType,
      discountValue: values.discountValue.toFixed(2),
      validFrom: new Date(`${values.validFrom}T00:00:00`).toISOString(),
      itemIds: values.itemIds,
      optionalItemIds: values.optionalItemIds,
      ...(values.description?.trim() && { description: values.description.trim() }),
      ...(values.validTo && {
        validTo: new Date(`${values.validTo}T23:59:59`).toISOString(),
      }),
    };

    await onSubmit(payload);
  };

  const itemOptions = useMemo<MultiSelectOption[]>(
    () =>
      availableItems.map((item) => ({
        value: item.id,
        label: item.name,
        group: getTypeLabel(item.type),
        disabled: !item.isActive,
      })),
    [availableItems],
  );

  const itemCount = initialBundle?.itemCount ?? 0;

  return (
    <form id={formId} className="space-y-5" onSubmit={handleSubmit(submitBundle)} noValidate>
      <section className="space-y-4">
        <div>
          <p className="portal-eyebrow">Información básica</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Define el nombre, la descripción y el descuento del combo.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Input
              label="Nombre"
              placeholder="Combo hogar premium"
              aria-invalid={errors.name ? 'true' : 'false'}
              disabled={!canEdit || isSubmitting}
              {...register('name')}
            />
            {errors.name && <p className="mt-1 text-sm text-error-600">{errors.name.message}</p>}
          </div>
          <div>
            <Input
              label="Descuento"
              type="number"
              min={0}
              step="0.01"
              aria-invalid={errors.discountValue ? 'true' : 'false'}
              disabled={!canEdit || isSubmitting}
              {...register('discountValue')}
            />
            {errors.discountValue && (
              <p className="mt-1 text-sm text-error-600">{errors.discountValue.message}</p>
            )}
          </div>
          <div className="md:col-span-2">
            <label htmlFor="bundle-description" className="portal-eyebrow-muted">
              Descripción
            </label>
            <textarea
              id="bundle-description"
              rows={3}
              className={`mt-2 ${portalTextareaClassName}`}
              placeholder="Incluye internet + router + soporte prioritario"
              disabled={!canEdit || isSubmitting}
              {...register('description')}
            />
            {errors.description && (
              <p className="mt-1 text-sm text-error-600">{errors.description.message}</p>
            )}
          </div>
          <Select
            label="Tipo de descuento"
            id="bundle-discount-type"
            disabled={!canEdit || isSubmitting}
            {...register('discountType')}
          >
            <option value={DiscountType.PERCENTAGE}>Porcentaje</option>
            <option value={DiscountType.FIXED_AMOUNT}>Monto fijo</option>
          </Select>
          <Controller
            name="validFrom"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <DatePicker
                label="Vigencia desde"
                value={value ? new Date(`${value}T00:00:00`) : undefined}
                onChange={(date) => onChange(date ? date.toISOString().slice(0, 10) : '')}
                error={error?.message}
                disabled={!canEdit || isSubmitting}
              />
            )}
          />
          <Controller
            name="validTo"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <DatePicker
                label="Vigencia hasta"
                value={value ? new Date(`${value}T00:00:00`) : undefined}
                onChange={(date) => onChange(date ? date.toISOString().slice(0, 10) : '')}
                error={error?.message}
                disabled={!canEdit || isSubmitting}
              />
            )}
          />
        </div>
        {errors.validTo && <p className="text-sm text-error-600">{errors.validTo.message}</p>}
      </section>

      {isEditMode ? (
        <section className="space-y-2">
          <div>
            <p className="portal-eyebrow">Composición</p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Los ítems del combo no se editan aquí.
            </p>
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-200">
            {itemCount} ítem{itemCount === 1 ? '' : 's'} en el combo
          </p>
        </section>
      ) : (
        <section className="space-y-4">
          <div>
            <p className="portal-eyebrow">Composición</p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Selecciona al menos dos ítems activos del catálogo comercial.
            </p>
          </div>

          <MultiSelect
            label="Ítems del combo"
            options={itemOptions}
            value={selectedItemIds}
            onChange={handleItemsChange}
            placeholder="Selecciona planes, productos o servicios..."
            searchPlaceholder="Buscar ítem..."
            disabled={!canEdit || isSubmitting}
            error={errors.itemIds?.message}
          />

          {selectedItems.length > 0 && (
            <div className="space-y-3">
              <div>
                <p className="portal-eyebrow">Ítems opcionales</p>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Marca los ítems que el cliente puede excluir al cotizar el combo.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {selectedItems.map((item) => (
                  <CheckboxCard
                    key={item.id}
                    label={item.name}
                    checked={optionalItemIds.includes(item.id)}
                    onChange={() => {
                      const current = watch('optionalItemIds');
                      const next = current.includes(item.id)
                        ? current.filter((id) => id !== item.id)
                        : [...current, item.id];
                      setValue('optionalItemIds', next, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    }}
                    disabled={!canEdit || isSubmitting}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {!isEditMode && (
        <section className="space-y-2">
          <p className="portal-eyebrow">Vista operativa</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            El precio final del combo se calcula dinámicamente al cotizar según segmento e ítems
            opcionales seleccionados.
          </p>
        </section>
      )}

      {serverError && (
        <PortalAlert
          variant="error"
          title={isEditMode ? 'No fue posible guardar el combo' : 'No fue posible crear el combo'}
          description={serverError}
          icon={CircleAlert}
        />
      )}
    </form>
  );
}
