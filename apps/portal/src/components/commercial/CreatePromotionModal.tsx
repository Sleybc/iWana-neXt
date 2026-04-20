'use client';

import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
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
import { CatalogItemType, CustomerSegment, DiscountType, PromotionScope } from '@iwana/shared';
import type { CommercialBundle, CreatePromotionDto } from '@/lib/api-client';

const promotionFormSchema = z
  .object({
    name: z.string().trim().min(2, 'Minimo 2 caracteres.').max(200, 'Maximo 200 caracteres.'),
    code: z
      .string()
      .trim()
      .min(3, 'Minimo 3 caracteres.')
      .max(50, 'Maximo 50 caracteres.')
      .regex(/^[A-Za-z0-9_-]+$/, 'Solo letras, numeros, guion y guion bajo.'),
    description: z.string().trim().max(400, 'Maximo 400 caracteres.').optional(),
    discountType: z.nativeEnum(DiscountType),
    discountValue: z.coerce.number().min(0, 'No puede ser negativo.'),
    appliesTo: z.nativeEnum(PromotionScope),
    targetItemId: z.string().optional(),
    targetBundleId: z.string().optional(),
    segmentResidential: z.boolean().default(false),
    segmentBusiness: z.boolean().default(false),
    maxUses: z.string().optional(),
    validFrom: z.string().min(1, 'Ingresa la fecha inicial.'),
    validTo: z.string().min(1, 'Ingresa la fecha final.'),
  })
  .superRefine((values, ctx) => {
    if (values.appliesTo === PromotionScope.ITEM && !values.targetItemId) {
      ctx.addIssue({
        path: ['targetItemId'],
        code: z.ZodIssueCode.custom,
        message: 'Selecciona el item objetivo.',
      });
    }

    if (values.appliesTo === PromotionScope.BUNDLE && !values.targetBundleId) {
      ctx.addIssue({
        path: ['targetBundleId'],
        code: z.ZodIssueCode.custom,
        message: 'Selecciona el combo objetivo.',
      });
    }

    if (values.validTo < values.validFrom) {
      ctx.addIssue({
        path: ['validTo'],
        code: z.ZodIssueCode.custom,
        message: 'La fecha final debe ser mayor o igual a la inicial.',
      });
    }

    if (
      values.maxUses &&
      (!Number.isInteger(Number(values.maxUses)) || Number(values.maxUses) < 1)
    ) {
      ctx.addIssue({
        path: ['maxUses'],
        code: z.ZodIssueCode.custom,
        message: 'El maximo de usos debe ser un entero positivo.',
      });
    }

    if (values.discountType === DiscountType.PERCENTAGE && values.discountValue > 100) {
      ctx.addIssue({
        path: ['discountValue'],
        code: z.ZodIssueCode.custom,
        message: 'El porcentaje no puede ser mayor a 100.',
      });
    }
  });

type PromotionFormValues = z.infer<typeof promotionFormSchema>;

export interface PromotionTargetItem {
  id: string;
  name: string;
  type: CatalogItemType;
}

