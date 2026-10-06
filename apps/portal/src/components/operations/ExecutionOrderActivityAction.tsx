'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { ExecutionOrderActivity, RegisterActivityCommand } from '@iwana/shared';
import { Button, Input, Select } from '@iwana/ui';
import { PortalEmptyState, PortalTablePagination } from '@/components/shared/portal-ui';
import { collectionCountLabel } from './execution-order-collections';
import { canInteract } from './execution-order-moment';
import type {
  ExecutionOrderCaptureSlotProps,
  ExecutionOrderHistorySlotProps,
} from './execution-order-slots';
import { formatTaskDateTime } from './operations-labels';

// B0 — acción ACTIVITY completa (encargo §2.4): variante `activity` de la hoja
// con `activityType` preseleccionado desde el requisito y su historial bajo el
// mismo requisito. Archivo propiedad de B0 (ningún otro bloque lo posee).

const ACTIVITY_TYPE_OPTIONS = [
  { value: 'INSTALLATION', label: 'Instalación' },
  { value: 'FIELD_NOTE', label: 'Nota de campo' },
  { value: 'CONFIGURATION', label: 'Configuración' },
  { value: 'TESTING', label: 'Prueba' },
  { value: 'NOVELTY', label: 'Novedad' },
];

function activityTypeLabel(activityType: string): string {
  return (
    ACTIVITY_TYPE_OPTIONS.find((option) => option.value === activityType)?.label ??
    'Actividad de campo'
  );
}

function measurementLabel(value: number | string | boolean, unit?: string): string {
  return `Medición registrada: ${String(value)}${unit ? ` ${unit}` : ''}`;
}

const NOVELTY_MEASUREMENT = [{ key: 'novedad', value: true }];

/** Captura inline: el tipo nace del requisito y no es editable. */
export function ExecutionOrderActivityAction({
  requirement,
  context,
  bindSubmit,
  onClose,
}: ExecutionOrderCaptureSlotProps<'ACTIVITY', 'activity'>) {
  const { isSubmitting, onRegisterActivity } = context;
  const [description, setDescription] = useState('');
  const [novelty, setNovelty] = useState(false);

  async function submit() {
    if (!description.trim()) return;
    const payload: RegisterActivityCommand = {
      activityType: requirement.activityType,
      description: description.trim(),
    };
    if (novelty) payload.measurements = [...NOVELTY_MEASUREMENT];
    const result = await onRegisterActivity(payload);
    if (result === false) return;
    setDescription('');
    setNovelty(false);
    onClose();
  }

  useEffect(() => {
    bindSubmit(submit);
    return () => bindSubmit(null);
  });

  return (
    <form
      data-requirement-submit
      className="mt-4 space-y-3 rounded-xl border border-dashed border-gray-300 p-3 dark:border-dark-border"
    >
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
        Registrar nueva actividad
      </p>
      <Select
        id={`eo-activity-type-${requirement.key}-capture`}
        label="Tipo de actividad"
        value={requirement.activityType}
        options={ACTIVITY_TYPE_OPTIONS}
        disabled
        onChange={() => undefined}
      />
      <Input
        id={`eo-activity-description-${requirement.key}-capture`}
        label="Descripción de la actividad"
        value={description}
        disabled={isSubmitting}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Describe el trabajo realizado..."
      />
      <Button
        type="button"
        variant={novelty ? 'secondary' : 'ghost'}
        aria-pressed={novelty}
        disabled={isSubmitting}
        onClick={() => setNovelty((current) => !current)}
      >
        Marcar como novedad
      </Button>
      <div className="flex gap-2">
        <Button
          type="submit"
          variant="primary"
          disabled={isSubmitting || description.trim().length === 0}
        >
          Registrar actividad
        </Button>
      </div>
    </form>
  );
}

