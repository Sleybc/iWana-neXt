import Link from 'next/link';
import { useId } from 'react';
import { Badge, Button, ProgressMeter, SkeletonBlock } from '@iwana/ui';
import { ExecutionOrderStatus } from '@iwana/shared';
import type { ExecutionOrderDetailResponse, ExecutionOrderRecord } from '@/lib/api-client';
import {
  EXECUTION_ORDER_RESULT_LABELS,
  EXECUTION_ORDER_RESULT_VARIANTS,
  EXECUTION_ORDER_STATUS_LABELS,
  EXECUTION_ORDER_STATUS_VARIANTS,
  EXECUTION_ORDER_WORK_TYPE_LABELS,
} from './operations-labels';
import {
  PortalAlert,
  PortalEmptyState,
  portalPanelDenseActionClassName,
} from '@/components/shared/portal-ui';
import {
  executionOrderSourceTicketHref,
  executionOrderSubscriberHref,
  executionOrderVisitHref,
} from './execution-order-links';
import { getExecutionOrderCompletionDisplay } from './execution-order-view';
import { getExecutionOrderWindowAbsence } from './execution-order-window-copy';

type SummaryOrder = ExecutionOrderDetailResponse | ExecutionOrderRecord;
export type ExecutionOrderAvailability = 'linked' | 'unlinked' | 'unavailable';
export type { ExecutionOrderSyncState } from './execution-order-sync-copy';
import {
  syncCopy,
  toSummarySyncState,
  type ExecutionOrderSyncState,
} from './execution-order-sync-copy';

/** `console`: cabecera compacta de la consola; el número ya va en el título del panel. */
export type ExecutionOrderSummaryVariant = 'full' | 'agenda-compact' | 'console';

export interface ExecutionOrderSummaryProps {
  order: SummaryOrder | null;
  loading?: boolean;
  error?: string | null;
  successMessage?: string | null;
  availability?: ExecutionOrderAvailability;
  syncState?: ExecutionOrderSyncState | undefined;
  readonly?: boolean;
  canOpen?: boolean;
  variant?: ExecutionOrderSummaryVariant;
  hideProgress?: boolean;
  onOpen?: () => void;
  onRefreshDetail?: () => void | Promise<void>;
  onRetry?: () => void;
}

function isDetail(order: SummaryOrder): order is ExecutionOrderDetailResponse {
  return 'number' in order;
}

function detailSyncState(order: SummaryOrder): ExecutionOrderSyncState | undefined {
  if (!isDetail(order)) return 'synced';

  return toSummarySyncState(order.syncState);
}

