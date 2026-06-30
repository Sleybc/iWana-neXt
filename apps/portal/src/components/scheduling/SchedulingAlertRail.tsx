'use client';

import { AlertTriangle } from 'lucide-react';
import { Badge, Button } from '@iwana/ui';
import type { WfmDashboardAlert } from '@/lib/api-client';
import { PortalEmptyState, PortalPanel } from '@/components/shared/portal-ui';
import {
  formatWfmDateTime,
  getDashboardAlertSeverityLabel,
  getDashboardAlertVariant,
} from './scheduling-ui';

interface SchedulingAlertRailProps {
  alerts: WfmDashboardAlert[];
  onOpenEvent: (eventId: string) => void;
  onFilterTechnician: (technicianId: string) => void;
  eyebrow?: string;
  title?: string;
  description?: string;
}

export function SchedulingAlertRail({
  alerts,
  onOpenEvent,
  onFilterTechnician,
  eyebrow = 'Alertas',
  title = 'Alertas de agenda',
  description = 'Alertas calculadas con la información disponible sobre horarios, carga y seguimiento.',
}: SchedulingAlertRailProps) {
  return (
    <PortalPanel eyebrow={eyebrow} title={title} description={description}>
      {alerts.length === 0 ? (
        <PortalEmptyState
          title="Sin alertas activas"
          description="No hay atrasos, borradores inmediatos ni saturación alta en la ventana actual."
          icon={AlertTriangle}
        />
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <article
              key={alert.id}
              className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white">{alert.title}</p>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    {alert.description}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {alert.scheduledStartAt
                      ? formatWfmDateTime(alert.scheduledStartAt)
                      : 'Sin franja asociada'}
                  </p>
                </div>
                <Badge variant={getDashboardAlertVariant(alert.severity)}>
                  {getDashboardAlertSeverityLabel(alert.severity)}
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {alert.eventId && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => onOpenEvent(alert.eventId as string)}
                    aria-label={`Abrir alerta ${alert.title}`}
                  >
                    Abrir detalle
                  </Button>
                )}
                {alert.assignedUserId && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => onFilterTechnician(alert.assignedUserId as string)}
                  >
                    Filtrar técnico
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </PortalPanel>
  );
}
