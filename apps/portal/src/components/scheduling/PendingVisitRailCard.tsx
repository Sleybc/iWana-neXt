'use client';

import { Clock3, GripVertical, MapPin } from 'lucide-react';
import { Badge } from '@iwana/ui';
import type { WfmVisitRequest } from '@/lib/api-client';
import { formatWfmDayLabel, getWfmWorkTypeLabel } from './scheduling-ui';
import { formatVisitRequestTerritory } from './pending-visits-ui';
import {
  PENDING_VISIT_DRAG_MIME,
  serializePendingVisitDragPayload,
  type PendingVisitDragPayload,
} from './daily-schedule-draft';
import { getDefaultDurationForWorkType } from './schedule-event-time';

interface PendingVisitRailCardProps {
  visitRequest: WfmVisitRequest;
  isSelected?: boolean;
  onClick?: () => void;
}

function buildDragPayload(visitRequest: WfmVisitRequest): PendingVisitDragPayload {
  return {
    visitRequestId: visitRequest.id,
    organizationSiteId: visitRequest.organizationSiteId ?? null,
    workType: visitRequest.workType,
    durationMinutes: getDefaultDurationForWorkType(visitRequest.workType),
    customerDisplayName: visitRequest.customerDisplayName?.trim() || visitRequest.title,
    title: visitRequest.title,
  };
}

function getClientName(visitRequest: WfmVisitRequest): string {
  return visitRequest.customerDisplayName?.trim() || visitRequest.title;
}

export function PendingVisitRailCard({
  visitRequest,
  isSelected = false,
  onClick,
}: PendingVisitRailCardProps) {
  const clientName = getClientName(visitRequest);
  const locationLabel = formatVisitRequestTerritory(visitRequest.municipality, visitRequest.sector);
  const createdLabel = formatWfmDayLabel(visitRequest.createdAt);

  return (
    <article
      draggable
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onDragStart={(event) => {
        event.dataTransfer.setData(
          PENDING_VISIT_DRAG_MIME,
          serializePendingVisitDragPayload(buildDragPayload(visitRequest)),
        );
        event.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      aria-current={isSelected ? 'true' : undefined}
      className={[
        'rounded-2xl border bg-white p-3 shadow-sm dark:bg-dark-surface-2',
        onClick
          ? 'cursor-pointer active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-2'
          : 'cursor-grab active:cursor-grabbing',
        isSelected
          ? 'border-iwana-primary ring-2 ring-iwana-primary/20'
          : 'border-gray-200 dark:border-dark-border',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
            {clientName}
          </p>

          <p className="flex items-start gap-1.5 text-xs text-gray-600 dark:text-gray-400">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-iwana-primary" aria-hidden="true" />
            <span className="line-clamp-2">{locationLabel}</span>
          </p>

          <p className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <Clock3 className="h-3.5 w-3.5 shrink-0 text-iwana-primary" aria-hidden="true" />
            <span>Creada {createdLabel}</span>
          </p>

          <Badge variant="info">{getWfmWorkTypeLabel(visitRequest.workType)}</Badge>
        </div>
      </div>
    </article>
  );
}