/** Historial de actividades del requisito, con modificar y eliminar cuando el momento lo admite. */
export function ExecutionOrderActivityHistory({
  order,
  requirement,
  context,
}: ExecutionOrderHistorySlotProps<'ACTIVITY'>) {
  const {
    activities,
    activitiesMeta,
    isLoadingMoreActivities,
    onLoadMoreActivities,
    isSubmitting,
    offline,
    onUpdateActivity,
    onDeleteActivity,
  } = context;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editType, setEditType] = useState('INSTALLATION');
  const [editDescription, setEditDescription] = useState('');
  const [editNovelty, setEditNovelty] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const requirementActivities = activities.filter(
    (activity) => activity.activityType === requirement.activityType,
  );
  const canModify =
    canInteract(order, offline) &&
    order.allowedActions?.includes('REGISTER_ACTIVITY') === true &&
    Boolean(onUpdateActivity || onDeleteActivity);

  function startEdit(activity: ExecutionOrderActivity) {
    setEditingId(activity.id);
    setEditType(activity.activityType);
    setEditDescription(activity.description);
    setEditNovelty(
      Boolean(activity.measurements?.some((m) => m.key === 'novedad' && m.value === true)),
    );
    setDeletingId(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDescription('');
    setEditNovelty(false);
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingId || !editDescription.trim() || !onUpdateActivity) return;
    const payload: Partial<RegisterActivityCommand> = {
      activityType: editType,
      description: editDescription.trim(),
    };
    // measurements simplificado: si marca novedad, enviarla; si no, omitir.
    if (editNovelty) payload.measurements = [...NOVELTY_MEASUREMENT];
    const result = await onUpdateActivity(editingId, payload);
    if (result === false) return;
    setEditingId(null);
  }

  async function confirmDelete(activityId: string) {
    if (!onDeleteActivity) return;
    const result = await onDeleteActivity(activityId);
    if (result === false) return;
    setDeletingId(null);
    if (editingId === activityId) setEditingId(null);
  }

  return (
    <section aria-label="Trabajo realizado" className="space-y-3">
      <h3
        id={`eo-work-heading-${requirement.key}-history`}
        className="text-sm font-semibold text-gray-900 dark:text-white"
      >
        Trabajo realizado
      </h3>
      <div className="mt-3 space-y-2">
        {activitiesMeta && activitiesMeta.total > 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400" role="status">
            {collectionCountLabel(
              requirementActivities.length,
              activitiesMeta.total,
              'actividades',
            )}
          </p>
        ) : null}
        {requirementActivities.length === 0 ? (
          <PortalEmptyState
            title="Todavía no hay actividades registradas"
            description="Registra el trabajo realizado para conservar la trazabilidad de la ejecución."
          />
        ) : (
          requirementActivities.map((activity) => {
            const isEditing = editingId === activity.id;
            const isDeleting = deletingId === activity.id;
            return (
              <article
                key={activity.id}
                className="rounded-xl border border-gray-200 p-3 dark:border-dark-border"
              >
                {isEditing ? (
                  <form onSubmit={saveEdit} className="space-y-3">
                    <Select
                      id={`eo-edit-activity-type-${activity.id}`}
                      label="Tipo de actividad"
                      value={editType}
                      options={ACTIVITY_TYPE_OPTIONS}
                      disabled={isSubmitting}
                      onChange={(event) => setEditType(event.target.value)}
                    />
                    <Input
                      id={`eo-edit-activity-description-${activity.id}`}
                      label="Descripción"
                      value={editDescription}
                      disabled={isSubmitting}
                      onChange={(event) => setEditDescription(event.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={editNovelty ? 'secondary' : 'ghost'}
                        aria-pressed={editNovelty}
                        disabled={isSubmitting}
                        onClick={() => setEditNovelty((current) => !current)}
                      >
                        Marcar como novedad
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="submit"
                        variant="primary"
                        disabled={isSubmitting || editDescription.trim().length === 0}
                      >
                        Guardar
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={isSubmitting}
                        onClick={cancelEdit}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {activityTypeLabel(activity.activityType)}
                      </p>
                      <span className="shrink-0 font-mono text-xs text-gray-500 dark:text-gray-400">
                        {formatTaskDateTime(activity.occurredAt ?? activity.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">
                      {activity.description}
                    </p>
                    {activity.measurements && activity.measurements.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-2">
                        {activity.measurements.map((measurement, index) => (
                          <span
                            key={index}
                            className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-dark-surface-3 dark:text-gray-400"
                          >
                            {measurementLabel(measurement.value, measurement.unit)}
                          </span>
                        ))}
                      </div>
                    )}
                    {canModify && (
                      <div className="mt-2 flex gap-2">
                        {onUpdateActivity && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={isSubmitting}
                            onClick={() => startEdit(activity)}
                          >
                            Modificar
                          </Button>
                        )}
                        {onDeleteActivity && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={isSubmitting}
                            onClick={() => setDeletingId(activity.id)}
                          >
                            Eliminar
                          </Button>
                        )}
                      </div>
                    )}
                    {isDeleting && (
                      <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
                        <p className="text-sm text-red-800 dark:text-red-200">
                          ¿Eliminar este trabajo realizado? Esta acción no se puede deshacer.
                        </p>
                        <div className="mt-2 flex gap-2">
                          <Button
                            type="button"
                            variant="softDestructive"
                            size="sm"
                            disabled={isSubmitting}
                            onClick={() => void confirmDelete(activity.id)}
                          >
                            Confirmar
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={isSubmitting}
                            onClick={() => setDeletingId(null)}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </article>
            );
          })
        )}
        <PortalTablePagination
          hasMore={activitiesMeta?.hasMore === true}
          onLoadMore={() => void onLoadMoreActivities()}
          loading={isLoadingMoreActivities}
          resourceLabel="actividades"
          shown={requirementActivities.length}
          total={activitiesMeta?.total}
        />
      </div>
    </section>
  );
}
