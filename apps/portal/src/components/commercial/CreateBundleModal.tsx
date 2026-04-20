'use client';

import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Badge,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
} from '@iwana/ui';
import { CatalogItemType, DiscountType } from '@iwana/shared';
import type { CreateBundleDto } from '@/lib/api-client';

const bundleFormSchema = z
  .object({
    name: z.string().trim().min(2, 'Minimo 2 caracteres.').max(200, 'Maximo 200 caracteres.'),
    description: z.string().trim().max(400, 'Maximo 400 caracteres.').optional(),
    discountType: z.enum([DiscountType.PERCENTAGE, DiscountType.FIXED_AMOUNT]),
    discountValue: z.coerce.number().min(0, 'No puede ser negativo.'),
    validFrom: z.string().min(1, 'Ingresa la fecha inicial.'),
    validTo: z.string().optional(),
    itemIds: z.array(z.string()).min(2, 'Selecciona al menos 2 items.'),
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

type BundleFormValues = z.infer<typeof bundleFormSchema>;

export interface BundleCatalogSelectableItem {
  id: string;
  name: string;
  type: CatalogItemType;
  isActive: boolean;
}

interface CreateBundleModalProps {
  open: boolean;
  canEdit: boolean;
  isSubmitting: boolean;
  serverError: string | null;
  availableItems: BundleCatalogSelectableItem[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (dto: CreateBundleDto) => Promise<void>;
}

function getTypeLabel(type: CatalogItemType): string {
  if (type === CatalogItemType.PLAN) return 'Plan';
  if (type === CatalogItemType.PRODUCT) return 'Producto';
  return 'Servicio';
}

export function CreateBundleModal({
  open,
  canEdit,
  isSubmitting,
  serverError,
  availableItems,
  onOpenChange,
  onSubmit,
}: CreateBundleModalProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<BundleFormValues>({
    resolver: zodResolver(bundleFormSchema),
    defaultValues: {
      name: '',
      description: '',
      discountType: DiscountType.PERCENTAGE,
      discountValue: 10,
      validFrom: new Date().toISOString().slice(0, 10),
      validTo: '',
      itemIds: [],
      optionalItemIds: [],
    },
  });

  const selectedItemIds = watch('itemIds');
  const optionalItemIds = watch('optionalItemIds');

  const selectedItems = useMemo(
    () => availableItems.filter((item) => selectedItemIds.includes(item.id)),
    [availableItems, selectedItemIds],
  );

  const handleToggleItem = (itemId: string) => {
    const current = watch('itemIds');
    const next = current.includes(itemId)
      ? current.filter((id) => id !== itemId)
      : [...current, itemId];

    setValue('itemIds', next, { shouldDirty: true, shouldValidate: true });

    const nextOptional = watch('optionalItemIds').filter((id) => next.includes(id));
    setValue('optionalItemIds', nextOptional, { shouldDirty: true, shouldValidate: true });
  };

  const handleToggleOptional = (itemId: string) => {
    const current = watch('optionalItemIds');
    const next = current.includes(itemId)
      ? current.filter((id) => id !== itemId)
      : [...current, itemId];

    setValue('optionalItemIds', next, { shouldDirty: true, shouldValidate: true });
  };

  const submitBundle = async (values: BundleFormValues) => {
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

    reset();
  };

  const groupedItems = useMemo(() => {
    const plans = availableItems.filter((item) => item.type === CatalogItemType.PLAN);
    const products = availableItems.filter((item) => item.type === CatalogItemType.PRODUCT);
    const services = availableItems.filter((item) => item.type === CatalogItemType.SERVICE);

    return [
      { label: 'Planes', items: plans },
      { label: 'Productos', items: products },
      { label: 'Servicios', items: services },
    ];
  }, [availableItems]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Crear combo</DialogTitle>
          <DialogDescription>
            Define una oferta compuesta con descuento y vigencia para el catálogo comercial.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={handleSubmit(submitBundle)}>
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Nombre" placeholder="Combo hogar premium" {...register('name')} />
            <Input
              label="Descuento"
              type="number"
              min={0}
              step="0.01"
              {...register('discountValue')}
            />
            <div className="md:col-span-2">
              <label
                htmlFor="bundle-description"
                className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-600 dark:text-gray-300"
              >
                Descripcion
              </label>
              <textarea
                id="bundle-description"
                rows={3}
                className="mt-2 w-full rounded-2xl border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none transition-colors focus:border-iwana-secondary focus:ring-2 focus:ring-iwana-secondary/30 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-100"
                placeholder="Incluye internet + router + soporte prioritario"
                {...register('description')}
              />
            </div>
            <Select
              label="Tipo de descuento"
              id="bundle-discount-type"
              {...register('discountType')}
            >
              <option value={DiscountType.PERCENTAGE}>Porcentaje</option>
              <option value={DiscountType.FIXED_AMOUNT}>Monto fijo</option>
            </Select>
            <Input label="Vigencia desde" type="date" {...register('validFrom')} />
            <Input label="Vigencia hasta" type="date" {...register('validTo')} />
          </div>

          {errors.name && <p className="text-xs text-red-600">{errors.name.message}</p>}
          {errors.discountValue && (
            <p className="text-xs text-red-600">{errors.discountValue.message}</p>
          )}
          {errors.validTo && <p className="text-xs text-red-600">{errors.validTo.message}</p>}

          <section className="space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-dark-border">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                Items del combo
              </h3>
              <Badge variant="neutral" className="rounded-full px-2 py-0.5 text-[11px]">
                {selectedItemIds.length} seleccionados
              </Badge>
            </div>

            {groupedItems.map((group) => (
              <div key={group.label} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                  {group.label}
                </p>
                {group.items.length === 0 ? (
                  <p className="text-sm text-gray-500">Sin items disponibles.</p>
                ) : (
                  <div className="grid gap-2 md:grid-cols-2">
                    {group.items.map((item) => {
                      const checked = selectedItemIds.includes(item.id);

                      return (
                        <label
                          key={item.id}
                          className="flex cursor-pointer items-start gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm transition-colors hover:border-gray-300 dark:border-dark-border"
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={checked}
                            onChange={() => handleToggleItem(item.id)}
                            disabled={!canEdit || isSubmitting}
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-gray-800 dark:text-gray-100">
                              {item.name}
                            </span>
                            <span className="text-xs text-gray-500">{getTypeLabel(item.type)}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}

            {errors.itemIds && <p className="text-xs text-red-600">{errors.itemIds.message}</p>}
          </section>

          {selectedItems.length > 0 && (
            <section className="space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-dark-border">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                Items opcionales
              </h3>
              <p className="text-xs text-gray-500">
                Marca los items que el cliente puede excluir al cotizar el combo.
              </p>

              <div className="grid gap-2 md:grid-cols-2">
                {selectedItems.map((item) => (
                  <label
                    key={item.id}
                    className="flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm transition-colors hover:border-gray-300 dark:border-dark-border"
                  >
                    <input
                      type="checkbox"
                      checked={optionalItemIds.includes(item.id)}
                      onChange={() => handleToggleOptional(item.id)}
                      disabled={!canEdit || isSubmitting}
                    />
                    <span className="truncate text-gray-700 dark:text-gray-200">{item.name}</span>
                  </label>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-gray-200 p-4 dark:border-dark-border">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              Vista operativa
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              El precio final del combo se calcula dinámicamente al cotizar según segmento e items
              opcionales seleccionados.
            </p>
          </section>

          {serverError && <p className="text-sm text-red-600">{serverError}</p>}

          <div className="flex items-center justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={isSubmitting}>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!canEdit || isSubmitting}>
              {isSubmitting ? 'Guardando...' : 'Crear combo'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
