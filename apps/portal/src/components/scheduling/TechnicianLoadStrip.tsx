'use client';

import { UsersRound } from 'lucide-react';
import { Badge, Button } from '@iwana/ui';
import type { InternalUser, WfmDashboardSummary } from '@/lib/api-client';
import { PortalEmptyState, PortalPanel } from '@/components/shared/portal-ui';
import {
  getTechnicianDisplayName,
  getTechnicianLoadRiskTitle,
  getTechnicianLoadRiskVariant,
} from './scheduling-ui';

interface TechnicianLoadStripProps {
  summary: WfmDashboardSummary | null;
  techniciansById: Map<string, InternalUser>;
  selectedTechnicianId: string;
  onFilterTechnician: (technicianId: string) => void;
}

export function TechnicianLoadStrip({
  summary,
  techniciansById,
  selectedTechnicianId,
  onFilterTechnician,
}: TechnicianLoadStripProps) {
  const loadItems = summary?.technicianLoad ?? [];

  return (
    <PortalPanel
      eyebrow="Carga"
      title="Saturación por responsable"
      description="Banda diaria calculada sobre minutos programados y eventos activos."
    >
      {loadItems.length === 0 ? (
        <PortalEmptyState
          title="Sin carga operativa"
          description="No hay técnicos con eventos activos en la jornada consultada."
          icon={UsersRound}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {loadItems.map((item) => {
            const technician = techniciansById.get(item.assignedUserId);
            const isSelected = selectedTechnicianId === item.assignedUserId;

            return (
              <article
                key={item.assignedUserId}
                className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {technician
                        ? getTechnicianDisplayName(technician)
                        : 'Responsable no disponible'}
                    </p>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {item.todayCount} eventos · {item.overdueCount} atrasados
                    </p>
                  </div>
                  <Badge variant={getTechnicianLoadRiskVariant(item.riskLevel)}>
                    {getTechnicianLoadRiskTitle(item.riskLevel)}
                  </Badge>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-dark-surface-4">
                  <div
                    role="progressbar"
                    aria-label={`${technician ? getTechnicianDisplayName(technician) : 'Técnico'} ${item.utilizationPercent}% de saturación`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.min(100, item.utilizationPercent)}
                    className="h-full rounded-full bg-iwana-primary"
                    style={{ width: `${Math.min(100, item.utilizationPercent)}%` }}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {item.utilizationPercent}% · {item.totalScheduledMinutes} min
                  </span>
                  <Button
                    type="button"
                    variant={isSelected ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => onFilterTechnician(item.assignedUserId)}
                  >
                    Filtrar
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </PortalPanel>
  );
}
