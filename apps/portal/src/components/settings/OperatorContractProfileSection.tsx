'use client';

import { useCallback, useEffect, useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { Plus, RefreshCcw, Trash2 } from 'lucide-react';
import { Button, FormStatus, Input, Select } from '@iwana/ui';
import {
  OPERATOR_CUSTOMER_SERVICE_CHANNEL_KINDS,
  UpdateOperatorContractProfileSchema,
  type OperatorContractProfile,
  type OperatorContractRequiredField,
  type OperatorCustomerServiceChannelKind,
  type UpdateOperatorContractProfileInput,
} from '@iwana/shared';
import { ApiError, organizationApi } from '@/lib/api-client';
import {
  PortalAlert,
  PortalPanel,
  PortalSkeletonBlock,
  portalTextareaClassName,
} from '@/components/shared/portal-ui';

/** Máximo de medios de atención (esquema compartido). */
export const MAX_CUSTOMER_SERVICE_CHANNELS = 10;

export const CUSTOMER_SERVICE_CHANNEL_KIND_LABELS: Record<
  OperatorCustomerServiceChannelKind,
  string
> = {
  PHONE: 'Teléfono',
  EMAIL: 'Correo',
  WEB: 'Sitio web',
  OFFICE: 'Oficina',
  OTHER: 'Otro',
};

export const OPERATOR_CONTRACT_FIELD_LABELS: Record<OperatorContractRequiredField, string> = {
  legalName: 'Razón social',
  nit: 'NIT',
  qualityAndCoverageUrl: 'Web de calidad y cobertura',
  customerServiceChannels: 'Medios de atención',
  reconnectionFee: 'Costo de reconexión',
  annualIncreaseCapPercent: 'Tope de incremento anual',
  equipmentIncidentReportChannel: 'Canal de reporte de hurto o daño de equipos',
};

const FIELD_ERROR_MESSAGES = {
  qualityAndCoverageUrl: 'Ingresa una dirección web válida que empiece por https://.',
  reconnectionFee: 'Ingresa un valor de 0 o más, con hasta dos decimales.',
  annualIncreaseCapPercent: 'Ingresa un porcentaje entre 0 y 100, con hasta dos decimales.',
  equipmentIncidentReportChannel: 'Escribe al menos 3 caracteres (máximo 500).',
  otherConditions: 'Máximo 10.000 caracteres.',
  channelValue: 'Escribe al menos 3 caracteres (máximo 255).',
  channelLabel: 'Máximo 80 caracteres.',
} as const;

const kindOptions = OPERATOR_CUSTOMER_SERVICE_CHANNEL_KINDS.map((kind) => ({
  value: kind,
  label: CUSTOMER_SERVICE_CHANNEL_KIND_LABELS[kind],
}));

interface ChannelFormValue {
  kind: OperatorCustomerServiceChannelKind;
  value: string;
  label: string;
}

interface ContractProfileFormValues {
  qualityAndCoverageUrl: string;
  customerServiceChannels: ChannelFormValue[];
  reconnectionFee: string;
  annualIncreaseCapPercent: string;
  equipmentIncidentReportChannel: string;
  otherConditions: string;
}

function toFormValues(profile: OperatorContractProfile): ContractProfileFormValues {
  return {
    qualityAndCoverageUrl: profile.qualityAndCoverageUrl ?? '',
    customerServiceChannels: profile.customerServiceChannels.map((channel) => ({
      kind: channel.kind,
      value: channel.value,
      label: channel.label ?? '',
    })),
    reconnectionFee: profile.reconnectionFee === null ? '' : String(profile.reconnectionFee),
    annualIncreaseCapPercent:
      profile.annualIncreaseCapPercent === null ? '' : String(profile.annualIncreaseCapPercent),
    equipmentIncidentReportChannel: profile.equipmentIncidentReportChannel ?? '',
    otherConditions: profile.otherConditions ?? '',
  };
}

function nullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function nullableNumber(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

function toPayload(values: ContractProfileFormValues): UpdateOperatorContractProfileInput {
  return {
    qualityAndCoverageUrl: nullableText(values.qualityAndCoverageUrl),
    customerServiceChannels: values.customerServiceChannels.map((channel) => ({
      kind: channel.kind,
      value: channel.value.trim(),
      label: nullableText(channel.label),
    })),
    reconnectionFee: nullableNumber(values.reconnectionFee),
    annualIncreaseCapPercent: nullableNumber(values.annualIncreaseCapPercent),
    equipmentIncidentReportChannel: nullableText(values.equipmentIncidentReportChannel),
    otherConditions: nullableText(values.otherConditions),
  };
}

type LoadState = 'loading' | 'ready' | 'error' | 'denied';

interface OperatorContractProfileSectionProps {
  /** ADMIN con permiso de gestionar sedes (PUT). */
  canEdit: boolean;
}

export function OperatorContractProfileSection({ canEdit }: OperatorContractProfileSectionProps) {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [profile, setProfile] = useState<OperatorContractProfile | null>(null);
  const [missingFields, setMissingFields] = useState<OperatorContractRequiredField[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    clearErrors,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<ContractProfileFormValues>({
    defaultValues: {
      qualityAndCoverageUrl: '',
      customerServiceChannels: [],
      reconnectionFee: '',
      annualIncreaseCapPercent: '',
      equipmentIncidentReportChannel: '',
      otherConditions: '',
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'customerServiceChannels' });

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      const response = await organizationApi.getContractProfile();
      setProfile(response.data);
      setMissingFields(response.meta?.missingFields ?? []);
      reset(toFormValues(response.data));
      setLoadState('ready');
    } catch (error) {
      setLoadState(error instanceof ApiError && error.status === 403 ? 'denied' : 'error');
    }
  }, [reset]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSubmit = async (values: ContractProfileFormValues) => {
    setServerError(null);
    setSuccess(null);
    clearErrors();

    const parsed = UpdateOperatorContractProfileSchema.safeParse(toPayload(values));
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const [root, index, leaf] = issue.path;
        if (root === 'customerServiceChannels' && typeof index === 'number') {
          if (leaf === 'value' || leaf === 'label') {
            setError(`customerServiceChannels.${index}.${leaf}`, {
              message:
                leaf === 'value'
                  ? FIELD_ERROR_MESSAGES.channelValue
                  : FIELD_ERROR_MESSAGES.channelLabel,
            });
          }
          continue;
        }
        if (typeof root === 'string' && root in FIELD_ERROR_MESSAGES) {
          setError(root as keyof ContractProfileFormValues, {
            message: FIELD_ERROR_MESSAGES[root as keyof typeof FIELD_ERROR_MESSAGES],
          });
        }
      }
      return;
    }

    try {
      const response = await organizationApi.updateContractProfile(parsed.data);
      setProfile(response.data);
      setMissingFields(response.meta?.missingFields ?? []);
      reset(toFormValues(response.data));
      setSuccess('Los datos del operador para contratos quedaron guardados.');
    } catch (error) {
      setServerError(
        error instanceof ApiError && error.status === 403
          ? 'No tienes permiso para cambiar estos datos.'
          : 'No fue posible guardar los datos. Revisa la información e intenta de nuevo.',
      );
    }
  };

  const disabled = !canEdit || isSubmitting;

  return (
    <PortalPanel
      title="Datos del operador para contratos"
      description="Información que se imprime en el contrato único de servicios. Sin los datos obligatorios no se puede generar el contrato."
      busy={loadState === 'loading'}
    >
      {loadState === 'loading' ? <PortalSkeletonBlock className="h-64" /> : null}

      {loadState === 'denied' ? (
        <PortalAlert
          variant="warning"
          title="Datos no disponibles"
          description="No tienes permiso para consultar los datos del operador para contratos."
        />
      ) : null}

      {loadState === 'error' ? (
        <PortalAlert
          variant="error"
          title="No se cargaron los datos del operador"
          description="Ocurrió un problema al consultar la información. Intenta de nuevo."
          action={
            <Button
              type="button"
              variant="link"
              size="lg"
              // Sobre el fondo rojo de PortalAlert el verde del enlace no llega a 4,5:1;
              // usa el color de título de la alerta de error (WCAG 1.4.3).
              className="min-h-11 text-red-900 dark:text-red-100"
              onClick={() => void load()}
            >
              <RefreshCcw className="h-4 w-4" aria-hidden={true} />
              Reintentar
            </Button>
          }
        />
      ) : null}

      {loadState === 'ready' && profile ? (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="min-w-0 space-y-6">
          {missingFields.length > 0 ? (
            <PortalAlert
              variant="warning"
              title="Faltan datos obligatorios para generar contratos"
              description={`Completa: ${missingFields
                .map((field) => OPERATOR_CONTRACT_FIELD_LABELS[field])
                .join(', ')}.${
                missingFields.includes('legalName') || missingFields.includes('nit')
                  ? ' La razón social y el NIT se editan en el perfil de la empresa.'
                  : ''
              }`}
            />
          ) : null}

          <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              id="contract-legal-name"
              label="Razón social"
              value={profile.legalName ?? ''}
              placeholder="Sin registrar"
              readOnly
              disabled
              className="h-11"
            />
            <Input
              id="contract-nit"
              label="NIT"
              value={profile.nit ?? ''}
              placeholder="Sin registrar"
              readOnly
              disabled
              className="h-11"
            />
            <div className="md:col-span-2">
              <Input
                id="contract-quality-url"
                label="Web de calidad y cobertura"
                type="url"
                placeholder="https://empresa.co/calidad"
                disabled={disabled}
                error={errors.qualityAndCoverageUrl?.message}
                className="h-11"
                {...register('qualityAndCoverageUrl')}
              />
            </div>
            <Input
              id="contract-reconnection-fee"
              label="Costo de reconexión (COP)"
              inputMode="decimal"
              disabled={disabled}
              error={errors.reconnectionFee?.message}
              className="h-11"
              {...register('reconnectionFee')}
            />
            <Input
              id="contract-annual-cap"
              label="Tope de incremento anual (%)"
              inputMode="decimal"
              disabled={disabled}
              error={errors.annualIncreaseCapPercent?.message}
              className="h-11"
              {...register('annualIncreaseCapPercent')}
            />
            <div className="md:col-span-2">
              <Input
                id="contract-equipment-channel"
                label="Canal de reporte de hurto o daño de equipos"
                placeholder="Línea de atención, correo u oficina"
                disabled={disabled}
                error={errors.equipmentIncidentReportChannel?.message}
                className="h-11"
                {...register('equipmentIncidentReportChannel')}
              />
            </div>
          </div>

          <fieldset className="min-w-0 space-y-3">
            <legend className="portal-eyebrow">Medios de atención</legend>
            {fields.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Aún no hay medios de atención registrados.
              </p>
            ) : null}
            <ul className="space-y-3">
              {fields.map((field, index) => (
                <li
                  key={field.id}
                  className="grid min-w-0 grid-cols-1 gap-3 rounded-xl border border-gray-200 p-3 md:grid-cols-[10rem_minmax(0,1fr)_minmax(0,12rem)_auto] md:items-start dark:border-dark-border"
                >
                  <Controller
                    control={control}
                    name={`customerServiceChannels.${index}.kind`}
                    render={({ field: kindField }) => (
                      <Select
                        id={`contract-channel-${index}-kind`}
                        label="Tipo"
                        options={kindOptions}
                        name={kindField.name}
                        value={kindField.value}
                        onChange={(event) => kindField.onChange(event.target.value)}
                        onBlur={kindField.onBlur}
                        ref={kindField.ref}
                        disabled={disabled}
                      />
                    )}
                  />
                  <Input
                    id={`contract-channel-${index}-value`}
                    label="Dato de contacto"
                    disabled={disabled}
                    error={errors.customerServiceChannels?.[index]?.value?.message}
                    className="h-11"
                    {...register(`customerServiceChannels.${index}.value`)}
                  />
                  <Input
                    id={`contract-channel-${index}-label`}
                    label="Etiqueta (opcional)"
                    disabled={disabled}
                    error={errors.customerServiceChannels?.[index]?.label?.message}
                    className="h-11"
                    {...register(`customerServiceChannels.${index}.label`)}
                  />
                  {canEdit ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="lg"
                      className="min-h-11 md:mt-6"
                      aria-label={`Quitar medio de atención ${index + 1}`}
                      disabled={isSubmitting}
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden={true} />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
            {canEdit ? (
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="min-h-11"
                  disabled={isSubmitting || fields.length >= MAX_CUSTOMER_SERVICE_CHANNELS}
                  onClick={() => append({ kind: 'PHONE', value: '', label: '' })}
                >
                  <Plus className="h-4 w-4" aria-hidden={true} />
                  Agregar medio de atención
                </Button>
                {fields.length >= MAX_CUSTOMER_SERVICE_CHANNELS ? (
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Puedes registrar hasta {MAX_CUSTOMER_SERVICE_CHANNELS} medios de atención.
                  </p>
                ) : null}
              </div>
            ) : null}
          </fieldset>

          <div className="space-y-1">
            <label htmlFor="contract-other-conditions" className="text-sm font-medium">
              Otras condiciones (opcional)
            </label>
            <textarea
              id="contract-other-conditions"
              rows={4}
              maxLength={10_000}
              disabled={disabled}
              aria-invalid={errors.otherConditions ? true : undefined}
              aria-describedby={
                errors.otherConditions ? 'contract-other-conditions-error' : undefined
              }
              className={portalTextareaClassName}
              {...register('otherConditions')}
            />
            {errors.otherConditions?.message ? (
              <p
                id="contract-other-conditions-error"
                role="alert"
                className="text-xs text-iwana-error-700 dark:text-red-300"
              >
                {errors.otherConditions.message}
              </p>
            ) : null}
          </div>

          <FormStatus
            status={serverError ? 'error' : success ? 'success' : 'idle'}
            message={serverError ?? success ?? undefined}
          />

          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0 break-words text-xs text-gray-500 dark:text-gray-400">
              {canEdit
                ? 'Los cambios aplican a los contratos que se generen desde ahora.'
                : 'Solo un administrador con permiso para gestionar sedes puede cambiar estos datos.'}
            </p>
            {canEdit ? (
              <Button
                type="submit"
                size="lg"
                className="w-full shrink-0 sm:w-auto"
                loading={isSubmitting}
                disabled={isSubmitting || !isDirty}
              >
                Guardar datos del operador
              </Button>
            ) : null}
          </div>
        </form>
      ) : null}
    </PortalPanel>
  );
}
