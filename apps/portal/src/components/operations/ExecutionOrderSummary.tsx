import { Badge, Button, ProgressMeter } from '@iwana/ui';
import type { ExecutionOrderDetail } from '@iwana/shared';
import { ExecutionOrderStatus } from '@iwana/shared';
import type { ExecutionOrderRecord } from '@/lib/api-client';
import {
  EXECUTION_ORDER_RESULT_LABELS,
  EXECUTION_ORDER_STATUS_LABELS,
  EXECUTION_ORDER_STATUS_VARIANTS,
  EXECUTION_ORDER_WORK_TYPE_LABELS,
} from './operations-labels';

type SummaryOrder = ExecutionOrderDetail | ExecutionOrderRecord;
export type ExecutionOrderAvailability = 'linked' | 'unlinked' | 'unavailable';
export type ExecutionOrderSyncState = 'synced' | 'pending' | 'error' | 'stale' | 'conflict';

export interface ExecutionOrderSummaryProps {
  order: SummaryOrder | null;
  availability?: ExecutionOrderAvailability;
  syncState?: ExecutionOrderSyncState;
  readonly?: boolean;
  canOpen?: boolean;
  onOpen?: () => void;
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
}: ExecutionOrderSummaryProps) {
  if (availability === 'unlinked') {
    return (
      <p className="text-sm text-gray-600 dark:text-gray-300">
        No hay una OT de ejecución vinculada.
      </p>
    );
  }
  if (availability === 'unavailable' || !order) {
    return (
      <p className="text-sm text-gray-600 dark:text-gray-300">
        La OT de ejecución no está disponible.
      </p>
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
  const progress = isDetail(order)
    ? order.completion.progress
    : status === ExecutionOrderStatus.COMPLETED ||
        status === ExecutionOrderStatus.COMPLETED_WITH_OBSERVATIONS
      ? 100
      : 0;
  const template = isDetail(order)
    ? `${order.template.label} · v${order.template.version}`
    : 'Plantilla de instalación aplicada';
  const dateFormatter = new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <section aria-label="Resumen de la OT de ejecución" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="neutral">
          <span className="font-mono">{number}</span>
        </Badge>
        <Badge variant="primary">{workType}</Badge>
        <Badge variant={EXECUTION_ORDER_STATUS_VARIANTS[status]}>
          {EXECUTION_ORDER_STATUS_LABELS[status]}
        </Badge>
        {result ? <Badge variant="neutral">{EXECUTION_ORDER_RESULT_LABELS[result]}</Badge> : null}
      </div>
      <div className="grid gap-3 rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 text-sm dark:border-dark-border dark:bg-dark-surface-3 md:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Sitio</p>
          <p className="mt-1 font-medium text-gray-900 dark:text-white">
            {site ?? 'Sitio autorizado'}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Ventana</p>
          <p className="mt-1 text-gray-700 dark:text-gray-200">
            {dateFormatter.format(new Date(window.startAt))} –{' '}
            {dateFormatter.format(new Date(window.endAt))}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
            Responsable
          </p>
          <p className="mt-1 text-gray-700 dark:text-gray-200">
            {assignee ?? 'Sin responsable asignado'}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
            Plantilla
          </p>
          <p className="mt-1 text-gray-700 dark:text-gray-200">{template}</p>
        </div>
      </div>
      <ProgressMeter
        value={progress}
        label="Requisitos de instalación"
        ariaLabel="Avance de requisitos de instalación"
      />
      <p role="status" className="text-xs text-gray-500 dark:text-gray-400">
        {syncCopy(syncState)}
      </p>
      {!readonly && canOpen && onOpen ? (
        <Button type="button" variant="secondary" onClick={onOpen}>
          Abrir OT de ejecución
        </Button>
      ) : canOpen && onOpen ? (
        <Button type="button" variant="secondary" onClick={onOpen}>
          Abrir OT de ejecución
        </Button>
      ) : null}
    </section>
  );
}
