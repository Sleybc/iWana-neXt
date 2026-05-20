'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, Clock3, Compass, Sparkles } from 'lucide-react';
import { Badge, Button, DatePicker, Input, Select } from '@iwana/ui';
import type {
  InternalUser,
  UpdateWfmVisitRequestContextDto,
  WfmScheduleRecommendation,
  WfmVisitRequest,
} from '@/lib/api-client';
import { PortalAlert, PortalEmptyState, PortalPanel } from '@/components/shared/portal-ui';
import {
  formatWfmDateTime,
  getTechnicianDisplayName,
  getWorkOrderPriorityLabel,
  getWorkOrderPriorityVariant,
  getWfmWorkTypeLabel,
} from './scheduling-ui';
import {
  getScheduleTimeOptionsForWorkType,
  toDateFromLocalDateValue,
  toIsoFromLocalDateAndTime,
  toLocalDateTimeParts,
} from './schedule-event-time';
import { getOperatingWindowMessage, useOperatingWindow } from './useOperatingWindow';
import {
  formatVisitRequestLocationLabel,
  formatVisitRequestTerritory,
  getVisitRequestMissingFields,
  getVisitRequestOriginLabel,
  getVisitRequestReferenceLabel,
  getVisitRequestStatusDescription,
  getVisitRequestStatusLabel,
  getVisitRequestStatusVariant,
  isTerminalVisitRequestStatus,
} from './pending-visits-ui';

interface VisitRequestRecommendationPanelProps {
  selectedVisitRequest: WfmVisitRequest | null;
  techniciansById: Map<string, InternalUser>;
  recommendations: WfmScheduleRecommendation[];
  selectedRecommendationId: string | null;
  isLoadingRecommendations: boolean;
  recommendationError: string | null;
  isSavingContext: boolean;
  onRecommend: (payload: VisitRecommendationDraft) => Promise<void>;
  onSelectRecommendation: (recommendationId: string) => void;
  onSaveContext: (payload: UpdateWfmVisitRequestContextDto) => Promise<void>;
  onOpenConfirm: () => void;
}

export interface VisitRecommendationDraft {
  durationMinutes: number;
  searchHorizonDays: number;
  municipality?: string | null | undefined;
  sector?: string | null | undefined;
}

interface ContextDraft {
  description: string;
  address: string;
  municipality: string;
  sector: string;
  requestedWindowStartDate: string;
  requestedWindowStartTime: string;
  requestedWindowEndDate: string;
  requestedWindowEndTime: string;
}

const durationOptions = [
  { value: '30', label: '30 min' },
  { value: '60', label: '1 h' },
  { value: '90', label: '1 h 30 min' },
  { value: '120', label: '2 h' },
  { value: '180', label: '3 h' },
  { value: '240', label: '4 h' },
];

const horizonOptions = [
  { value: '1', label: 'Hoy' },
  { value: '3', label: 'Próximos 3 días' },
  { value: '7', label: 'Esta semana' },
  { value: '14', label: 'Próximos 14 días' },
];

function getRecommendationKey(recommendation: WfmScheduleRecommendation): string {
  return `${recommendation.technicianId}::${recommendation.scheduledStartAt}`;
}

function toContextDraft(visitRequest: WfmVisitRequest | null): ContextDraft {
  const requestedWindowStart = toLocalDateTimeParts(visitRequest?.requestedWindowStartAt);
  const requestedWindowEnd = toLocalDateTimeParts(visitRequest?.requestedWindowEndAt);

  return {
    description: visitRequest?.description ?? '',
    address: visitRequest?.address ?? '',
    municipality: formatVisitRequestLocationLabel(visitRequest?.municipality),
    sector: formatVisitRequestLocationLabel(visitRequest?.sector),
    requestedWindowStartDate: requestedWindowStart.dateLocal,
    requestedWindowStartTime: requestedWindowStart.timeLocal,
    requestedWindowEndDate: requestedWindowEnd.dateLocal,
    requestedWindowEndTime: requestedWindowEnd.timeLocal,
  };
}