interface CreatePromotionModalProps {
  open: boolean;
  canEdit: boolean;
  isSubmitting: boolean;
  serverError: string | null;
  bundles: CommercialBundle[];
  items: PromotionTargetItem[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (dto: CreatePromotionDto) => Promise<void>;
}

function getTypeLabel(type: CatalogItemType): string {
  if (type === CatalogItemType.PLAN) return 'Plan';
  if (type === CatalogItemType.PRODUCT) return 'Producto';
  return 'Servicio';
}

export function CreatePromotionModal({
  open,
  canEdit,
  isSubmitting,
  serverError,
  bundles,
  items,
  onOpenChange,
  onSubmit,
}: CreatePromotionModalProps) {
  const {
    register,
    watch,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<PromotionFormValues>({
    resolver: zodResolver(promotionFormSchema),
    defaultValues: {
      name: '',
      code: '',
      description: '',
      discountType: DiscountType.PERCENTAGE,
      discountValue: 10,
      appliesTo: PromotionScope.ALL,
      targetItemId: '',
      targetBundleId: '',
      segmentResidential: false,
      segmentBusiness: false,
      maxUses: '',
      validFrom: new Date().toISOString().slice(0, 10),
      validTo: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    },
  });

  const appliesTo = watch('appliesTo');
  const segmentResidential = watch('segmentResidential');
  const segmentBusiness = watch('segmentBusiness');

  const selectedSegments = useMemo(() => {
    const segments: CustomerSegment[] = [];
    if (segmentResidential) segments.push(CustomerSegment.RESIDENTIAL);
    if (segmentBusiness) segments.push(CustomerSegment.CORPORATE);
    return segments;
  }, [segmentBusiness, segmentResidential]);

  const submitPromotion = async (values: PromotionFormValues) => {
    const payload: CreatePromotionDto = {
      name: values.name.trim(),
      code: values.code.trim().toUpperCase(),
      discountType: values.discountType,
      discountValue: values.discountValue.toFixed(2),
      appliesTo: values.appliesTo,
      validFrom: new Date(`${values.validFrom}T00:00:00`).toISOString(),
      validTo: new Date(`${values.validTo}T23:59:59`).toISOString(),
      ...(values.description?.trim() && { description: values.description.trim() }),
      ...(values.appliesTo === PromotionScope.ITEM &&
        values.targetItemId && {
          targetItemId: values.targetItemId,
        }),
      ...(values.appliesTo === PromotionScope.BUNDLE &&
        values.targetBundleId && {
          targetBundleId: values.targetBundleId,
        }),
      ...(selectedSegments.length > 0 && { targetSegments: selectedSegments }),
      ...(values.maxUses && { maxUses: Number(values.maxUses) }),
    };

    await onSubmit(payload);

    reset();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Crear promocion</DialogTitle>
          <DialogDescription>
            Configura un incentivo temporal con alcance, vigencia y limite de uso opcional.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={handleSubmit(submitPromotion)}>
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Nombre" placeholder="Promo reconexion abril" {...register('name')} />
            <Input
              label="Codigo"
              placeholder="PROMO25"
              {...register('code', {
                onChange: (event) => {
                  const value = String(event.target.value ?? '').toUpperCase();
                  setValue('code', value, { shouldDirty: true, shouldValidate: true });
                },
              })}
            />
            <div className="md:col-span-2">
              <label
                htmlFor="promotion-description"
                className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-600 dark:text-gray-300"
              >
                Descripcion
              </label>
              <textarea
                id="promotion-description"
                rows={3}
                className="mt-2 w-full rounded-2xl border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none transition-colors focus:border-iwana-secondary focus:ring-2 focus:ring-iwana-secondary/30 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-100"
                placeholder="Beneficio temporal para reactivar cartera"
                {...register('description')}
              />
            </div>
            <Select
              id="promotion-discount-type"
              label="Tipo de descuento"
              {...register('discountType')}
            >
              <option value={DiscountType.PERCENTAGE}>Porcentaje</option>
              <option value={DiscountType.FIXED_AMOUNT}>Monto fijo</option>
              <option value={DiscountType.FREE_MONTHS}>Meses gratis</option>
            </Select>
            <Input
              label="Valor de descuento"
              type="number"
              min={0}
              step="0.01"
              {...register('discountValue')}
            />
            <Select id="promotion-scope" label="Alcance" {...register('appliesTo')}>
              <option value={PromotionScope.ALL}>Todo</option>
              <option value={PromotionScope.ITEM}>Item especifico</option>
              <option value={PromotionScope.BUNDLE}>Combo especifico</option>
              <option value={PromotionScope.INSTALLATION}>Instalacion</option>
            </Select>
            <Input label="Maximo de usos" type="number" min={1} step={1} {...register('maxUses')} />
            <Input label="Vigencia desde" type="date" {...register('validFrom')} />
            <Input label="Vigencia hasta" type="date" {...register('validTo')} />
          </div>

          {appliesTo === PromotionScope.ITEM && (
            <Select id="promotion-target-item" label="Item objetivo" {...register('targetItemId')}>
              <option value="">Selecciona un item</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({getTypeLabel(item.type)})
                </option>
              ))}
            </Select>
          )}

          {appliesTo === PromotionScope.BUNDLE && (
            <Select
              id="promotion-target-bundle"
              label="Combo objetivo"
              {...register('targetBundleId')}
            >
              <option value="">Selecciona un combo</option>
              {bundles
                .filter((bundle) => bundle.isActive)
                .map((bundle) => (
                  <option key={bundle.id} value={bundle.id}>
                    {bundle.name}
                  </option>
                ))}
            </Select>
          )}

          <section className="space-y-2 rounded-2xl border border-gray-200 p-4 dark:border-dark-border">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              Segmentos objetivo
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              <label className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-dark-border">
                <input type="checkbox" {...register('segmentResidential')} />
                Residencial
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-dark-border">
                <input type="checkbox" {...register('segmentBusiness')} />
                Empresarial
              </label>
            </div>
            <p className="text-xs text-gray-500">
              Si no seleccionas ninguno, la promocion aplica a todos.
            </p>
          </section>

          {errors.name && <p className="text-xs text-red-600">{errors.name.message}</p>}
          {errors.code && <p className="text-xs text-red-600">{errors.code.message}</p>}
          {errors.discountValue && (
            <p className="text-xs text-red-600">{errors.discountValue.message}</p>
          )}
          {errors.targetItemId && (
            <p className="text-xs text-red-600">{errors.targetItemId.message}</p>
          )}
          {errors.targetBundleId && (
            <p className="text-xs text-red-600">{errors.targetBundleId.message}</p>
          )}
          {errors.maxUses && <p className="text-xs text-red-600">{errors.maxUses.message}</p>}
          {errors.validTo && <p className="text-xs text-red-600">{errors.validTo.message}</p>}

          {serverError && <p className="text-sm text-red-600">{serverError}</p>}

          <div className="flex items-center justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={isSubmitting}>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!canEdit || isSubmitting}>
              {isSubmitting ? 'Guardando...' : 'Crear promocion'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
