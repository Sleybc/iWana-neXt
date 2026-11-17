'use client';

import { type ReactNode } from 'react';
import { Badge, Button, cn } from '@iwana/ui';
import {
  ArrowRightLeft,
  ChevronDown,
  Edit,
  FileText,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  PortalAlert,
  PortalEmptyState,
  PortalFilterChip,
  PortalPageSizeSelect,
  PortalSkeletonBlock,
  PortalTablePager,
  interactiveFocusClassName,
} from '@/components/shared/portal-ui';
import { getPortalUserRoleLabel } from '@/lib/user-labels';
import type {
  ExpedienteContactTimelineEvent,
  ExpedienteSystemTimelineEvent,
  ExpedienteTimelineEvent,
} from '@/lib/api-client';
import {
  formatAcquisitionChannel,
  formatExpedienteStatus,
  getContactChannelBadgeVariant,
  getContactResultBadgeVariant,
  getExpedienteTimelineKindMeta,
  getStatusBadgeVariant,
} from './expediente-ui';

export type TimelineKind = 'contact' | 'responsibility' | 'attribution' | 'system' | 'pipeline';
export type TimelineFilter = 'all' | 'contact' | 'asignaciones' | 'pipeline' | 'system';
export type TimelinePageSize = 5 | 10 | 20 | 50;

// 10 por página: con filas compactas caben sin desplazar la pantalla (antes 5 en tarjetas).
export const TIMELINE_DEFAULT_PAGE_SIZE: TimelinePageSize = 10;
export const TIMELINE_PAGE_SIZE_OPTIONS: TimelinePageSize[] = [5, 10, 20, 50];
export const TIMELINE_MAX_EVENTS = 500;

const TIMELINE_RESOURCE = { singular: 'evento', plural: 'eventos' } as const;

export interface TimelineEntry {
  id: string;
  kind: TimelineKind;
  sortAt: Date;
  data: ExpedienteTimelineEvent;
}

function getTimelineEventDate(event: ExpedienteTimelineEvent): string {
  switch (event.kind) {
    case 'contact':
      return event.attemptedAt;
    case 'responsibility':
      return event.changedAt;
    case 'attribution':
      return event.attributedAt;
    case 'pipeline':
      return event.changedAt;
    case 'system':
      return event.occurredAt;
  }
}

export function toTimelineEntry(event: ExpedienteTimelineEvent): TimelineEntry {
  return {
    id: `${event.kind}:${event.id}`,
    kind: event.kind,
    sortAt: new Date(getTimelineEventDate(event)),
    data: event,
  };
}