export function VisitRequestRecommendationPanel({
  selectedVisitRequest,
  techniciansById,
  recommendations,
  selectedRecommendationId,
  isLoadingRecommendations,
  recommendationError,
  isSavingContext,
  onRecommend,
  onSelectRecommendation,
  onSaveContext,
  onOpenConfirm,
}: VisitRequestRecommendationPanelProps) {
  const [contextDraft, setContextDraft] = useState<ContextDraft>(() => toContextDraft(null));
  const [contextError, setContextError] = useState<string | null>(null);
  const [durationMinutes, setDurationMinutes] = useState('');
  const [searchHorizonDays, setSearchHorizonDays] = useState('7');
  const [isContextExpanded, setIsContextExpanded] = useState(false);
  const hasDurationSelection = durationMinutes.trim().length > 0;
  const { operatingWindow, isLoadingOperatingWindow, operatingWindowError } = useOperatingWindow({
    workType: selectedVisitRequest?.workType,
    dateLocal: contextDraft.requestedWindowStartDate || null,
    siteId: selectedVisitRequest?.operatingSiteId ?? null,
    enabled: Boolean(selectedVisitRequest),
  });
  const operatingWindowMessage = getOperatingWindowMessage(operatingWindow);
  const requestTimeOptions = getScheduleTimeOptionsForWorkType(
    selectedVisitRequest?.workType,
    operatingWindow,
  );

  useEffect(() => {
    const nextMissingFields = selectedVisitRequest
      ? getVisitRequestMissingFields(selectedVisitRequest)
      : [];

    setContextDraft(toContextDraft(selectedVisitRequest));
    setContextError(null);
    setDurationMinutes('');
    setSearchHorizonDays('7');
    setIsContextExpanded(nextMissingFields.length > 0);
  }, [selectedVisitRequest]);

  if (!selectedVisitRequest) {
    return (
      <PortalPanel
        eyebrow="Recomendación"
        title="Panel de decisión"
        description="Selecciona una solicitud en la bandeja para completar contexto o pedir recomendaciones."
      >
        <PortalEmptyState
          title="Sin solicitud seleccionada"
          description="El panel mostrará faltantes, sugerencias territoriales y confirmación compacta cuando elijas una solicitud pendiente."
          icon={Compass}
        />
      </PortalPanel>
    );
  }

  const missingFields = getVisitRequestMissingFields(selectedVisitRequest);
  const isTerminalVisitRequest = isTerminalVisitRequestStatus(selectedVisitRequest.status);
  const selectedRecommendation = recommendations.find(
    (recommendation) => getRecommendationKey(recommendation) === selectedRecommendationId,
  );

  return (
    <PortalPanel
      eyebrow="Recomendación"
      title="Despacho de la solicitud"
      description={getVisitRequestStatusDescription(selectedVisitRequest.status)}
      className="h-full"
      contentClassName="space-y-5"
    >
      <div className="space-y-4 rounded-3xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-4 dark:border-dark-border dark:from-dark-surface-2 dark:to-dark-surface-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-gray-900 dark:text-white">
              {selectedVisitRequest.title}
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {getVisitRequestReferenceLabel(selectedVisitRequest)}
            </p>
          </div>
          <Badge variant={getVisitRequestStatusVariant(selectedVisitRequest.status)}>
            {getVisitRequestStatusLabel(selectedVisitRequest.status)}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="neutral">
            {getVisitRequestOriginLabel(selectedVisitRequest.originContext)}
          </Badge>
          <Badge variant="info">{getWfmWorkTypeLabel(selectedVisitRequest.workType)}</Badge>
          <Badge variant={getWorkOrderPriorityVariant(selectedVisitRequest.priority)}>
            {getWorkOrderPriorityLabel(selectedVisitRequest.priority)}
          </Badge>
        </div>

        <dl className="grid gap-3 text-sm text-gray-600 dark:text-gray-300">
          <div className="rounded-2xl bg-white/80 p-3 dark:bg-dark-surface-2/80">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
              Dirección operativa
            </dt>
            <dd className="mt-1 text-sm text-gray-700 dark:text-gray-200">
              {selectedVisitRequest.address || 'Sin dirección operativa'}
            </dd>
          </div>
          <div className="rounded-2xl bg-white/80 p-3 dark:bg-dark-surface-2/80">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
              Territorio
            </dt>
            <dd className="mt-1 text-sm text-gray-700 dark:text-gray-200">
              {formatVisitRequestTerritory(
                selectedVisitRequest.municipality,
                selectedVisitRequest.sector,
              )}
            </dd>
          </div>
          <div className="rounded-2xl bg-white/80 p-3 dark:bg-dark-surface-2/80">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
              Nota operativa
            </dt>
            <dd className="mt-1 text-sm text-gray-700 dark:text-gray-200">
              {selectedVisitRequest.description || 'Sin nota operativa'}
            </dd>
          </div>
        </dl>
      </div>

      {missingFields.length > 0 && (
        <PortalAlert
          variant="warning"
          title="Completa contexto antes de recomendar"
          description={`Aún faltan: ${missingFields.join(', ')}. Abre el bloque de contexto para completarlos.`}
          icon={AlertTriangle}
        />
      )}

      {isTerminalVisitRequest && (
        <PortalAlert
          variant="info"
          title="Solicitud cerrada para despacho"
          description="Esta solicitud está en estado terminal y ya no permite completar contexto ni recalcular recomendaciones."
        />
      )}

      {contextError && (
        <PortalAlert
          variant="error"
          title="No se pudo guardar el contexto"
          description={contextError}
        />
      )}

      {selectedVisitRequest.workType === 'INSTALLATION' && operatingWindowError && (
        <PortalAlert
          variant="warning"
          title="No fue posible resolver la ventana operativa"
          description={operatingWindowError}
        />
      )}

      {selectedVisitRequest.workType === 'INSTALLATION' &&
        !operatingWindowError &&
        operatingWindowMessage && (
          <PortalAlert
            variant={operatingWindow?.status === 'OPEN' ? 'info' : 'warning'}
            title={
              operatingWindow?.status === 'OPEN'
                ? 'Ventana operativa aplicada'
                : 'Fecha cerrada para recomendar'
            }
            description={operatingWindowMessage}
          />
        )}

      <div className="space-y-4 rounded-3xl border border-gray-200 p-4 dark:border-dark-border">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
              Paso 1
            </p>
            <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
              Define duración y búsqueda
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Primero define cuánto durará la instalación. Después calcula las recomendaciones.
            </p>
          </div>
        </div>
        <div className="grid gap-3">
          <Select
            id="visit-request-duration-minutes"
            label="Duración estimada"
            value={durationMinutes}
            disabled={isTerminalVisitRequest}
            placeholder="Selecciona una duración"
            options={durationOptions}
            onChange={(event) => setDurationMinutes(event.target.value)}
          />
          <Select
            id="visit-request-search-horizon"
            label="Horizonte de búsqueda"
            value={searchHorizonDays}
            disabled={isTerminalVisitRequest}
            options={horizonOptions}
            onChange={(event) => setSearchHorizonDays(event.target.value)}
          />
        </div>
        <div className="rounded-2xl bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-dark-surface-3 dark:text-gray-300">
          {!hasDurationSelection
            ? 'Selecciona primero la duración estimada para habilitar las recomendaciones.'
            : selectedVisitRequest.workType === 'INSTALLATION' && isLoadingOperatingWindow
              ? 'Estamos resolviendo la ventana operativa configurada para la fecha solicitada.'
              : selectedVisitRequest.workType === 'INSTALLATION' &&
                  operatingWindow?.status === 'CLOSED'
                ? (operatingWindowMessage ??
                  'La fecha seleccionada no tiene una ventana operativa habilitada.')
                : missingFields.length > 0
                  ? 'El cálculo ya puede usar la duración elegida, pero aún debes completar el contexto operativo faltante.'
                  : 'Cuando confirmes la búsqueda, el sistema propondrá las mejores franjas por territorio y continuidad de ruta.'}
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={async () => {
              try {
                setContextError(null);
                await onSaveContext({
                  description: contextDraft.description || undefined,
                  address: contextDraft.address || undefined,
                  municipality: contextDraft.municipality || undefined,
                  sector: contextDraft.sector || undefined,
                  requestedWindowStartAt: toIsoFromLocalDateAndTime(
                    contextDraft.requestedWindowStartDate,
                    contextDraft.requestedWindowStartTime,
                  ),
                  requestedWindowEndAt: toIsoFromLocalDateAndTime(
                    contextDraft.requestedWindowEndDate,
                    contextDraft.requestedWindowEndTime,
                  ),
                });
                await onRecommend({
                  durationMinutes: Number(durationMinutes),
                  searchHorizonDays: Number(searchHorizonDays),
                  municipality: contextDraft.municipality || undefined,
                  sector: contextDraft.sector || undefined,
                });
              } catch (error) {
                setContextError(error instanceof Error ? error.message : 'Error inesperado.');
              }
            }}
            loading={isLoadingRecommendations}
            disabled={
              missingFields.length > 0 ||
              isTerminalVisitRequest ||
              !hasDurationSelection ||
              (selectedVisitRequest.workType === 'INSTALLATION' &&
                (!!operatingWindowError || operatingWindow?.status === 'CLOSED'))
            }
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Calcular recomendaciones
          </Button>
        </div>

        {recommendationError && (
          <PortalAlert
            variant="error"
            title="No fue posible calcular recomendaciones"
            description={recommendationError}
          />
        )}

        {recommendations.length === 0 ? (
          <PortalEmptyState
            title="Sin recomendaciones todavía"
            description="Cuando la solicitud esté lista, el panel mostrará técnicos y franjas ordenadas por cercanía territorial y continuidad de ruta."
            icon={Sparkles}
          />
        ) : (
          <div className="space-y-3">
            {recommendations.map((recommendation) => {
              const technician = techniciansById.get(recommendation.technicianId) ?? null;
              const recommendationKey = getRecommendationKey(recommendation);
              const isSelected = recommendationKey === selectedRecommendationId;

              return (
                <button
                  key={`${recommendation.technicianId}-${recommendation.scheduledStartAt}`}
                  type="button"
                  onClick={() => onSelectRecommendation(recommendationKey)}
                  className={`w-full rounded-2xl border px-4 py-4 text-left transition-colors ${
                    isSelected
                      ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-500/70 dark:bg-emerald-950/20'
                      : 'border-gray-200 bg-white hover:border-iwana-primary/30 hover:bg-gray-50 dark:border-dark-border dark:bg-dark-surface-2 dark:hover:bg-dark-surface-3'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {technician
                          ? getTechnicianDisplayName(technician)
                          : recommendation.technicianId}
                      </p>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {formatWfmDateTime(recommendation.scheduledStartAt)} -{' '}
                        {formatWfmDateTime(recommendation.scheduledEndAt)}
                      </p>
                    </div>
                    <Badge variant="success">Score {recommendation.score}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {recommendation.labels.map((label) => (
                      <Badge key={label} variant="neutral">
                        {label}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-3 grid gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <p>
                      Distancia estimada:{' '}
                      {recommendation.distanceKm !== null
                        ? `${recommendation.distanceKm.toFixed(1)} km`
                        : 'Sin georreferencia'}
                    </p>
                    <p>Carga previa: {recommendation.totalScheduledMinutes} min</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <Button
          type="button"
          variant="secondary"
          disabled={!selectedRecommendation || isTerminalVisitRequest}
          onClick={onOpenConfirm}
        >
          <Clock3 className="h-4 w-4" aria-hidden="true" />
          Confirmar franja seleccionada
        </Button>
      </div>

      <div className="rounded-3xl border border-gray-200 p-4 dark:border-dark-border">
        <button
          type="button"
          className="flex w-full items-start justify-between gap-3 text-left"
          aria-expanded={isContextExpanded}
          aria-controls="visit-request-context-panel"
          onClick={() => setIsContextExpanded((current) => !current)}
        >
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
              Paso 2
            </p>
            <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
              Contexto operativo y ventana
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {missingFields.length > 0
                ? `Pendiente por completar: ${missingFields.join(', ')}.`
                : 'Úsalo para ajustar dirección, territorio, ventana comprometida y nota operativa.'}
            </p>
          </div>
          <ChevronDown
            className={`mt-1 h-4 w-4 shrink-0 text-gray-400 transition-transform ${
              isContextExpanded ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          />
        </button>

        {isContextExpanded && (
          <div
            id="visit-request-context-panel"
            className="mt-4 space-y-4 border-t border-gray-100 pt-4 dark:border-dark-border"
          >
            <Input
              id="visit-request-address"
              label="Dirección operativa"
              value={contextDraft.address}
              disabled={isTerminalVisitRequest}
              onChange={(event) =>
                setContextDraft((current) => ({ ...current, address: event.target.value }))
              }
            />
            <div className="grid gap-3">
              <Input
                id="visit-request-municipality"
                label="Municipio"
                value={contextDraft.municipality}
                disabled={isTerminalVisitRequest}
                onChange={(event) =>
                  setContextDraft((current) => ({ ...current, municipality: event.target.value }))
                }
              />
              <Input
                id="visit-request-sector"
                label="Sector"
                value={contextDraft.sector}
                disabled={isTerminalVisitRequest}
                onChange={(event) =>
                  setContextDraft((current) => ({ ...current, sector: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-4 rounded-2xl bg-gray-50 p-3 dark:bg-dark-surface-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                Ventana comprometida opcional
              </p>
              <div className="grid gap-3">
                <DatePicker
                  id="visit-request-window-start-date"
                  label="Inicio de ventana"
                  value={toDateFromLocalDateValue(contextDraft.requestedWindowStartDate)}
                  disabled={isTerminalVisitRequest}
                  onChange={(date) =>
                    setContextDraft((current) => ({
                      ...current,
                      requestedWindowStartDate: date
                        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
                        : '',
                    }))
                  }
                />
                <Select
                  id="visit-request-window-start-time"
                  label="Hora de inicio"
                  value={contextDraft.requestedWindowStartTime}
                  disabled={isTerminalVisitRequest}
                  placeholder="Selecciona una hora"
                  options={requestTimeOptions}
                  onChange={(event) =>
                    setContextDraft((current) => ({
                      ...current,
                      requestedWindowStartTime: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-3">
                <DatePicker
                  id="visit-request-window-end-date"
                  label="Fin de ventana"
                  value={toDateFromLocalDateValue(contextDraft.requestedWindowEndDate)}
                  disabled={isTerminalVisitRequest}
                  onChange={(date) =>
                    setContextDraft((current) => ({
                      ...current,
                      requestedWindowEndDate: date
                        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
                        : '',
                    }))
                  }
                />
                <Select
                  id="visit-request-window-end-time"
                  label="Hora de fin"
                  value={contextDraft.requestedWindowEndTime}
                  disabled={isTerminalVisitRequest}
                  placeholder="Selecciona una hora"
                  options={requestTimeOptions}
                  onChange={(event) =>
                    setContextDraft((current) => ({
                      ...current,
                      requestedWindowEndTime: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <label className="grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
              Nota operativa
              <textarea
                value={contextDraft.description}
                disabled={isTerminalVisitRequest}
                onChange={(event) =>
                  setContextDraft((current) => ({ ...current, description: event.target.value }))
                }
                rows={3}
                className="rounded-2xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-iwana-primary dark:border-dark-border dark:bg-dark-surface-2 dark:text-white"
              />
            </label>
            <Button
              type="button"
              variant="secondary"
              loading={isSavingContext}
              disabled={isTerminalVisitRequest}
              onClick={async () => {
                try {
                  setContextError(null);
                  await onSaveContext({
                    description: contextDraft.description || undefined,
                    address: contextDraft.address || undefined,
                    municipality: contextDraft.municipality || undefined,
                    sector: contextDraft.sector || undefined,
                    requestedWindowStartAt: toIsoFromLocalDateAndTime(
                      contextDraft.requestedWindowStartDate,
                      contextDraft.requestedWindowStartTime,
                    ),
                    requestedWindowEndAt: toIsoFromLocalDateAndTime(
                      contextDraft.requestedWindowEndDate,
                      contextDraft.requestedWindowEndTime,
                    ),
                  });
                } catch (error) {
                  setContextError(error instanceof Error ? error.message : 'Error inesperado.');
                }
              }}
            >
              Guardar contexto
            </Button>
          </div>
        )}
      </div>
    </PortalPanel>
  );
}
