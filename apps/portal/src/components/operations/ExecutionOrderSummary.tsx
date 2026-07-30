import { Badge, Button, ProgressMeter, SkeletonBlock } from '@iwana/ui';
import type { ExecutionOrderDetail } from '@iwana/shared';
import { ExecutionOrderStatus } from '@iwana/shared';
import type { ExecutionOrderRecord } from '@/lib/api-client';
import {
  EXECUTION_ORDER_RESULT_LABELS,
  EXECUTION_ORDER_RESULT_VARIANTS,
  EXECUTION_ORDER_STATUS_LABELS,
  EXECUTION_ORDER_STATUS_VARIANTS,
  EXECUTION_ORDER_WORK_TYPE_LABELS,
} from './operations-labels';
import { PortalAlert, PortalEmptyState } from '@/components/shared/portal-ui';
import { getExecutionOrderCompletionDisplay } from './execution-order-view';

type SummaryOrder = ExecutionOrderDetail | ExecutionOrderRecord;
export type ExecutionOrderAvailability = 'linked' | 'unlinked' | 'unavailable';
export type ExecutionOrderSyncState = 'synced' | 'pending' | 'error' | 'stale' | 'conflict';

export interface ExecutionOrderSummaryProps {
  order: SummaryOrder | null;
  loading?: boolean;
  error?: string | null;
  successMessage?: string | null;
  availability?: ExecutionOrderAvailability;
  syncState?: ExecutionOrderSyncState;
  readonly?: boolean;
  canOpen?: boolean;
  onOpen?: () => void;
  onRefreshDetail?: () => void | Promise<void>;
  onRetry?: () => void;
}

function isDetail(order: SummaryOrder): order is ExecutionOrderDetail {
  return 'number' in order;
}

function syncCopy(state: ExecutionOrderSyncState): string {
  switch (state) {
    case 'pending':
      return 'Sincronización pendiente';
    case 'error':
      return 'No pudimos sincronizar la orden';
    case 'stale':
      return 'Actualización pendiente';
    case 'conflict':
      return 'La orden cambió; revisa la versión vigente';
    default:
      return 'Sincronizada';
  }
}

