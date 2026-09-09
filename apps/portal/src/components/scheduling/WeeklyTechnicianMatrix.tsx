'use client';

import { useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { Button, Popover, PopoverContent, PopoverTrigger, cn } from '@iwana/ui';
import type {
  InternalUser,
  WfmScheduleEvent,
  WfmScheduleRecommendation,
  WfmTechnicianAvailability,
} from '@/lib/api-client';
import { PortalEmptyState, PortalPanel } from '@/components/shared/portal-ui';
import {
  formatShortWfmDayLabel,
  formatWfmTime,
  getTechnicianAvailabilityLabel,
  getTechnicianDisplayName,
  getTechnicianSubtitle,
} from './scheduling-ui';
import { toLocalTimeValue } from './schedule-event-time';
import type { MatrixCellSelection, MatrixManualScheduleDraft } from './matrix-scheduling-selection';
import { buildMatrixCellKey } from './matrix-scheduling-selection';

interface WeeklyTechnicianMatrixProps {
  technicians: InternalUser[];
  events: WfmScheduleEvent[];
  availability: WfmTechnicianAvailability[];
  rangeStart: Date;
  recommendations: WfmScheduleRecommendation[];
  selectedRecommendationId: string | null;
  selectedCell: MatrixCellSelection | null;
  manualSelectionDraft: MatrixManualScheduleDraft | null;
  defaultDurationMinutes: number;
  onSelectCell: (selection: MatrixCellSelection) => void;
  onSelectRecommendation: (recommendationId: string, selection: MatrixManualScheduleDraft) => void;
  onRequestManualTime: (selection: MatrixManualScheduleDraft) => void;
}

type MatrixDay = {
  key: string;
  label: string;
  startAt: Date;
  endAt: Date;
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function toDayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function buildMatrixDays(rangeStart: Date): MatrixDay[] {
  const days: MatrixDay[] = [];

  for (let index = 0; index < 7; index += 1) {
    const startAt = new Date(rangeStart);
    startAt.setDate(rangeStart.getDate() + index);
    startAt.setHours(0, 0, 0, 0);
    const endAt = new Date(startAt);
    endAt.setHours(23, 59, 59, 999);

    days.push({
      key: toDayKey(startAt),
      label: formatShortWfmDayLabel(startAt),
      startAt,
      endAt,
    });
  }

  return days;
}

function overlaps(startAt: Date, endAt: Date, otherStartAt: Date, otherEndAt: Date): boolean {
  return otherStartAt.getTime() < endAt.getTime() && otherEndAt.getTime() > startAt.getTime();
}

function getRecommendationKey(recommendation: WfmScheduleRecommendation): string {
  return `${recommendation.technicianId}::${recommendation.scheduledStartAt}`;
}

export function WeeklyTechnicianMatrix({
  technicians,
  events,
  availability,
  rangeStart,
  recommendations,
  selectedRecommendationId,
  selectedCell,
  manualSelectionDraft,
  defaultDurationMinutes,
  onSelectCell,
  onSelectRecommendation,
  onRequestManualTime,
}: WeeklyTechnicianMatrixProps) {
  const days = buildMatrixDays(rangeStart);
  const [openCellKey, setOpenCellKey] = useState<string | null>(null);
  const [manualTimeByCell, setManualTimeByCell] = useState<Record<string, string>>({});
  const selectedCellKey = selectedCell
    ? buildMatrixCellKey(selectedCell.technicianId, selectedCell.date)
    : null;
  const selectedManualCellKey = manualSelectionDraft
    ? buildMatrixCellKey(manualSelectionDraft.technicianId, manualSelectionDraft.date)
    : null;

  if (technicians.length === 0) {
    return (
      <PortalPanel
        eyebrow="Matriz semanal"
        title="Capacidad operativa"
        description="No hay técnicos ni contratistas activos disponibles para esta vista."
      >
        <PortalEmptyState
          title="Sin personal elegible"
          description="La bandeja necesita al menos un técnico o contratista activo para mostrar recomendaciones y capacidad semanal."
          icon={CalendarRange}
        />
      </PortalPanel>
    );
  }

  return (
    <PortalPanel
      eyebrow="Matriz semanal"
      title="Capacidad por técnico"
      description="Vista densa de siete días para contrastar carga, bloqueos y la franja recomendada antes de confirmar agenda."
      className="h-full"
      contentClassName="overflow-hidden"
    >
      <div className="overflow-hidden rounded-[28px] border border-gray-200/80 bg-white/95 shadow-sm dark:border-dark-border dark:bg-dark-surface-3/60">
        <div className="overflow-auto">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 min-w-[220px] border-b border-gray-100 bg-white/95 px-5 py-4 text-left align-middle text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-400">
                  Técnico
                </th>
                {days.map((day) => (
                  <th
                    key={day.key}
                    className="sticky top-0 z-10 min-w-[156px] border-b border-gray-100 bg-white/95 px-5 py-4 text-left align-middle text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-400"
                  >
                    {day.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {technicians.map((technician) => (
                <tr key={technician.id}>
                  <td className="sticky left-0 z-10 border-b border-gray-100 bg-white/95 px-5 py-5 align-middle backdrop-blur-[2px] dark:border-dark-border dark:bg-dark-surface-2">
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {getTechnicianDisplayName(technician)}
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {getTechnicianSubtitle(technician)}
                    </p>
                  </td>
                  {days.map((day) => {
                    const cellKey = buildMatrixCellKey(technician.id, day.key);
                    const dayEvents = events.filter(
                      (event) =>
                        event.assignedUserId === technician.id &&
                        overlaps(
                          day.startAt,
                          day.endAt,
                          new Date(event.scheduledStartAt),
                          new Date(event.scheduledEndAt),
                        ),
                    );
                    const dayAvailability = availability.filter(
                      (entry) =>
                        entry.userId === technician.id &&
                        overlaps(
                          day.startAt,
                          day.endAt,
                          new Date(entry.startsAt),
                          new Date(entry.endsAt),
                        ),
                    );

                    // La matriz prioriza bloqueos sobre disponibilidades explícitas para evitar falsas señales.
                    const blockedEntry = dayAvailability.find(
                      (entry) => entry.type !== 'AVAILABLE',
                    );
                    const availableEntry = dayAvailability.find(
                      (entry) => entry.type === 'AVAILABLE',
                    );
                    const dayRecommendations = recommendations.filter(
                      (recommendation) =>
                        recommendation.technicianId === technician.id &&
                        toDayKey(new Date(recommendation.scheduledStartAt)) === day.key,
                    );
                    const highlightedRecommendation = dayRecommendations.find(
                      (recommendation) =>
                        getRecommendationKey(recommendation) === selectedRecommendationId,
                    );
                    const primaryRecommendation =
                      highlightedRecommendation ?? dayRecommendations[0];
                    const recommendationKey = primaryRecommendation
                      ? getRecommendationKey(primaryRecommendation)
                      : null;
                    const recommendationMatches = recommendationKey === selectedRecommendationId;
                    const availabilityLabel = blockedEntry
                      ? getTechnicianAvailabilityLabel(blockedEntry.type)
                      : availableEntry
                        ? getTechnicianAvailabilityLabel(availableEntry.type)
                        : 'Sin disponibilidad explícita';
                    const riskMessages: string[] = [];

                    if (blockedEntry) {
                      riskMessages.push(
                        `El técnico tiene una restricción registrada: ${getTechnicianAvailabilityLabel(blockedEntry.type).toLowerCase()}.`,
                      );
                    } else if (!availableEntry) {
                      riskMessages.push(
                        'No hay una disponibilidad explícita registrada para este día.',
                      );
                    }

                    if (dayEvents.length > 0) {
                      riskMessages.push(
                        `Ya hay ${dayEvents.length} evento${dayEvents.length === 1 ? '' : 's'} en la jornada.`,
                      );
                    }

                    const isSelectedCell = selectedCellKey === cellKey;
                    const isSelectedManualCell = selectedManualCellKey === cellKey;
                    const cellTone =
                      isSelectedCell || recommendationMatches || isSelectedManualCell;
                    const manualTimeValue =
                      manualTimeByCell[cellKey] ??
                      (isSelectedManualCell ? (manualSelectionDraft?.startTime ?? '') : '');
                    const cellSelection: MatrixCellSelection = {
                      technicianId: technician.id,
                      date: day.key,
                      dayLabel: day.label,
                      availabilityLabel,
                      riskMessages,
                    };
                    const hasRisk = riskMessages.length > 0;
                    const manualSelectionSummary =
                      isSelectedManualCell && manualSelectionDraft?.source === 'manual'
                        ? manualSelectionDraft.startTime
                        : null;
                    const triggerAriaLabel = `Abrir opciones de agenda para ${getTechnicianDisplayName(technician)} el ${day.label}`;
                    const recommendationSelectionDraft = primaryRecommendation
                      ? {
                          ...cellSelection,
                          startTime: toLocalTimeValue(primaryRecommendation.scheduledStartAt),
                          duration: String(
                            Math.round(
                              (new Date(primaryRecommendation.scheduledEndAt).getTime() -
                                new Date(primaryRecommendation.scheduledStartAt).getTime()) /
                                60000,
                            ),
                          ),
                          source: 'recommendation' as const,
                        }
                      : null;

                    return (
                      <td
                        key={cellKey}
                        className={cn(
                          'border-b border-l border-gray-100/90 bg-white/80 p-0 align-middle first:border-l-0 dark:border-dark-border/70 dark:bg-dark-surface-2/40',
                          recommendationMatches && 'bg-emerald-50/70 dark:bg-emerald-950/20',
                        )}
                      >
                        <Popover
                          open={openCellKey === cellKey}
                          onOpenChange={(open) => {
                            setOpenCellKey(open ? cellKey : null);
                          }}
                        >
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              aria-label={triggerAriaLabel}
                              aria-pressed={
                                isSelectedCell || recommendationMatches || isSelectedManualCell
                              }
                              className={cn(
                                'flex h-full min-h-[168px] w-full flex-col items-start justify-start space-y-2.5 px-5 py-5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-inset',
                                cellTone &&
                                  'bg-emerald-50/70 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/20 dark:ring-emerald-900/40',
                                !cellTone && hasRisk && 'bg-amber-50/35 dark:bg-amber-950/10',
                                !cellTone &&
                                  !hasRisk &&
                                  'hover:bg-white/65 dark:hover:bg-dark-surface-3',
                              )}
                              onClick={() => onSelectCell(cellSelection)}
                            >
                              {cellTone && (
                                <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-dark-surface-2 dark:text-emerald-300">
                                  Seleccionada
                                </span>
                              )}
                              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                {dayEvents.length > 0
                                  ? `${dayEvents.length} evento${dayEvents.length === 1 ? '' : 's'}`
                                  : 'Sin eventos'}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {availabilityLabel}
                              </p>
                              {primaryRecommendation && (
                                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-200">
                                  <p>
                                    Recomendado:{' '}
                                    {formatWfmTime(primaryRecommendation.scheduledStartAt)} -{' '}
                                    {formatWfmTime(primaryRecommendation.scheduledEndAt)}
                                  </p>
                                </div>
                              )}
                              {manualSelectionSummary && (
                                <div className="rounded-xl border border-iwana-primary-200 bg-white px-3 py-2 text-xs text-iwana-primary-800 dark:border-iwana-primary-900/40 dark:bg-dark-surface-2 dark:text-iwana-secondary-200">
                                  Hora elegida manualmente: {manualSelectionSummary}
                                </div>
                              )}
                              {hasRisk && (
                                <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                                  Requiere validación operativa
                                </p>
                              )}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            align="start"
                            className="w-[320px] rounded-2xl border-gray-200 p-4 dark:border-dark-border dark:bg-dark-surface-2"
                          >
                            <div className="space-y-3">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
                                  Selección puntual
                                </p>
                                <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                                  {getTechnicianDisplayName(technician)} · {day.label}
                                </p>
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                  {availabilityLabel}
                                </p>
                              </div>

                              {dayRecommendations.length > 0 && (
                                <div className="space-y-2">
                                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                                    Franjas sugeridas
                                  </p>
                                  <div className="space-y-2">
                                    {dayRecommendations.map((recommendation) => {
                                      const currentRecommendationKey =
                                        getRecommendationKey(recommendation);
                                      const isCurrent =
                                        currentRecommendationKey === selectedRecommendationId;
                                      const selectionDraft: MatrixManualScheduleDraft = {
                                        ...cellSelection,
                                        startTime: toLocalTimeValue(
                                          recommendation.scheduledStartAt,
                                        ),
                                        duration: String(
                                          Math.round(
                                            (new Date(recommendation.scheduledEndAt).getTime() -
                                              new Date(recommendation.scheduledStartAt).getTime()) /
                                              60000,
                                          ),
                                        ),
                                        source: 'recommendation',
                                      };

                                      return (
                                        <button
                                          key={currentRecommendationKey}
                                          type="button"
                                          className={cn(
                                            'w-full rounded-xl border px-3 py-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary',
                                            isCurrent
                                              ? 'border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-100'
                                              : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200 dark:hover:bg-dark-surface-3',
                                          )}
                                          onClick={() => {
                                            onSelectRecommendation(
                                              currentRecommendationKey,
                                              selectionDraft,
                                            );
                                            setOpenCellKey(null);
                                          }}
                                        >
                                          <span className="block font-semibold">
                                            {formatWfmTime(recommendation.scheduledStartAt)} -{' '}
                                            {formatWfmTime(recommendation.scheduledEndAt)}
                                          </span>
                                          <span className="mt-1 block text-[11px] opacity-80">
                                            Score {recommendation.score}
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              <div className="space-y-2 rounded-2xl border border-gray-200 bg-gray-50/80 p-3 dark:border-dark-border dark:bg-dark-surface-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                                  Hora manual
                                </p>
                                <label className="grid gap-1 text-xs font-medium text-gray-700 dark:text-gray-200">
                                  Hora de inicio
                                  <input
                                    type="time"
                                    value={manualTimeValue}
                                    onChange={(event) =>
                                      setManualTimeByCell((current) => ({
                                        ...current,
                                        [cellKey]: event.target.value,
                                      }))
                                    }
                                    className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-iwana-primary dark:border-dark-border dark:bg-dark-surface-3 dark:text-white"
                                  />
                                </label>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                  Duración estimada: {defaultDurationMinutes} min. La validación
                                  final de ventana y conflictos se hará al confirmar.
                                </p>
                                <Button
                                  type="button"
                                  className="w-full"
                                  variant="secondary"
                                  disabled={!manualTimeValue}
                                  onClick={() => {
                                    onRequestManualTime({
                                      ...cellSelection,
                                      startTime: manualTimeValue,
                                      duration: String(defaultDurationMinutes),
                                      source: 'manual',
                                    });
                                    setOpenCellKey(null);
                                  }}
                                >
                                  Definir esta hora
                                </Button>
                              </div>

                              {riskMessages.length > 0 && (
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/10 dark:text-amber-100">
                                  <p className="font-semibold">Advertencias operativas</p>
                                  <ul className="mt-1 list-disc space-y-1 pl-4">
                                    {riskMessages.map((message) => (
                                      <li key={message}>{message}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {recommendationSelectionDraft && recommendationMatches && (
                                <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                                  La franja sugerida de esta celda ya está seleccionada en el panel.
                                </p>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PortalPanel>
  );
}
