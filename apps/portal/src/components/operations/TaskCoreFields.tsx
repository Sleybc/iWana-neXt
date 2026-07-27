'use client';

import { useCallback, useMemo, useState } from 'react';
import type {
  Control,
  FieldErrors,
  UseFormRegister,
  UseFormSetValue,
  UseFormWatch,
} from 'react-hook-form';
import { Controller } from 'react-hook-form';
import { Input, Select } from '@iwana/ui';
import { TaskExecutionMode, TaskPriority, TaskRecipientType, TaskType } from '@iwana/shared';
import type { ExpedienteRecord, SubscriberRecord } from '@/lib/api-client';
import { crmApi, subscribersApi } from '@/lib/api-client';
import { PortalAlert } from '@/components/shared/portal-ui';
import { SearchablePicker, type SearchablePickerItem } from '@/components/shared/SearchablePicker';
import {
  TASK_EXECUTION_MODE_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_RECIPIENT_TYPE_LABELS,
  TASK_TYPE_LABELS,
} from './operations-labels';
import type { TaskIntakeValues } from './task-intake-schema';
import { CATALOG_RECIPIENT_TYPES, INTERNAL_RECIPIENT_TYPES } from './task-intake-schema';

export interface TaskCoreFieldsProps {
  control: Control<TaskIntakeValues>;
  register: UseFormRegister<TaskIntakeValues>;
  watch: UseFormWatch<TaskIntakeValues>;
  setValue: UseFormSetValue<TaskIntakeValues>;
  errors: FieldErrors<TaskIntakeValues>;
  responsibleOptions: Array<{ value: string; label: string }>;
  internalAreaOptions: Array<{ value: string; label: string }>;
  internalUserOptions: Array<{ value: string; label: string }>;
  disabled?: boolean;
}

const TYPE_OPTIONS = Object.values(TaskType).map((value) => ({
  value,
  label: TASK_TYPE_LABELS[value],
}));

const PRIORITY_OPTIONS = Object.values(TaskPriority).map((value) => ({
  value,
  label: TASK_PRIORITY_LABELS[value],
}));

const RECIPIENT_TYPE_OPTIONS = Object.values(TaskRecipientType).map((value) => ({
  value,
  label: TASK_RECIPIENT_TYPE_LABELS[value],
}));

const EXECUTION_MODE_OPTIONS = Object.values(TaskExecutionMode).map((value) => ({
  value,
  label: TASK_EXECUTION_MODE_LABELS[value],
}));

/** Límite canónico E-4 typeahead (máx. dominio ≤20); no soft-cap silencioso de 6. */
const RECIPIENT_PICKER_LIMIT = 20;

function formatProspectOption(expediente: ExpedienteRecord): SearchablePickerItem {
  return {
    id: expediente.id,
    label: expediente.fullName,
    sublabel:
      expediente.municipality ?? expediente.emailPrimary ?? expediente.documentNumber ?? null,
  };
}

function formatSubscriberOption(subscriber: SubscriberRecord): SearchablePickerItem {
  const label =
    subscriber.commercialName?.trim() ||
    subscriber.businessName?.trim() ||
    [subscriber.firstName, subscriber.lastName].filter(Boolean).join(' ').trim() ||
    subscriber.email?.trim() ||
    subscriber.documentNumber?.trim() ||
    `Suscriptor ${subscriber.id.slice(0, 8)}`;

  return {
    id: subscriber.id,
    label,
    sublabel: subscriber.city ?? subscriber.email ?? subscriber.documentNumber ?? null,
  };
}

