'use client';

import type { ReactNode } from 'react';
import { Badge } from '@iwana/ui';
import {
  ArrowRightLeft,
  ChevronDown,
  Edit,
  FileText,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';
import { interactiveFocusClassName } from '@/components/shared/portal-ui';
import type {
  ContactAttemptRecord,
  ExpedienteActivityItem,
  ExpedienteTimelineChange,
  OperationalHistoryItem,
  SalesAttributionRecord,
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
export type TimelinePageSize = 5 | 10 | 20 | 50 | 'all';

export const TIMELINE_DEFAULT_PAGE_SIZE: TimelinePageSize = 5;
export const TIMELINE_PAGE_SIZE_OPTIONS: TimelinePageSize[] = [5, 10, 20, 50, 'all'];

export interface TimelineEntry {
  id: string;
  kind: TimelineKind;
  sortAt: Date;
  data:
    | ContactAttemptRecord
    | OperationalHistoryItem
    | SalesAttributionRecord
    | ExpedienteActivityItem
    | ExpedienteTimelineChange;
}

interface ExpedienteTimelinePanelProps {
  loadingAttempts: boolean;
  allTimelineEntries: TimelineEntry[];
  timelineEntries: TimelineEntry[];
  paginatedTimelineEntries: TimelineEntry[];
  activeFilter: TimelineFilter;
  onActiveFilterChange: (filter: TimelineFilter) => void;
  timelinePageSize: TimelinePageSize;
  onTimelinePageSizeChange: (size: TimelinePageSize) => void;
  isHistoryExpanded: boolean;
  onHistoryExpandedChange: (expanded: boolean) => void;
  showTimelinePagination: boolean;
  timelinePage: number;
  timelineTotalPages: number;
  timelinePageButtons: number[];
  firstTimelinePageButton: number;
  lastTimelinePageButton: number;
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

function ContactEntry({ attempt }: { attempt: ContactAttemptRecord }) {
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
      {attempt.actorName && (
        <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-400">por {attempt.actorName}</p>
      )}
    </div>
  );
}

function ResponsibilityEntry({ item }: { item: OperationalHistoryItem }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-900 dark:text-white">
        {item.newResponsible.name || 'Usuario asignado'}
      </p>
      {item.newResponsible.role && (
        <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
          Nuevo rol: {item.newResponsible.role}
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

function AttributionEntry({ item }: { item: SalesAttributionRecord }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-900 dark:text-white">{item.actorName}</p>
      <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
        {item.actorRole} · {formatAcquisitionChannel(item.acquisitionChannel)}
      </p>
      {item.revokedAt && (
        <p className="mt-1 text-[10px] text-red-400">
          Revocado · {item.revokedReason || 'Sin motivo'}
        </p>
      )}
    </div>
  );
}

function PipelineEntry({ change }: { change: ExpedienteTimelineChange }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={getStatusBadgeVariant(change.toStatus)}>
          {formatExpedienteStatus(change.toStatus)}
        </Badge>
        {change.fromStatus && (
          <span className="text-[10px] text-gray-400 dark:text-gray-400">
            ← {formatExpedienteStatus(change.fromStatus)}
          </span>
        )}
      </div>
      {change.actor?.name && (
        <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-400">por {change.actor.name}</p>
      )}
      {change.reason && (
        <p className="mt-1.5 rounded-lg bg-gray-50 px-2.5 py-1.5 text-[11px] dark:bg-dark-surface-3">
          {change.reason}
        </p>
      )}
    </div>
  );
}

function SystemActivityEntry({ activity }: { activity: ExpedienteActivityItem }) {
  const actorName = activity.actor?.name?.trim() || null;
  return (
    <div className="space-y-0">
      {activity.type === 'SECTION_UPDATED' && (
        <div className="space-y-0">
          <p className="text-xs font-medium leading-tight text-gray-900 dark:text-white">
            {activity.sectionLabel ?? 'Sección actualizada'}
          </p>
          {activity.reason && (
            <p className="rounded-lg bg-gray-50 px-2 py-1 text-[11px] leading-tight text-gray-600 dark:bg-dark-surface-3 dark:text-gray-300">
              {activity.reason}
            </p>
          )}
        </div>
      )}
      {activity.type === 'STATUS_CHANGED' && activity.toStatus && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={getStatusBadgeVariant(activity.toStatus)}>
            {formatExpedienteStatus(activity.toStatus)}
          </Badge>
          {activity.fromStatus && (
            <span className="text-[10px] text-gray-400 dark:text-gray-400">
              ← {formatExpedienteStatus(activity.fromStatus)}
            </span>
          )}
        </div>
      )}
      {activity.type === 'CREATED' && (
        <p className="text-xs leading-tight text-gray-600 dark:text-gray-300">
          Registro inicial del expediente.
        </p>
      )}
      {actorName && (
        <p className="text-[10px] leading-tight text-gray-400 dark:text-gray-400">
          por {actorName}
        </p>
      )}
    </div>
  );
}

function TimelineItem({ entry }: { entry: TimelineEntry }) {
  const kindMeta = getExpedienteTimelineKindMeta(entry.kind);

  const iconNode =
    entry.kind === 'contact' ? (
      <ChannelIcon
        channel={(entry.data as ContactAttemptRecord).channel}
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
        const act = entry.data as ExpedienteActivityItem;
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
                const act = entry.data as ExpedienteActivityItem;
                if (act.type === 'CREATED') return 'Oportunidad creada';
                if (act.type === 'SECTION_UPDATED') return 'Actualización de sección';
                return kindMeta.label;
              })();

  return (
    <div className="relative pb-1.5 pl-6">
      <span className="absolute -left-[13px] top-1 flex h-6 w-6 items-center justify-center rounded-full border border-gray-100 bg-white shadow-sm dark:border-dark-border dark:bg-dark-surface-3">
        {iconNode}
      </span>
      <div
        className={`rounded-[14px] border border-gray-100 border-l-2 bg-white px-3 py-2.5 shadow-sm transition-shadow hover:shadow-sm dark:border-dark-border dark:bg-dark-surface-2 ${kindMeta.accentClassName}`}
      >
        <p className="text-[10px] font-bold uppercase tracking-wide leading-tight text-gray-400 dark:text-gray-400">
          {kindLabel}
        </p>
        {entry.kind === 'contact' && <ContactEntry attempt={entry.data as ContactAttemptRecord} />}
        {entry.kind === 'responsibility' && (
          <ResponsibilityEntry item={entry.data as OperationalHistoryItem} />
        )}
        {entry.kind === 'attribution' && (
          <AttributionEntry item={entry.data as SalesAttributionRecord} />
        )}
        {entry.kind === 'pipeline' && (
          <PipelineEntry change={entry.data as ExpedienteTimelineChange} />
        )}
        {entry.kind === 'system' && (
          <SystemActivityEntry activity={entry.data as ExpedienteActivityItem} />
        )}
        <p className="text-[11px] leading-tight text-gray-400 dark:text-gray-400">
          {entry.sortAt.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
        </p>
      </div>
    </div>
  );
}

export function ExpedienteTimelinePanel({
  loadingAttempts,
  allTimelineEntries,
  timelineEntries,
  paginatedTimelineEntries,
  activeFilter,
  onActiveFilterChange,
  timelinePageSize,
  onTimelinePageSizeChange,
  isHistoryExpanded,
  onHistoryExpandedChange,
  showTimelinePagination,
  timelinePage,
  timelineTotalPages,
  timelinePageButtons,
  firstTimelinePageButton,
  lastTimelinePageButton,
  onTimelinePageChange,
}: ExpedienteTimelinePanelProps) {
  return (
    <div>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          onClick={() => onHistoryExpandedChange(!isHistoryExpanded)}
          disabled={allTimelineEntries.length === 0 && !loadingAttempts}
          className="group flex items-center gap-2 outline-none"
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-400">
            Bitácora de actividad
            {allTimelineEntries.length > 0 && ` (${allTimelineEntries.length})`}
          </p>
          {allTimelineEntries.length > 0 && (
            <ChevronDown
              className={`h-4 w-4 text-gray-400 transition-transform duration-200 dark:text-gray-400 ${
                isHistoryExpanded ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
          )}
        </button>
        {allTimelineEntries.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { key: 'all', label: 'Todos', icon: null },
                  {
                    key: 'contact',
                    label: 'Contactos',
                    icon: <Phone className="h-3 w-3" aria-hidden="true" />,
                  },
                  {
                    key: 'pipeline',
                    label: 'Pipeline',
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
                ] as { key: TimelineFilter; label: string; icon: ReactNode | null }[]
              ).map((filterOption) => (
                <button
                  key={filterOption.key}
                  type="button"
                  onClick={() => onActiveFilterChange(filterOption.key)}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition-colors ${
                    activeFilter === filterOption.key
                      ? 'bg-iwana-primary text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-dark-surface-3 dark:text-gray-400 dark:hover:bg-dark-border'
                  }`}
                >
                  {filterOption.icon}
                  {filterOption.label}
                </button>
              ))}
            </div>

            <div className="h-4 w-px bg-gray-200 dark:bg-dark-border" aria-hidden="true" />

            <div className="flex items-center gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-400">
                Ver
              </span>
              <div className="flex flex-wrap gap-1">
                {TIMELINE_PAGE_SIZE_OPTIONS.map((size) => {
                  const isActive = timelinePageSize === size;
                  const label = size === 'all' ? 'Todo' : String(size);

                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => onTimelinePageSizeChange(size)}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                        isActive
                          ? 'bg-iwana-secondary-700 text-white'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-dark-surface-3 dark:text-gray-400 dark:hover:bg-dark-border'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {loadingAttempts ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-iwana-primary" aria-hidden="true" />
        </div>
      ) : allTimelineEntries.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center dark:border-dark-border dark:bg-dark-surface-3">
          <Phone className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-400" aria-hidden="true" />
          <p className="mt-3 text-sm text-gray-400 dark:text-gray-400">
            Aún no hay actividad registrada para esta oportunidad.
          </p>
        </div>
      ) : (
        isHistoryExpanded && (
          <>
            <div className="relative ml-4 space-y-3 border-l border-gray-100 pl-0 dark:border-dark-border">
              {timelineEntries.length > 0 ? (
                paginatedTimelineEntries.map((entry) => (
                  <TimelineItem key={entry.id} entry={entry} />
                ))
              ) : (
                <p className="py-4 text-sm text-gray-400 dark:text-gray-400">
                  Sin resultados para este filtro.
                </p>
              )}
            </div>

            {showTimelinePagination && (
              <div className="mt-3 flex flex-wrap items-center justify-end gap-2 text-xs text-gray-500 dark:text-gray-400">
                <button
                  type="button"
                  onClick={() => onTimelinePageChange(Math.max(1, timelinePage - 1))}
                  disabled={timelinePage === 1}
                  className={`inline-flex min-h-11 items-center rounded-lg border border-gray-200 px-3 disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-border ${interactiveFocusClassName}`}
                >
                  Anterior
                </button>
                <span className="whitespace-nowrap">
                  Página {timelinePage} de {timelineTotalPages}
                </span>
                <div className="hidden items-center gap-2 sm:flex">
                  {firstTimelinePageButton > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => onTimelinePageChange(1)}
                        aria-label="Página 1"
                        aria-current={timelinePage === 1 ? 'page' : undefined}
                        className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-gray-200 px-2 dark:border-dark-border ${interactiveFocusClassName}`}
                      >
                        1
                      </button>
                      {firstTimelinePageButton > 2 && <span className="px-0.5">...</span>}
                    </>
                  )}

                  {timelinePageButtons.map((page) => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => onTimelinePageChange(page)}
                      aria-label={`Página ${page}`}
                      aria-current={page === timelinePage ? 'page' : undefined}
                      className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border px-2 ${
                        page === timelinePage
                          ? 'border-iwana-primary bg-iwana-primary text-white'
                          : 'border-gray-200 dark:border-dark-border'
                      } ${interactiveFocusClassName}`}
                    >
                      {page}
                    </button>
                  ))}

                  {lastTimelinePageButton < timelineTotalPages && (
                    <>
                      {lastTimelinePageButton < timelineTotalPages - 1 && (
                        <span className="px-0.5">...</span>
                      )}
                      <button
                        type="button"
                        onClick={() => onTimelinePageChange(timelineTotalPages)}
                        aria-label={`Página ${timelineTotalPages}`}
                        aria-current={timelinePage === timelineTotalPages ? 'page' : undefined}
                        className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-gray-200 px-2 dark:border-dark-border ${interactiveFocusClassName}`}
                      >
                        {timelineTotalPages}
                      </button>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onTimelinePageChange(Math.min(timelineTotalPages, timelinePage + 1))
                  }
                  disabled={timelinePage === timelineTotalPages}
                  className={`inline-flex min-h-11 items-center rounded-lg border border-gray-200 px-3 disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-border ${interactiveFocusClassName}`}
                >
                  Siguiente
                </button>
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