export function ExecutionOrderSummary({
  order,
  availability = 'linked',
  syncState = 'synced',
  readonly = true,
  canOpen = true,
  onOpen,
  onRefreshDetail,
  loading = false,
  error = null,
  successMessage = null,
  onRetry,
}: ExecutionOrderSummaryProps) {
  if (loading) {
    return (
      <section aria-label="Cargando resumen de la OT" aria-busy="true" className="space-y-3">
        <SkeletonBlock className="h-7 w-2/3" />
        <SkeletonBlock className="h-28 w-full" />
        <SkeletonBlock className="h-5 w-full" />
      </section>
    );
  }

  if (error) {
    return (
      <PortalAlert
        variant="error"
        title="No fue posible cargar el resumen"
        description={error}
        live="assertive"
        action={onRetry ? <Button onClick={onRetry}>Reintentar</Button> : undefined}
      />
    );
  }

  if (successMessage) {
    return (
      <div className="space-y-4">
        <PortalAlert variant="success" title="Operación completada" description={successMessage} />
        {order ? (
          <ExecutionOrderSummary
            order={order}
            availability={availability}
            syncState={syncState}
            readonly={readonly}
            canOpen={canOpen}
            {...(onOpen ? { onOpen } : {})}
          />
        ) : null}
      </div>
    );
  }

  if (availability === 'unlinked') {
    return (
      <PortalAlert
        variant="warning"
        live="assertive"
        title="Visita sin OT vinculada"
        description={
          onRefreshDetail
            ? 'La visita todavía no tiene una orden de trabajo asociada. Actualiza el detalle para consultar el vínculo más reciente.'
            : 'La visita todavía no tiene una orden de trabajo asociada. No hay una acción para actualizar el detalle disponible en este momento.'
        }
        action={
          onRefreshDetail ? (
            <Button type="button" onClick={() => void onRefreshDetail()}>
              Actualizar detalle
            </Button>
          ) : undefined
        }
      />
    );
  }
  if (availability === 'unavailable') {
    return (
      <PortalAlert
        variant="error"
        title="Orden no disponible"
        description={
          onRetry
            ? 'No fue posible consultar la orden de trabajo. Intenta de nuevo más tarde.'
            : 'No fue posible consultar la orden de trabajo. La información estará disponible cuando se actualice el detalle.'
        }
        action={
          canOpen && onOpen ? (
            <Button type="button" variant="secondary" onClick={onOpen}>
              Abrir OT
            </Button>
          ) : onRetry ? (
            <Button onClick={onRetry}>Reintentar</Button>
          ) : undefined
        }
      />
    );
  }
  if (!order) {
    return (
      <PortalEmptyState
        title="Aún no hay una orden de trabajo"
        description="La visita todavía no tiene una orden de trabajo asociada."
      />
    );
  }

  const number = isDetail(order) ? order.number : order.executionOrderNumber;
  const status = order.status;
  const result = order.result;
  const workType = EXECUTION_ORDER_WORK_TYPE_LABELS[order.workType] ?? 'Trabajo operativo';
  const window = isDetail(order)
    ? order.schedule.window
    : { startAt: order.plannedWindowStartAt, endAt: order.plannedWindowEndAt };
  const site = isDetail(order)
    ? order.site.label || order.site.address
    : order.customerDisplayLabel;
  const assignee = isDetail(order)
    ? order.assignee?.displayLabel
    : order.assignedTechnicianId
      ? 'Responsable asignado'
      : undefined;
  const completion = isDetail(order)
    ? getExecutionOrderCompletionDisplay(order.completion)
    : status === ExecutionOrderStatus.COMPLETED ||
        status === ExecutionOrderStatus.COMPLETED_WITH_OBSERVATIONS
      ? { value: 100, label: '100%', isComplete: true }
      : { value: 0, label: '0%', isComplete: false };
  const template = isDetail(order)
    ? order.template
      ? `${order.template.label} · v${order.template.version}`
      : 'Plantilla no disponible'
    : 'Plantilla de instalación aplicada';
  const dateFormatter = new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <section aria-label="Resumen de la OT" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="neutral">
          <span className="font-mono">{number}</span>
        </Badge>
        <Badge variant="primary">{workType}</Badge>
        <Badge variant={EXECUTION_ORDER_STATUS_VARIANTS[status]}>
          {EXECUTION_ORDER_STATUS_LABELS[status]}
        </Badge>
        {result ? (
          <Badge variant={EXECUTION_ORDER_RESULT_VARIANTS[result]}>
            {EXECUTION_ORDER_RESULT_LABELS[result]}
          </Badge>
        ) : null}
      </div>
      <div className="grid gap-3 rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 text-sm dark:border-dark-border dark:bg-dark-surface-3 md:grid-cols-2">
        <div>
          <p className="portal-eyebrow-muted">Sitio</p>
          <p className="mt-1 font-medium text-gray-900 dark:text-white">
            {site ?? 'Sitio autorizado'}
          </p>
        </div>
        <div>
          <p className="portal-eyebrow-muted">Ventana</p>
          <p className="mt-1 text-gray-700 dark:text-gray-200">
            {dateFormatter.format(new Date(window.startAt))} –{' '}
            {dateFormatter.format(new Date(window.endAt))}
          </p>
        </div>
        <div>
          <p className="portal-eyebrow-muted">Responsable</p>
          <p className="mt-1 text-gray-700 dark:text-gray-200">
            {assignee ?? 'Sin responsable asignado'}
          </p>
        </div>
        <div>
          <p className="portal-eyebrow-muted">Plantilla</p>
          <p className="mt-1 text-gray-700 dark:text-gray-200">{template}</p>
        </div>
      </div>
      <ProgressMeter
        value={completion.value}
        label="Requisitos de instalación"
        ariaLabel="Avance de requisitos de instalación"
      />
      <p className="text-sm text-gray-700 dark:text-gray-200">
        {completion.label} requisitos completados
      </p>
      <p role="status" className="text-xs text-gray-500 dark:text-gray-400">
        {syncCopy(syncState)}
      </p>
      {canOpen && onOpen ? (
        <Button type="button" variant="secondary" onClick={onOpen}>
          Abrir OT
        </Button>
      ) : null}
    </section>
  );
}