export function TaskCoreFields({
  control,
  register,
  watch,
  setValue,
  errors,
  responsibleOptions,
  internalAreaOptions,
  internalUserOptions,
  disabled = false,
}: TaskCoreFieldsProps) {
  const executionMode = watch('executionMode');
  const recipientType = watch('recipientType');
  const selectedRecipientRefId = watch('recipientRefId');
  const selectedRecipientLabel = watch('recipientLabel');

  const [selectedRecipientItem, setSelectedRecipientItem] = useState<Pick<
    SearchablePickerItem,
    'label' | 'sublabel'
  > | null>(
    selectedRecipientRefId && selectedRecipientLabel ? { label: selectedRecipientLabel } : null,
  );

  const currentRecipientOptions =
    recipientType === TaskRecipientType.INTERNAL_USER ? internalUserOptions : internalAreaOptions;

  const usesRemoteRecipientLookup = useMemo(
    () => CATALOG_RECIPIENT_TYPES.includes(recipientType),
    [recipientType],
  );

  const recipientResource =
    recipientType === TaskRecipientType.PROSPECT
      ? { singular: 'prospecto', plural: 'prospectos' }
      : { singular: 'suscriptor', plural: 'suscriptores' };

  const searchRecipients = useCallback(
    async (query: string, signal: AbortSignal) => {
      if (recipientType === TaskRecipientType.PROSPECT) {
        const response = await crmApi.listExpedientes(
          {
            search: query,
            limit: RECIPIENT_PICKER_LIMIT,
            view: 'all',
          },
          undefined,
          { signal },
        );
        return {
          items: response.data.map(formatProspectOption),
          total: response.total,
        };
      }

      // F4: `/crm/subscribers/search` es exacto-hash (documento/NIT/email/tel).
      // Typeahead usable: listado con `search` (ILIKE sobre nombre comercial / razón social).
      const response = await subscribersApi.list(
        { search: query, limit: RECIPIENT_PICKER_LIMIT, page: 1 },
        undefined,
        { signal },
      );
      return {
        items: response.data.map(formatSubscriberOption),
        total: response.total,
      };
    },
    [recipientType],
  );

  const clearRecipient = useCallback(() => {
    setValue('recipientRefId', '', { shouldDirty: true, shouldValidate: true });
    setValue('recipientLabel', '', { shouldDirty: true, shouldValidate: true });
    setSelectedRecipientItem(null);
  }, [setValue]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Input
        id="task-title"
        label="Titulo"
        placeholder="Describe la tarea operativa"
        helperText="Usa un verbo de accion y el resultado esperado."
        error={errors.title?.message}
        containerClassName="md:col-span-2"
        disabled={disabled}
        {...register('title')}
      />

      <Controller
        control={control}
        name="type"
        render={({ field }) => (
          <Select
            id="task-type"
            label="Tipo"
            value={field.value}
            onChange={field.onChange}
            options={TYPE_OPTIONS}
            disabled={disabled}
          />
        )}
      />

      <Controller
        control={control}
        name="priority"
        render={({ field }) => (
          <Select
            id="task-priority"
            label="Prioridad"
            value={field.value}
            onChange={field.onChange}
            options={PRIORITY_OPTIONS}
            disabled={disabled}
          />
        )}
      />

      <Controller
        control={control}
        name="executionMode"
        render={({ field }) => (
          <Select
            id="task-execution-mode"
            label="Modo de ejecucion"
            value={field.value}
            onChange={field.onChange}
            options={EXECUTION_MODE_OPTIONS}
            disabled={disabled}
          />
        )}
      />

      <Controller
        control={control}
        name="responsibleRefId"
        render={({ field }) => (
          <Select
            id="task-responsible"
            label="Responsable"
            value={field.value}
            onChange={field.onChange}
            options={responsibleOptions}
            placeholder="Selecciona responsable"
            disabled={disabled}
            {...(errors.responsibleRefId?.message
              ? { error: errors.responsibleRefId.message }
              : {})}
          />
        )}
      />

      {executionMode === TaskExecutionMode.DUE_DATE && (
        <Input
          id="task-due-at"
          type="datetime-local"
          label="Fecha objetivo"
          error={errors.dueAt?.message}
          disabled={disabled}
          {...register('dueAt')}
        />
      )}

      <Controller
        control={control}
        name="recipientType"
        render={({ field }) => (
          <Select
            id="task-recipient-type"
            label="Tipo de destinatario"
            value={field.value}
            onChange={(event) => {
              field.onChange(event);
              clearRecipient();
            }}
            options={RECIPIENT_TYPE_OPTIONS}
            disabled={disabled}
          />
        )}
      />

      {INTERNAL_RECIPIENT_TYPES.includes(recipientType) ? (
        <Controller
          control={control}
          name="recipientRefId"
          render={({ field }) => (
            <Select
              id="task-recipient"
              label="Destinatario"
              value={field.value}
              onChange={field.onChange}
              options={currentRecipientOptions}
              placeholder="Selecciona destinatario"
              disabled={disabled}
              {...(errors.recipientRefId?.message ? { error: errors.recipientRefId.message } : {})}
            />
          )}
        />
      ) : usesRemoteRecipientLookup ? (
        <div className="space-y-3 md:col-span-2">
          <SearchablePicker
            id="task-recipient-search"
            label={
              recipientType === TaskRecipientType.PROSPECT
                ? 'Buscar prospecto'
                : 'Buscar suscriptor'
            }
            resource={recipientResource}
            value={selectedRecipientRefId || null}
            selectedItem={selectedRecipientItem}
            onChange={(item) => {
              if (!item) {
                clearRecipient();
                return;
              }
              setValue('recipientRefId', item.id, {
                shouldDirty: true,
                shouldValidate: true,
              });
              setValue('recipientLabel', item.label, {
                shouldDirty: true,
                shouldValidate: true,
              });
              setSelectedRecipientItem({ label: item.label, sublabel: item.sublabel });
            }}
            onSearch={searchRecipients}
            placeholder={
              recipientType === TaskRecipientType.PROSPECT
                ? 'Nombre, documento o correo del prospecto'
                : 'Nombre o razón social del suscriptor'
            }
            disabled={disabled}
            labels={{
              empty: (resource) => `No hay ${resource.plural} que coincidan`,
              error: (resource) =>
                recipientType === TaskRecipientType.PROSPECT
                  ? 'No fue posible consultar prospectos del CRM.'
                  : `No fue posible cargar ${resource.plural}.`,
            }}
          />

          <PortalAlert
            variant="info"
            title="Se usan registros ya creados"
            description={
              recipientType === TaskRecipientType.PROSPECT
                ? 'Las tareas dirigidas a prospectos se vinculan con expedientes existentes del CRM.'
                : 'Las tareas dirigidas a suscriptores se vinculan con registros comerciales existentes. La búsqueda por documento exacto usa otro flujo; aquí se busca por nombre.'
            }
          />

          {errors.recipientRefId?.message && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {errors.recipientRefId.message}
            </p>
          )}
        </div>
      ) : (
        <>
          <Input
            id="task-recipient-label"
            label="Nombre del destinatario"
            placeholder="Nombre del contratista o tercero"
            helperText="Visible para la operacion en la tabla y el detalle."
            error={errors.recipientLabel?.message}
            disabled={disabled}
            {...register('recipientLabel')}
          />
          <Input
            id="task-recipient-ref"
            label="Referencia del destinatario"
            placeholder="Contrato, codigo o referencia externa"
            helperText="Opcional si solo necesitas una etiqueta visible."
            disabled={disabled}
            {...register('recipientRefId')}
          />
        </>
      )}
    </div>
  );
}
