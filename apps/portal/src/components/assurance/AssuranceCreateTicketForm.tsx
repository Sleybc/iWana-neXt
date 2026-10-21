'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, FormStatus, Input, Select } from '@iwana/ui';
import {
  TicketFieldDecision,
  TicketPriority,
  TicketRequesterType,
  TicketSource,
  TicketType,
} from '@iwana/shared';
import {
  subscribersApi,
  type AssuranceSlaPolicy,
  type CreateAssuranceTicketDto,
  type InternalUser,
} from '@/lib/api-client';
import { SearchablePicker, type SearchablePickerItem } from '@/components/shared/SearchablePicker';
import { formatSubscriberName } from '@/components/crm/subscribers/subscriber-ui';
import {
  ASSURANCE_FIELD_DECISION_OPTIONS,
  ASSURANCE_QUEUE_OPTIONS,
  ASSURANCE_REQUESTER_TYPE_OPTIONS,
  ASSURANCE_SOURCE_OPTIONS,
  ASSURANCE_SUBJECT_TYPE_OPTIONS,
  ASSURANCE_TICKET_PRIORITY_OPTIONS,
  ASSURANCE_TICKET_TYPE_OPTIONS,
  getAssuranceUserDisplayName,
} from './assurance-labels';
import { assuranceTextareaClassName } from './assurance-ui';

const assuranceTicketFormSchema = z
  .object({
    type: z.nativeEnum(TicketType),
    priority: z.nativeEnum(TicketPriority),
    source: z.nativeEnum(TicketSource),
    subject: z
      .string()
      .trim()
      .min(1, 'El asunto es obligatorio.')
      .max(200, 'Máximo 200 caracteres.'),
    description: z
      .string()
      .trim()
      .max(2000, 'Máximo 2000 caracteres.')
      .optional()
      .or(z.literal('')),
    requesterType: z.nativeEnum(TicketRequesterType),
    requesterRefId: z
      .string()
      .trim()
      .max(160, 'Máximo 160 caracteres.')
      .optional()
      .or(z.literal('')),
    subjectType: z.string().optional().default(''),
    subjectRefId: z.string().trim().max(160, 'Máximo 160 caracteres.').optional().or(z.literal('')),
    assignedUserId: z.string().optional().default(''),
    queueName: z.string().optional().default(''),
    fieldDecision: z.nativeEnum(TicketFieldDecision),
    followUpAction: z
      .enum(['ticket-only', 'schedule-now', 'send-to-pending'])
      .default('ticket-only'),
    slaPolicyId: z.string().optional().default(''),
  })
  .superRefine((values, context) => {
    if (values.requesterType === TicketRequesterType.SUBSCRIBER && !values.requesterRefId?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['requesterRefId'],
        message: 'Selecciona un suscriptor',
      });
    }
  });

type AssuranceTicketFormValues = z.infer<typeof assuranceTicketFormSchema>;

export type AssuranceTicketFollowUpAction = AssuranceTicketFormValues['followUpAction'];

export interface AssuranceCreateTicketSubmitPayload {
  ticket: CreateAssuranceTicketDto;
  followUpAction: AssuranceTicketFollowUpAction;
}

interface AssuranceCreateTicketFormProps {
  assignees: InternalUser[];
  slaPolicies: AssuranceSlaPolicy[];
  subscriber?: SearchablePickerItem | null;
  allowWfmFollowUp?: boolean;
  onSubmit: (payload: AssuranceCreateTicketSubmitPayload) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
  error: string | null;
}

function buildDefaultValues(subscriberId?: string): AssuranceTicketFormValues {
  return {
    type: TicketType.CUSTOMER_INCIDENT,
    priority: TicketPriority.NORMAL,
    source: TicketSource.PORTAL,
    subject: '',
    description: '',
    requesterType: TicketRequesterType.SUBSCRIBER,
    requesterRefId: subscriberId ?? '',
    subjectType: '',
    subjectRefId: '',
    assignedUserId: '',
    queueName: '',
    fieldDecision: TicketFieldDecision.NOT_REQUIRED,
    followUpAction: 'ticket-only',
    slaPolicyId: '',
  };
}

