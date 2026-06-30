'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  Control,
  FieldErrors,
  UseFormRegister,
  UseFormSetValue,
  UseFormWatch,
} from 'react-hook-form';
import { Controller } from 'react-hook-form';
import { Button, Input, Select } from '@iwana/ui';
import { TaskExecutionMode, TaskPriority, TaskRecipientType, TaskType } from '@iwana/shared';
import type { ExpedienteRecord, SubscriberRecord } from '@/lib/api-client';
import { crmApi, subscribersApi } from '@/lib/api-client';
import { PortalAlert } from '@/components/shared/portal-ui';
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

interface TaskRecipientSearchOption {
  value: string;
  label: string;
  meta: string | null;
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

function formatProspectOption(expediente: ExpedienteRecord): TaskRecipientSearchOption {
  return {
    value: expediente.id,
    label: expediente.fullName,
    meta: expediente.municipality ?? expediente.emailPrimary ?? expediente.documentNumber ?? null,
  };
}

function formatSubscriberOption(subscriber: SubscriberRecord): TaskRecipientSearchOption {
  const label =
    subscriber.commercialName?.trim() ||
    subscriber.businessName?.trim() ||
    [subscriber.firstName, subscriber.lastName].filter(Boolean).join(' ').trim() ||
    subscriber.email?.trim() ||
    subscriber.documentNumber?.trim() ||
    `Suscriptor ${subscriber.id.slice(0, 8)}`;

  return {
    value: subscriber.id,
    label,
    meta: subscriber.city ?? subscriber.email ?? subscriber.documentNumber ?? null,
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

  const [recipientSearch, setRecipientSearch] = useState('');
  const [recipientSearchResults, setRecipientSearchResults] = useState<TaskRecipientSearchOption[]>(
    [],
  );
  const [isSearchingRecipients, setIsSearchingRecipients] = useState(false);
  const [recipientSearchError, setRecipientSearchError] = useState<string | null>(null);

  const currentRecipientOptions =
    recipientType === TaskRecipientType.INTERNAL_USER ? internalUserOptions : internalAreaOptions;

  const usesRemoteRecipientLookup = useMemo(
    () => CATALOG_RECIPIENT_TYPES.includes(recipientType),
    [recipientType],
  );

  const recipientSearchLabel =
    recipientType === TaskRecipientType.PROSPECT ? 'Buscar prospecto' : 'Buscar suscriptor';
  const recipientSearchPlaceholder =
    recipientType === TaskRecipientType.PROSPECT
      ? 'Nombre, documento o correo del prospecto'
      : 'Nombre, documento o correo del suscriptor';
  const recipientLoadErrorMessage =
    recipientType === TaskRecipientType.PROSPECT
      ? 'No fue posible consultar prospectos del CRM.'
      : 'No fue posible consultar suscriptores creados.';

  useEffect(() => {
    if (!usesRemoteRecipientLookup || selectedRecipientRefId) {
      setRecipientSearchResults([]);
      setRecipientSearchError(null);
      setIsSearchingRecipients(false);
      return;
    }

    const normalizedQuery = recipientSearch.trim();
    if (normalizedQuery.length < 2) {
      setRecipientSearchResults([]);
      setRecipientSearchError(null);
      setIsSearchingRecipients(false);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setIsSearchingRecipients(true);
      setRecipientSearchError(null);

      try {
        if (recipientType === TaskRecipientType.PROSPECT) {
          const response = await crmApi.listExpedientes({
            search: normalizedQuery,
            limit: 6,
            view: 'all',
          });
          if (!cancelled) {
            setRecipientSearchResults(response.data.map(formatProspectOption));
          }
          return;
        }

        const response = await subscribersApi.list({ search: normalizedQuery, limit: 6 });
        if (!cancelled) {
          setRecipientSearchResults(response.data.map(formatSubscriberOption));
        }
      } catch {
        if (!cancelled) {
          setRecipientSearchResults([]);
          setRecipientSearchError(recipientLoadErrorMessage);
        }
      } finally {
        if (!cancelled) {
          setIsSearchingRecipients(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    recipientSearch,
    recipientType,
    recipientLoadErrorMessage,
    selectedRecipientRefId,
    usesRemoteRecipientLookup,
  ]);

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
              setValue('recipientRefId', '', { shouldDirty: true, shouldValidate: true });
              setValue('recipientLabel', '', { shouldDirty: true, shouldValidate: true });
              setRecipientSearch('');
              setRecipientSearchResults([]);
              setRecipientSearchError(null);
              setIsSearchingRecipients(false);
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
          <Input
            id="task-recipient-search"
            label={recipientSearchLabel}
            value={recipientSearch}
            onChange={(event) => setRecipientSearch(event.target.value)}
            placeholder={recipientSearchPlaceholder}
            disabled={disabled || Boolean(selectedRecipientRefId)}
            helperText={
              selectedRecipientRefId
                ? 'Usa "Cambiar destinatario" si deseas escoger otro registro.'
                : 'Escribe al menos 2 caracteres para consultar registros existentes.'
            }
            error={errors.recipientRefId?.message ?? undefined}
          />

          <PortalAlert
            variant="info"
            title="Se usan registros ya creados"
            description={
              recipientType === TaskRecipientType.PROSPECT
                ? 'Las tareas dirigidas a prospectos se vinculan con expedientes existentes del CRM.'
                : 'Las tareas dirigidas a suscriptores se vinculan con registros comerciales existentes.'
            }
          />

          {selectedRecipientRefId && selectedRecipientLabel && (
            <div className="rounded-2xl border border-iwana-primary-100 bg-iwana-primary-50 px-4 py-3 text-sm dark:border-iwana-primary-800 dark:bg-iwana-primary-950/40">
              <p className="portal-eyebrow">Destinatario seleccionado</p>
              <p className="mt-1 font-medium text-iwana-primary dark:text-white">
                {selectedRecipientLabel}
              </p>
              <button
                type="button"
                className="mt-2 text-xs font-medium text-iwana-primary underline-offset-4 hover:underline dark:text-iwana-secondary-300"
                disabled={disabled}
                onClick={() => {
                  setValue('recipientRefId', '', { shouldDirty: true, shouldValidate: true });
                  setValue('recipientLabel', '', { shouldDirty: true, shouldValidate: true });
                  setRecipientSearch('');
                  setRecipientSearchResults([]);
                  setRecipientSearchError(null);
                }}
              >
                Cambiar destinatario
              </button>
            </div>
          )}

          {isSearchingRecipients && (
            <p className="text-sm text-gray-500 dark:text-gray-400">Buscando coincidencias...</p>
          )}

          {recipientSearchError && (
            <p className="text-sm text-red-600 dark:text-red-400">{recipientSearchError}</p>
          )}

          {!isSearchingRecipients && recipientSearchResults.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white p-2 shadow-sm dark:border-dark-border dark:bg-dark-surface-3">
              <ul className="space-y-1">
                {recipientSearchResults.map((option) => (
                  <li key={option.value}>
                    <button
                      type="button"
                      className="w-full rounded-xl px-3 py-2 text-left transition-colors hover:bg-iwana-surface-soft dark:hover:bg-dark-surface-4"
                      disabled={disabled}
                      onClick={() => {
                        setValue('recipientRefId', option.value, {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                        setValue('recipientLabel', option.label, {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                        setRecipientSearch(option.label);
                        setRecipientSearchResults([]);
                      }}
                    >
                      <p className="font-medium text-gray-900 dark:text-white">{option.label}</p>
                      {option.meta && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">{option.meta}</p>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!isSearchingRecipients &&
            !selectedRecipientRefId &&
            recipientSearch.trim().length >= 2 &&
            recipientSearchResults.length === 0 &&
            !recipientSearchError && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No encontramos coincidencias con ese criterio.
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
