'use client';

import { useEffect, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CircleAlert } from 'lucide-react';
import { CheckboxCard, DatePicker, Input, Select } from '@iwana/ui';
import { CatalogItemType, CustomerSegment, DiscountType, PromotionScope } from '@iwana/shared';
import type { CommercialBundle, CreatePromotionDto } from '@/lib/api-client';
import { commercialTextareaClassName } from '@/components/commercial/commercial-field-styles';
import { PortalAlert } from '@/components/shared/portal-ui';

const promotionFormSchema = z
  .object({
    name: z.string().trim().min(2, 'Mínimo 2 caracteres.').max(200, 'Máximo 200 caracteres.'),
    code: z
      .string()
      .trim()
      .min(3, 'Mínimo 3 caracteres.')
      .max(50, 'Máximo 50 caracteres.')
      .regex(/^[A-Za-z0-9_-]+$/, 'Solo letras, números, guion y guion bajo.'),
    description: z.string().trim().max(400, 'Máximo 400 caracteres.').optional(),
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
        message: 'Selecciona el ítem objetivo.',
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
        message: 'El máximo de usos debe ser un entero positivo.',
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

function getDefaultPromotionFormValues(): PromotionFormValues {
  return {
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
  };
}

interface CreatePromotionFormProps {
  formId: string;
  open: boolean;
  canEdit: boolean;
  isSubmitting: boolean;
  serverError: string | null;
  bundles: CommercialBundle[];
  items: PromotionTargetItem[];
  onSubmit: (dto: CreatePromotionDto) => Promise<void>;
}

function getTypeLabel(type: CatalogItemType): string {
  if (type === CatalogItemType.PLAN) return 'Plan';
  if (type === CatalogItemType.PRODUCT) return 'Producto';
  return 'Servicio';
}

export function CreatePromotionForm({
  formId,
  open,
  canEdit,
  isSubmitting,
  serverError,
  bundles,
  items,
  onSubmit,
}: CreatePromotionFormProps) {
  const {
    register,
    watch,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm<PromotionFormValues>({
    resolver: zodResolver(promotionFormSchema),
    defaultValues: getDefaultPromotionFormValues(),
  });

  useEffect(() => {
    if (open) {
      reset(getDefaultPromotionFormValues());
    }
  }, [open, reset]);

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
  };

  return (
    <form id={formId} className="space-y-5" onSubmit={handleSubmit(submitPromotion)} noValidate>
      <section className="space-y-4">
        <div>
          <p className="portal-eyebrow">Información básica</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Define el incentivo, el código comercial y la vigencia de la promoción.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Input
              label="Nombre"
              placeholder="Promo reconexión abril"
              aria-invalid={errors.name ? 'true' : 'false'}
              disabled={!canEdit || isSubmitting}
              {...register('name')}
            />
            {errors.name && <p className="mt-1 text-sm text-error-600">{errors.name.message}</p>}
          </div>
          <div>
            <Input
              label="Código"
              placeholder="PROMO25"
              aria-invalid={errors.code ? 'true' : 'false'}
              disabled={!canEdit || isSubmitting}
              {...register('code', {
                onChange: (event) => {
                  const value = String(event.target.value ?? '').toUpperCase();
                  setValue('code', value, { shouldDirty: true, shouldValidate: true });
                },
              })}
            />
            {errors.code && <p className="mt-1 text-sm text-error-600">{errors.code.message}</p>}
          </div>
          <div className="md:col-span-2">
            <label htmlFor="promotion-description" className="portal-eyebrow-muted">
              Descripción
            </label>
            <textarea
              id="promotion-description"
              rows={3}
              className={`mt-2 ${commercialTextareaClassName}`}
              placeholder="Beneficio temporal para reactivar cartera"
              disabled={!canEdit || isSubmitting}
              {...register('description')}
            />
            {errors.description && (
              <p className="mt-1 text-sm text-error-600">{errors.description.message}</p>
            )}
          </div>
          <Select
            id="promotion-discount-type"
            label="Tipo de descuento"
            disabled={!canEdit || isSubmitting}
            {...register('discountType')}
          >
            <option value={DiscountType.PERCENTAGE}>Porcentaje</option>
            <option value={DiscountType.FIXED_AMOUNT}>Monto fijo</option>
            <option value={DiscountType.FREE_MONTHS}>Meses gratis</option>
          </Select>
          <div>
            <Input
              label="Valor de descuento"
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
          <Select
            id="promotion-scope"
            label="Alcance"
            disabled={!canEdit || isSubmitting}
            {...register('appliesTo')}
          >
            <option value={PromotionScope.ALL}>Todo</option>
            <option value={PromotionScope.ITEM}>Ítem específico</option>
            <option value={PromotionScope.BUNDLE}>Combo específico</option>
            <option value={PromotionScope.INSTALLATION}>Instalación</option>
          </Select>
          <div>
            <Input
              label="Máximo de usos"
              type="number"
              min={1}
              step={1}
              aria-invalid={errors.maxUses ? 'true' : 'false'}
              disabled={!canEdit || isSubmitting}
              {...register('maxUses')}
            />
            {errors.maxUses && (
              <p className="mt-1 text-sm text-error-600">{errors.maxUses.message}</p>
            )}
          </div>
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

      {appliesTo === PromotionScope.ITEM && (
        <section className="space-y-2">
          <Select
            id="promotion-target-item"
            label="Ítem objetivo"
            disabled={!canEdit || isSubmitting}
            aria-invalid={errors.targetItemId ? 'true' : 'false'}
            {...register('targetItemId')}
          >
            <option value="">Selecciona un ítem</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({getTypeLabel(item.type)})
              </option>
            ))}
          </Select>
          {errors.targetItemId && (
            <p className="text-sm text-error-600">{errors.targetItemId.message}</p>
          )}
        </section>
      )}

      {appliesTo === PromotionScope.BUNDLE && (
        <section className="space-y-2">
          <Select
            id="promotion-target-bundle"
            label="Combo objetivo"
            disabled={!canEdit || isSubmitting}
            aria-invalid={errors.targetBundleId ? 'true' : 'false'}
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
          {errors.targetBundleId && (
            <p className="text-sm text-error-600">{errors.targetBundleId.message}</p>
          )}
        </section>
      )}

      <section className="space-y-3">
        <div>
          <p className="portal-eyebrow">Segmentos objetivo</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Si no seleccionas ninguno, la promoción aplica a todos.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Controller
            name="segmentResidential"
            control={control}
            render={({ field }) => (
              <CheckboxCard
                label="Residencial"
                checked={field.value}
                onChange={(event) => field.onChange(event.target.checked)}
                onBlur={field.onBlur}
                ref={field.ref}
                name={field.name}
                disabled={!canEdit || isSubmitting}
              />
            )}
          />
          <Controller
            name="segmentBusiness"
            control={control}
            render={({ field }) => (
              <CheckboxCard
                label="Empresarial"
                checked={field.value}
                onChange={(event) => field.onChange(event.target.checked)}
                onBlur={field.onBlur}
                ref={field.ref}
                name={field.name}
                disabled={!canEdit || isSubmitting}
              />
            )}
          />
        </div>
      </section>

      {serverError && (
        <PortalAlert
          variant="error"
          title="No fue posible crear la promoción"
          description={serverError}
          icon={CircleAlert}
        />
      )}
    </form>
  );
}