export function AssuranceCreateTicketForm({
  assignees,
  slaPolicies,
  subscriber = null,
  allowWfmFollowUp = false,
  onSubmit,
  onCancel,
  isSubmitting,
  error,
}: AssuranceCreateTicketFormProps) {
  const assigneeOptions = useMemo(
    () =>
      assignees.map((user) => ({
        value: user.id,
        label: getAssuranceUserDisplayName(user),
      })),
    [assignees],
  );

  const slaOptions = useMemo(
    () => slaPolicies.map((policy) => ({ value: policy.id, label: policy.name })),
    [slaPolicies],
  );

  const [selectedSubscriberItem, setSelectedSubscriberItem] = useState<Pick<
    SearchablePickerItem,
    'label' | 'sublabel'
  > | null>(null);

  const searchSubscribers = useCallback(async (query: string, signal: AbortSignal) => {
    const response = await subscribersApi.list({ search: query, page: 1, limit: 20 }, undefined, {
      signal,
    });

    return {
      items: response.data.map((item) => ({
        id: item.id,
        label: item.commercialName?.trim() || formatSubscriberName(item),
        sublabel: item.city?.trim() || item.email?.trim() || item.documentNumber?.trim() || null,
      })),
      total: response.total,
    };
  }, []);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    clearErrors,
    getValues,
    formState: { errors },
  } = useForm<AssuranceTicketFormValues>({
    resolver: zodResolver(assuranceTicketFormSchema),
    defaultValues: buildDefaultValues(subscriber?.id),
  });

  const requesterType = watch('requesterType');

  useEffect(() => {
    if (getValues('requesterType') === TicketRequesterType.SUBSCRIBER) {
      setValue('requesterRefId', subscriber?.id ?? '', { shouldValidate: true });
    }
    setSelectedSubscriberItem(null);
  }, [getValues, setValue, subscriber?.id]);

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={handleSubmit(async (values) => {
        // Normalizamos opcionales vacíos para que el backend reciba solo el contrato necesario.
        const payload: CreateAssuranceTicketDto = {
          type: values.type,
          priority: values.priority,
          source: values.source,
          subject: values.subject.trim(),
          requesterType: subscriber ? TicketRequesterType.SUBSCRIBER : values.requesterType,
          fieldDecision: values.fieldDecision,
        };

        if (values.description?.trim()) payload.description = values.description.trim();
        const requesterRefId =
          values.requesterType === TicketRequesterType.SUBSCRIBER
            ? (subscriber?.id ?? values.requesterRefId?.trim())
            : values.requesterRefId?.trim();
        if (requesterRefId) payload.requesterRefId = requesterRefId;
        if (values.subjectType)
          payload.subjectType = values.subjectType as CreateAssuranceTicketDto['subjectType'];
        if (values.subjectRefId?.trim()) payload.subjectRefId = values.subjectRefId.trim();
        if (values.assignedUserId) payload.assignedUserId = values.assignedUserId;
        if (values.queueName)
          payload.queueName = values.queueName as CreateAssuranceTicketDto['queueName'];
        if (values.slaPolicyId) payload.slaPolicyId = values.slaPolicyId;

        await onSubmit({
          ticket: payload,
          followUpAction: values.followUpAction,
        });
      })}
    >
      <FormStatus
        status={error ? 'error' : 'idle'}
        message={
          error ? (
            <>
              <span>No fue posible crear el ticket.</span> <span>{error}</span>
            </>
          ) : undefined
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Controller
          name="type"
          control={control}
          render={({ field }) => (
            <Select
              id="assurance-ticket-type"
              label="Tipo de ticket"
              value={field.value}
              options={ASSURANCE_TICKET_TYPE_OPTIONS}
              onChange={(event) => field.onChange(event.target.value)}
              error={errors.type?.message ?? ''}
            />
          )}
        />
        <Controller
          name="priority"
          control={control}
          render={({ field }) => (
            <Select
              id="assurance-ticket-priority"
              label="Prioridad"
              value={field.value}
              options={ASSURANCE_TICKET_PRIORITY_OPTIONS}
              onChange={(event) => field.onChange(event.target.value)}
              error={errors.priority?.message ?? ''}
            />
          )}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Controller
          name="requesterType"
          control={control}
          render={({ field }) => (
            <Select
              id="assurance-ticket-requester-type"
              label="Tipo de solicitante"
              value={field.value}
              options={ASSURANCE_REQUESTER_TYPE_OPTIONS}
              disabled={Boolean(subscriber)}
              onChange={(event) => {
                const nextType = event.target.value as TicketRequesterType;
                field.onChange(nextType);
                setValue(
                  'requesterRefId',
                  nextType === TicketRequesterType.SUBSCRIBER ? (subscriber?.id ?? '') : '',
                  { shouldDirty: true, shouldValidate: false },
                );
                setSelectedSubscriberItem(null);
                clearErrors('requesterRefId');
              }}
              error={errors.requesterType?.message ?? ''}
            />
          )}
        />
        {requesterType === TicketRequesterType.SUBSCRIBER ? (
          subscriber ? (
            <Input
              label="Suscriptor"
              value={subscriber.label}
              readOnly
              helperText={subscriber.sublabel ?? undefined}
            />
          ) : (
            <div className="space-y-1">
              <SearchablePicker
                id="assurance-ticket-subscriber"
                label="Suscriptor"
                resource={{ singular: 'suscriptor', plural: 'suscriptores' }}
                value={watch('requesterRefId') || null}
                selectedItem={selectedSubscriberItem}
                onChange={(item) => {
                  setValue('requesterRefId', item?.id ?? '', {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                  setSelectedSubscriberItem(item);
                }}
                onSearch={searchSubscribers}
                placeholder="Nombre, razón social o NIT"
                labels={{
                  empty: () => 'No hay suscriptores que coincidan',
                  error: () => 'No fue posible cargar suscriptores',
                }}
              />
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Busca y selecciona el suscriptor al que quedará vinculado este ticket
              </p>
              {errors.requesterRefId?.message && (
                <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                  {errors.requesterRefId.message}
                </p>
              )}
            </div>
          )
        ) : (
          <Input
            label="Referencia del solicitante"
            placeholder="Ej. subscriber-001"
            error={errors.requesterRefId?.message}
            {...register('requesterRefId')}
          />
        )}
      </div>

      <Input
        label="Asunto operativo"
        placeholder="Ej. Sin navegación en sede principal"
        error={errors.subject?.message}
        {...register('subject')}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Controller
          name="subjectType"
          control={control}
          render={({ field }) => (
            <Select
              id="assurance-ticket-subject-type"
              label="Objeto afectado"
              value={field.value}
              placeholder="Opcional"
              options={ASSURANCE_SUBJECT_TYPE_OPTIONS}
              onChange={(event) => field.onChange(event.target.value)}
              error={errors.subjectType?.message ?? ''}
            />
          )}
        />
        <Input
          label="Referencia del objeto"
          placeholder="Ej. service-001"
          error={errors.subjectRefId?.message}
          {...register('subjectRefId')}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Controller
          name="source"
          control={control}
          render={({ field }) => (
            <Select
              id="assurance-ticket-source"
              label="Origen"
              value={field.value}
              options={ASSURANCE_SOURCE_OPTIONS}
              onChange={(event) => field.onChange(event.target.value)}
              error={errors.source?.message ?? ''}
            />
          )}
        />
        <Controller
          name="fieldDecision"
          control={control}
          render={({ field }) => (
            <Select
              id="assurance-ticket-field-decision"
              label="Decisión de campo"
              value={field.value}
              options={ASSURANCE_FIELD_DECISION_OPTIONS}
              onChange={(event) => field.onChange(event.target.value)}
              error={errors.fieldDecision?.message ?? ''}
            />
          )}
        />
      </div>

      {watch('fieldDecision') === TicketFieldDecision.FIELD_SERVICE_REQUIRED &&
        allowWfmFollowUp && (
          <Controller
            name="followUpAction"
            control={control}
            render={({ field }) => (
              <Select
                id="assurance-follow-up-action"
                label="Siguiente paso"
                value={field.value}
                options={[
                  { value: 'schedule-now', label: 'Agendar ahora' },
                  { value: 'send-to-pending', label: 'Enviar a pendientes' },
                  { value: 'ticket-only', label: 'Crear ticket sin visita todavía' },
                ]}
                onChange={(event) => field.onChange(event.target.value)}
              />
            )}
          />
        )}

      <div>
        <label
          htmlFor="assurance-ticket-description"
          className="text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Descripción
        </label>
        <textarea
          id="assurance-ticket-description"
          className={assuranceTextareaClassName}
          placeholder="Describe el contexto operativo, pruebas realizadas o impacto conocido."
          {...register('description')}
        />
        {errors.description?.message && (
          <p className="mt-1 text-xs text-red-500">{errors.description.message}</p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Controller
          name="assignedUserId"
          control={control}
          render={({ field }) => (
            <Select
              id="assurance-ticket-assignee"
              label="Responsable"
              value={field.value}
              placeholder="Sin asignar"
              options={assigneeOptions}
              onChange={(event) => field.onChange(event.target.value)}
              error={errors.assignedUserId?.message ?? ''}
            />
          )}
        />
        <Controller
          name="queueName"
          control={control}
          render={({ field }) => (
            <Select
              id="assurance-ticket-queue"
              label="Cola funcional"
              value={field.value}
              placeholder="Sin cola"
              options={ASSURANCE_QUEUE_OPTIONS}
              onChange={(event) => field.onChange(event.target.value)}
              error={errors.queueName?.message ?? ''}
            />
          )}
        />
        <Controller
          name="slaPolicyId"
          control={control}
          render={({ field }) => (
            <Select
              id="assurance-ticket-sla-policy"
              label="Política SLA"
              value={field.value}
              placeholder={slaOptions.length ? 'Usar default' : 'No disponible'}
              options={slaOptions}
              onChange={(event) => field.onChange(event.target.value)}
              disabled={slaOptions.length === 0}
              error={errors.slaPolicyId?.message ?? ''}
            />
          )}
        />
      </div>

      <div className="flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-4 dark:border-dark-border">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Crear ticket
        </Button>
      </div>
    </form>
  );
}