export function dedupeTimelineEvents(events: ExpedienteTimelineEvent[]): ExpedienteTimelineEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = `${event.kind}:${event.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

interface ExpedienteTimelinePanelProps {
  loadingTimeline: boolean;
  timelineError: string | null;
  onRetryTimeline: () => void;
  timelineEntries: TimelineEntry[];
  timelineTotal: number;
  activeFilter: TimelineFilter;
  onActiveFilterChange: (filter: TimelineFilter) => void;
  timelinePageSize: TimelinePageSize;
  onTimelinePageSizeChange: (size: TimelinePageSize) => void;
  isHistoryExpanded: boolean;
  onHistoryExpandedChange: (expanded: boolean) => void;
  timelinePage: number;
  timelineTotalPages: number;
  onTimelinePageChange: (page: number) => void;
}

function ChannelIcon({ channel, className }: { channel: string; className?: string }) {
  const cls = className ?? 'h-4 w-4';
  switch (channel) {
    case 'EMAIL':
      return <Mail className={cls} aria-hidden="true" />;
    case 'WHATSAPP':
      return <MessageCircle className={cls} aria-hidden="true" />;
    case 'SMS':
      return <MessageSquare className={cls} aria-hidden="true" />;
    case 'PRESENCIAL':
      return <Users className={cls} aria-hidden="true" />;
    default:
      return <Phone className={cls} aria-hidden="true" />;
  }
}

function ContactEntry({ attempt }: { attempt: ExpedienteContactTimelineEvent }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={getContactChannelBadgeVariant(attempt.channel)}>{attempt.channel}</Badge>
        <Badge variant={getContactResultBadgeVariant(attempt.result)}>{attempt.result}</Badge>
        {attempt.durationMinutes && (
          <span className="text-[10px] text-gray-400 dark:text-gray-400">
            {attempt.durationMinutes} min
          </span>
        )}
      </div>
      {attempt.notes && (
        <p className="mt-1.5 text-xs text-gray-600 dark:text-gray-300">{attempt.notes}</p>
      )}
      {attempt.actor.name && (
        <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-400">
          por {attempt.actor.name}
        </p>
      )}
    </div>
  );
}

function ResponsibilityEntry({
  item,
}: {
  item: Extract<ExpedienteTimelineEvent, { kind: 'responsibility' }>;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-900 dark:text-white">
        {item.newResponsible.name || 'Usuario asignado'}
      </p>
      {item.newResponsible.role && (
        <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
          Nuevo rol: {getPortalUserRoleLabel(item.newResponsible.role)}
        </p>
      )}
      {item.previousResponsible && (
        <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-400">
          Anterior: {item.previousResponsible.name || 'Sin nombre'}
        </p>
      )}
      {item.notes && (
        <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">Nota: {item.notes}</p>
      )}
    </div>
  );
}

function AttributionEntry({
  item,
}: {
  item: Extract<ExpedienteTimelineEvent, { kind: 'attribution' }>;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-900 dark:text-white">{item.actorName}</p>
      <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
        {getPortalUserRoleLabel(item.actorRole)} ·{' '}
        {formatAcquisitionChannel(item.acquisitionChannel)}
      </p>
      {item.revokedAt && (
        <p className="mt-1 text-[10px] text-red-400">
          Revocado · {item.revokedReason || 'Sin motivo'}
        </p>
      )}
    </div>
  );
}

function PipelineEntry({
  change,
}: {
  change: Extract<ExpedienteTimelineEvent, { kind: 'pipeline' }>;
}) {
  return (
    <div>
      {/* Se lee en orden: estado anterior → estado nuevo. */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {change.fromStatus ? (
          <>
            <span className="text-gray-600 dark:text-gray-300">
              {formatExpedienteStatus(change.fromStatus)}
            </span>
            <span aria-label="pasó a" className="text-gray-400">
              →
            </span>
          </>
        ) : null}
        <Badge variant={getStatusBadgeVariant(change.toStatus)}>
          {formatExpedienteStatus(change.toStatus)}
        </Badge>
      </div>
      {change.actor?.name && (
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">por {change.actor.name}</p>
      )}
      {change.reason && (
        <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">{change.reason}</p>
      )}
    </div>
  );
}

function SystemActivityEntry({ activity }: { activity: ExpedienteSystemTimelineEvent }) {
  const actorName = activity.actor?.name?.trim() || null;
  return (
    <div className="space-y-0">
      {activity.type === 'SECTION_UPDATED' && (
        <div className="space-y-0">
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {activity.sectionLabel ?? 'Sección actualizada'}
          </p>
          {/* El motivo genérico repetía el rótulo del evento; solo se muestra uno con contenido. */}
          {activity.reason && activity.reason.trim() !== 'Sección actualizada' && (
            <p className="text-sm text-gray-700 dark:text-gray-200">{activity.reason}</p>
          )}
        </div>
      )}
      {activity.type === 'CREATED' && (
        <p className="text-sm text-gray-700 dark:text-gray-200">
          Registro inicial de la oportunidad.
        </p>
      )}
      {actorName && <p className="text-xs text-gray-500 dark:text-gray-400">por {actorName}</p>}
    </div>
  );
}

function TimelineItem({ entry }: { entry: TimelineEntry }) {
  const kindMeta = getExpedienteTimelineKindMeta(entry.kind);

  const iconNode =
    entry.kind === 'contact' ? (
      <ChannelIcon
        channel={(entry.data as ExpedienteContactTimelineEvent).channel}
        className="h-3.5 w-3.5 text-iwana-primary"
      />
    ) : entry.kind === 'responsibility' ? (
      <UserCheck className="h-3.5 w-3.5 text-iwana-secondary-700" aria-hidden="true" />
    ) : entry.kind === 'attribution' ? (
      <TrendingUp className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
    ) : entry.kind === 'pipeline' ? (
      <ArrowRightLeft className="h-3.5 w-3.5 text-iwana-primary" aria-hidden="true" />
    ) : (
      (() => {
        const act = entry.data as ExpedienteSystemTimelineEvent;
        if (act.type === 'CREATED') {
          return <FileText className="h-3.5 w-3.5 text-iwana-secondary-700" aria-hidden="true" />;
        }
        if (act.type === 'SECTION_UPDATED') {
          return <Edit className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />;
        }
        return <ArrowRightLeft className="h-3.5 w-3.5 text-iwana-primary" aria-hidden="true" />;
      })()
    );

  const kindLabel =
    entry.kind === 'contact'
      ? kindMeta.label
      : entry.kind === 'responsibility'
        ? kindMeta.label
        : entry.kind === 'attribution'
          ? kindMeta.label
          : entry.kind === 'pipeline'
            ? kindMeta.label
            : (() => {
                const act = entry.data as ExpedienteSystemTimelineEvent;
                if (act.type === 'CREATED') return 'Oportunidad creada';
                if (act.type === 'SECTION_UPDATED') return 'Actualización de sección';
                return kindMeta.label;
              })();

  return (
    <li className="relative pl-7">
      <span className="absolute -left-[13px] top-0 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white dark:border-dark-border dark:bg-dark-surface-3">
        {iconNode}
      </span>
      <div className="min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="portal-eyebrow-muted">{kindLabel}</p>
          <time
            dateTime={entry.sortAt.toISOString()}
            className="font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400"
          >
            {entry.sortAt.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
          </time>
        </div>
        {entry.kind === 'contact' && (
          <ContactEntry attempt={entry.data as ExpedienteContactTimelineEvent} />
        )}
        {entry.kind === 'responsibility' && (
          <ResponsibilityEntry
            item={entry.data as Extract<ExpedienteTimelineEvent, { kind: 'responsibility' }>}
          />
        )}
        {entry.kind === 'attribution' && (
          <AttributionEntry
            item={entry.data as Extract<ExpedienteTimelineEvent, { kind: 'attribution' }>}
          />
        )}
        {entry.kind === 'pipeline' && (
          <PipelineEntry
            change={entry.data as Extract<ExpedienteTimelineEvent, { kind: 'pipeline' }>}
          />
        )}
        {entry.kind === 'system' && (
          <SystemActivityEntry activity={entry.data as ExpedienteSystemTimelineEvent} />
        )}
      </div>
    </li>
  );
}

export function ExpedienteTimelinePanel({
  loadingTimeline,
  timelineError,
  onRetryTimeline,
  timelineEntries,
  timelineTotal,
  activeFilter,
  onActiveFilterChange,
  timelinePageSize,
  onTimelinePageSizeChange,
  isHistoryExpanded,
  onHistoryExpandedChange,
  timelinePage,
  timelineTotalPages,
  onTimelinePageChange,
}: ExpedienteTimelinePanelProps) {
  const timelineFrom = timelineTotal === 0 ? 0 : (timelinePage - 1) * timelinePageSize + 1;
  const timelineTo = Math.min(timelinePage * timelinePageSize, timelineTotal);

  const filterOptions: { key: TimelineFilter; label: string; icon: ReactNode | null }[] = [
    { key: 'all', label: 'Todos', icon: null },
    {
      key: 'contact',
      label: 'Contactos',
      icon: <Phone className="h-3 w-3" aria-hidden="true" />,
    },
    {
      key: 'pipeline',
      label: 'Estados',
      icon: <ArrowRightLeft className="h-3 w-3" aria-hidden="true" />,
    },
    {
      key: 'asignaciones',
      label: 'Asignaciones',
      icon: <UserCheck className="h-3 w-3" aria-hidden="true" />,
    },
    {
      key: 'system',
      label: 'Auditoría',
      icon: <FileText className="h-3 w-3" aria-hidden="true" />,
    },
  ];

  return (
    <div>
      <div className="mb-3 space-y-2">
        <button
          type="button"
          onClick={() => onHistoryExpandedChange(!isHistoryExpanded)}
          disabled={timelineTotal === 0 && !loadingTimeline}
          aria-expanded={isHistoryExpanded}
          className={cn(
            'group flex min-h-11 items-center gap-2 rounded-lg',
            interactiveFocusClassName,
          )}
        >
          <span className="text-base font-semibold text-gray-900 dark:text-white">
            Bitácora de actividad
            {timelineTotal > 0 && ` (${timelineTotal})`}
          </span>
          {timelineTotal > 0 && (
            <ChevronDown
              className={`h-4 w-4 text-gray-400 transition-transform duration-200 dark:text-gray-400 ${
                isHistoryExpanded ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
          )}
        </button>

        {/* Toolbar siempre visible: no desmontar con filtro vacío (total=0). */}
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div
            role="toolbar"
            aria-label="Filtros de la bitácora"
            className="flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto pb-0.5"
          >
            {filterOptions.map((filterOption) => (
              <PortalFilterChip
                key={filterOption.key}
                active={activeFilter === filterOption.key}
                onClick={() => onActiveFilterChange(filterOption.key)}
                className="shrink-0 gap-1.5"
              >
                {filterOption.icon}
                {filterOption.label}
              </PortalFilterChip>
            ))}
          </div>

          <PortalPageSizeSelect
            id="expediente-timeline-page-size"
            density="compact"
            value={timelinePageSize}
            options={TIMELINE_PAGE_SIZE_OPTIONS}
            onChange={(size) => {
              if ((TIMELINE_PAGE_SIZE_OPTIONS as readonly number[]).includes(size)) {
                onTimelinePageSizeChange(size as TimelinePageSize);
              }
            }}
            className="shrink-0"
          />
        </div>
      </div>

      {loadingTimeline && timelineEntries.length === 0 ? (
        <div className="space-y-3 py-3" role="status" aria-live="polite">
          <PortalSkeletonBlock className="h-20 rounded-2xl" />
          <PortalSkeletonBlock className="h-20 rounded-2xl" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Cargando la bitácora…</p>
        </div>
      ) : timelineError ? (
        <PortalAlert
          variant="error"
          title="No fue posible cargar la bitácora"
          description={timelineError}
          action={
            <Button type="button" variant="secondary" size="sm" onClick={onRetryTimeline}>
              Reintentar
            </Button>
          }
        />
      ) : timelineTotal === 0 ? (
        <PortalEmptyState
          title={
            activeFilter === 'all' ? 'Aún no hay actividad' : 'Sin resultados para este filtro'
          }
          description={
            activeFilter === 'all'
              ? 'Cuando se registre una actividad, aparecerá aquí.'
              : 'Prueba con otro filtro para revisar la actividad disponible.'
          }
          icon={Phone}
          action={
            activeFilter !== 'all' ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => onActiveFilterChange('all')}
              >
                Limpiar filtro
              </Button>
            ) : undefined
          }
        />
      ) : (
        isHistoryExpanded && (
          <>
            <ol
              aria-label="Eventos de la bitácora"
              className="relative ml-3 space-y-4 border-l border-gray-200 py-1 dark:border-dark-border"
              aria-busy={loadingTimeline || undefined}
            >
              {loadingTimeline && (
                <span className="sr-only" role="status" aria-live="polite">
                  Actualizando la bitácora…
                </span>
              )}
              {timelineEntries.map((entry) => (
                <TimelineItem key={entry.id} entry={entry} />
              ))}
            </ol>

            {timelineTotalPages > 1 && (
              <PortalTablePager
                density="compact"
                className="mt-3 border-0 px-0 py-2"
                page={timelinePage}
                pageCount={timelineTotalPages}
                onPageChange={onTimelinePageChange}
                from={timelineFrom}
                to={timelineTo}
                total={timelineTotal}
                resource={TIMELINE_RESOURCE}
                loading={loadingTimeline}
                labels={{
                  nav: () => 'Paginación de la bitácora de actividad',
                }}
              />
            )}
          </>
        )
      )}
    </div>
  );
}