export function ExecutionOrderSummary({
  order,
  availability = 'linked',
  syncState,
  readonly = true,
  canOpen = true,
  variant = 'full',
  hideProgress = false,
  onOpen,
  onRefreshDetail,
  loading = false,
  error = null,
  successMessage = null,
  onRetry,
}: ExecutionOrderSummaryProps) {
  const windowHelpId = useId();
  if (loading) {
    return (
      <section
        aria-label="Cargando resumen de la orden de trabajo"
        aria-busy="true"
        className="space-y-3"
      >
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
            {...(syncState !== undefined ? { syncState } : {})}
            readonly={readonly}
            canOpen={canOpen}
            variant={variant}
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
        title="Visita sin orden vinculada"
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
          onRetry ? (
            <Button onClick={onRetry}>Reintentar</Button>
          ) : onRefreshDetail ? (
            <Button type="button" onClick={() => void onRefreshDetail()}>
              Actualizar detalle
            </Button>
          ) : canOpen && onOpen ? (
            <Button type="button" variant="secondary" onClick={onOpen}>
              Abrir orden de trabajo
            </Button>
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
    : order.plannedWindowStartAt && order.plannedWindowEndAt
      ? { startAt: order.plannedWindowStartAt, endAt: order.plannedWindowEndAt }
      : null;
  const windowAbsence = getExecutionOrderWindowAbsence(status);
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
  const resolvedSyncState = syncState ?? detailSyncState(order);

  const isAgendaCompact = variant === 'agenda-compact';
  const isConsole = variant === 'console';
  // P2 (spec §3 G–H): cliente y enlaces solo en la consola y solo si el campo
  // llega; nunca se sustituye el cliente por el sitio ni por otra etiqueta.
  const subscriber = isConsole && isDetail(order) ? (order.subscriber ?? null) : null;
  const subscriberName = subscriber?.displayName?.trim() || null;
  const subscriberHref = executionOrderSubscriberHref(subscriber);
  const serviceAddress = subscriber
    ? [subscriber.serviceAddress?.trim(), subscriber.municipality?.trim()]
        .filter((part): part is string => Boolean(part))
        .join(', ') || null
    : null;
  const ticket = isConsole && isDetail(order) ? (order.sourceTicket ?? null) : null;
  const ticketHref = executionOrderSourceTicketHref(ticket);
  const visitHref =
    isConsole && isDetail(order)
      ? executionOrderVisitHref(order.visit ?? null, order.schedule.window?.startAt)
      : null;
  const windowText = window
    ? `${dateFormatter.format(new Date(window.startAt))} – ${dateFormatter.format(new Date(window.endAt))}`
    : windowAbsence.label;

  return (
    <section
      aria-label="Resumen de la orden de trabajo"
      className={isConsole ? 'space-y-2' : 'space-y-4'}
    >
      <div className="flex flex-wrap items-center gap-2">
        {isConsole ? null : (
          <Badge variant="neutral">
            <span className="font-mono">{number}</span>
          </Badge>
        )}
        <Badge variant="primary">{workType}</Badge>
        <Badge variant={EXECUTION_ORDER_STATUS_VARIANTS[status]}>
          {EXECUTION_ORDER_STATUS_LABELS[status]}
        </Badge>
        {result ? (
          <Badge variant={EXECUTION_ORDER_RESULT_VARIANTS[result]}>
            {EXECUTION_ORDER_RESULT_LABELS[result]}
          </Badge>
        ) : null}
        {ticketHref || visitHref ? (
          <span className="ml-auto flex flex-wrap items-center gap-x-4">
            {ticketHref && ticket ? (
              <Link href={ticketHref} className={portalPanelDenseActionClassName}>
                Ticket {ticket.number}
              </Link>
            ) : null}
            {visitHref ? (
              <Link href={visitHref} className={portalPanelDenseActionClassName}>
                Ver visita en la agenda
              </Link>
            ) : null}
          </span>
        ) : null}
      </div>
      {isConsole ? (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          {subscriber ? (
            <>
              <div className="flex min-w-0 gap-2">
                <dt className="shrink-0 text-gray-500 dark:text-gray-400">Cliente</dt>
                <dd className="min-w-0 truncate text-gray-900 dark:text-white">
                  {subscriberHref ? (
                    <Link href={subscriberHref} className={portalPanelDenseActionClassName}>
                      {subscriberName ?? 'Ver ficha del suscriptor'}
                    </Link>
                  ) : (
                    (subscriberName ?? 'Sin nombre disponible')
                  )}
                </dd>
              </div>
              {serviceAddress ? (
                <div className="flex min-w-0 gap-2">
                  <dt className="shrink-0 text-gray-500 dark:text-gray-400">Dirección</dt>
                  <dd
                    className="min-w-0 truncate text-gray-900 dark:text-white"
                    title={serviceAddress}
                  >
                    {serviceAddress}
                  </dd>
                </div>
              ) : null}
            </>
          ) : null}
          {[
            { term: 'Sitio', value: site ?? 'Sitio autorizado' },
            {
              term: 'Ventana planificada',
              value: windowText,
              help: !window ? windowAbsence.help : undefined,
            },
            { term: 'Responsable', value: assignee ?? 'Sin responsable asignado' },
            { term: 'Plantilla', value: template },
          ].map((entry) => (
            <div key={entry.term} className="flex min-w-0 flex-wrap gap-x-2">
              <dt className="shrink-0 text-gray-500 dark:text-gray-400">{entry.term}</dt>
              <dd
                className="min-w-0 truncate text-gray-900 dark:text-white"
                title={entry.help ?? entry.value}
                aria-describedby={entry.help ? windowHelpId : undefined}
              >
                {entry.value}
              </dd>
              {entry.help ? (
                <p
                  id={windowHelpId}
                  className="basis-full text-xs text-gray-500 dark:text-gray-400"
                >
                  {entry.help}
                </p>
              ) : null}
            </div>
          ))}
        </dl>
      ) : isAgendaCompact ? (
        <div className="rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 text-sm dark:border-dark-border dark:bg-dark-surface-3">
          <p className="portal-eyebrow-muted">Plantilla</p>
          <p className="mt-1 text-gray-700 dark:text-gray-200">{template}</p>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Ventana, sitio y responsable se coordinan en Contexto operativo arriba.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 text-sm dark:border-dark-border dark:bg-dark-surface-3 md:grid-cols-2">
          <div>
            <p className="portal-eyebrow-muted">Sitio</p>
            <p className="mt-1 font-medium text-gray-900 dark:text-white">
              {site ?? 'Sitio autorizado'}
            </p>
          </div>
          <div>
            <p className="portal-eyebrow-muted">Ventana planificada</p>
            <p className="mt-1 text-gray-700 dark:text-gray-200">
              {window ? (
                <>
                  {dateFormatter.format(new Date(window.startAt))} –{' '}
                  {dateFormatter.format(new Date(window.endAt))}
                </>
              ) : (
                windowAbsence.label
              )}
            </p>
            {!window && windowAbsence.help ? (
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{windowAbsence.help}</p>
            ) : null}
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
      )}
      {!hideProgress && (
        <>
          <ProgressMeter
            value={completion.value}
            label="Requisitos de instalación"
            ariaLabel="Avance de requisitos de instalación"
          />
          <p className="text-sm text-gray-700 dark:text-gray-200">
            {completion.label} requisitos completados
          </p>
        </>
      )}
      <p role="status" className="text-xs text-gray-500 dark:text-gray-400">
        {syncCopy(resolvedSyncState)}
      </p>
      {canOpen && onOpen ? (
        <Button type="button" variant="secondary" onClick={onOpen}>
          Abrir orden de trabajo
        </Button>
      ) : null}
    </section>
  );
}
