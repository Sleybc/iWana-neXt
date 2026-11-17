import Link from 'next/link';
import { Badge, Button } from '@iwana/ui';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPanel,
  PortalSkeletonBlock,
  portalInlineTextLinkClassName,
} from '@/components/shared/portal-ui';
import {
  getScheduleEventStatusLabel,
  getScheduleEventStatusVariant,
  getWfmWorkTypeLabel,
} from '@/components/scheduling/scheduling-ui';
import type { WfmScheduleEvent } from '@/lib/api-client';

export type DashboardAgendaVisit = Pick<
  WfmScheduleEvent,
  'id' | 'scheduledStartAt' | 'type' | 'status'
>;

export function DashboardTodayAgenda({
  day,
  timeZone,
  visits,
  visitsAllowed,
  cutoff,
  loading,
  unavailable,
  onRetry,
}: {
  day: string;
  timeZone: string;
  visits: readonly DashboardAgendaVisit[];
  visitsAllowed: boolean;
  cutoff: number | null;
  loading: boolean;
  unavailable: readonly string[];
  onRetry: () => void;
}) {
  const hasCutoff = cutoff !== null && cutoff > 0;
  const cutoffHref = `/dashboard/crm/subscribers/agenda-corte?date=${day}`;
  const visitTime = new Intl.DateTimeFormat('es-CO', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  return (
    <PortalPanel
      compact
      labelled
      title="Hoy en agenda"
      busy={loading}
      actions={
        visitsAllowed ? (
          <Link
            href={`/dashboard/scheduling/agenda?view=day&fromDate=${day}`}
            className={`${portalInlineTextLinkClassName} min-h-11`}
          >
            Ver agenda completa
          </Link>
        ) : null
      }
    >
      {loading ? <PortalSkeletonBlock className="h-24 rounded-xl" /> : null}
      {unavailable.length > 0 ? (
        <PortalAlert
          variant="error"
          title={`No pudimos cargar ${unavailable.join(' y ')}`}
          action={
            <Button variant="ghost" size="sm" onClick={onRetry}>
              Reintentar
            </Button>
          }
        />
      ) : null}
      {visits.length > 0 || hasCutoff ? (
        <ul className="divide-y divide-gray-100 dark:divide-dark-border">
          {visits.slice(0, hasCutoff ? 3 : 4).map((visit) => (
            <li
              key={visit.id}
              className="flex min-h-11 flex-wrap items-center gap-x-3 py-2 text-sm"
            >
              <time dateTime={visit.scheduledStartAt} className="font-mono tabular-nums">
                {visitTime.format(new Date(visit.scheduledStartAt))}
              </time>
              <span className="flex-1">{getWfmWorkTypeLabel(visit.type)}</span>
              <Badge variant={getScheduleEventStatusVariant(visit.status)}>
                {getScheduleEventStatusLabel(visit.status)}
              </Badge>
            </li>
          ))}
          {hasCutoff ? (
            <li className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 text-sm">
              <Link href={cutoffHref} className={`${portalInlineTextLinkClassName} min-h-11`}>
                {cutoff === 1
                  ? '1 servicio con corte programado'
                  : `${cutoff} servicios con corte programado`}
              </Link>
              <Badge variant="warning">Hoy</Badge>
            </li>
          ) : null}
        </ul>
      ) : !loading && unavailable.length === 0 ? (
        <PortalEmptyState
          embedded
          title="Sin eventos para hoy"
          description="Consulta la agenda completa para ver otras fechas."
        />
      ) : null}
    </PortalPanel>
  );
}
