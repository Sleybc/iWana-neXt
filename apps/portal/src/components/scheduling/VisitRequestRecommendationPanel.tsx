'use client';

import { useEffect, useId, useState } from 'react';
import { AlertTriangle, CalendarPlus, ChevronDown, Clock3, Sparkles, X } from 'lucide-react';
import { Badge, Button, DatePicker, Input, OperationalSidePeek, Select } from '@iwana/ui';
import type {
  InternalUser,
  UpdateWfmVisitRequestContextDto,
  WfmScheduleRecommendation,
  WfmVisitRequest,
} from '@/lib/api-client';
import { PortalAlert, PortalEmptyState } from '@/components/shared/portal-ui';
import { TimeFieldSelect } from '@/components/shared/TimeFieldSelect';
import {
  filterRecommendationCandidateUsers,
  formatWfmDateTime,
  getTechnicianDisplayName,
  getWorkOrderPriorityLabel,
  getWorkOrderPriorityVariant,
  getWfmWorkTypeLabel,
} from './scheduling-ui';
import {
  buildScheduleWindow,
  getDefaultDurationForWorkType,
  getScheduleTimeOptionsForWorkType,
  isScheduleStartInPast,
  isScheduleWindowAllowedForWorkType,
  SCHEDULE_PAST_NOT_ALLOWED_MESSAGE,
  toDateFromLocalDateValue,
  toIsoFromLocalDateAndTime,
  toLocalDateTimeParts,
  toLocalDateValue,
  toLocalTimeValue,
  QUICK_DURATION_OPTIONS,
} from './schedule-event-time';
import { getOperatingWindowMessage, useOperatingWindow } from './useOperatingWindow';
import {
  formatVisitRequestLocationLabel,
  formatVisitRequestTerritory,
  getVisitRequestMissingFields,
  getVisitRequestOriginLabel,
  getVisitRequestPresentationStatus,
  getVisitRequestReferenceLabel,
  getVisitRequestStatusDescription,
  getVisitRequestStatusLabel,
  getVisitRequestStatusVariant,
  isTerminalVisitRequestStatus,
} from './pending-visits-ui';
import type { MatrixCellSelection, MatrixManualScheduleDraft } from './matrix-scheduling-selection';
import { DispatchDrawerPortal, type DispatchDrawerScope } from './DispatchDrawerPortal';

interface VisitRequestRecommendationPanelProps {
  selectedVisitRequest: WfmVisitRequest | null;
  customerDisplayName?: string | null;
  techniciansById: Map<string, InternalUser>;
  recommendations: WfmScheduleRecommendation[];
  selectedRecommendationId: string | null;
  matrixCellSelection?: MatrixCellSelection | null;
  manualSelectionDraft?: MatrixManualScheduleDraft | null;
  isLoadingRecommendations: boolean;
  recommendationError: string | null;
  isSavingContext: boolean;
  isLoadingEligibleAssignees?: boolean;
  onRecommend: (payload: VisitRecommendationDraft) => Promise<void>;
  onSelectRecommendation: (recommendationId: string) => void;
  onCancelRecommendations?: () => void;
  onManualSelectionChange?: (draft: MatrixManualScheduleDraft | null) => void;
  onSaveContext: (payload: UpdateWfmVisitRequestContextDto) => Promise<void>;
  onOpenConfirm: () => void;
  presentation?: 'drawer' | 'inline' | 'peek';
  compactRail?: boolean;
  drawerScope?: DispatchDrawerScope;
  open?: boolean;
  onClose?: () => void;
  detailedAgendaHref?: string | null;
  detailedAgendaFallbackMessage?: string | null;
}

export interface ManualSchedulePayload {
  assignedUserId: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
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

function toNullableTrimmedText(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toNullableIsoFromLocalDateAndTime(dateLocal: string, timeLocal: string): string | null {
  return toIsoFromLocalDateAndTime(dateLocal, timeLocal) ?? null;
}

function formatDurationLabel(value: string): string {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes < 1) {
    return 'Sin definir';
  }

  const hours = Math.floor(minutes / 60);
  const remainderMinutes = minutes % 60;

  if (hours === 0) {
    return `${remainderMinutes} min`;
  }

  return remainderMinutes > 0 ? `${hours} h ${remainderMinutes} min` : `${hours} h`;
}

function buildContextPayload(draft: ContextDraft): UpdateWfmVisitRequestContextDto {
  return {
    description: toNullableTrimmedText(draft.description),
    address: toNullableTrimmedText(draft.address),
    municipality: toNullableTrimmedText(draft.municipality),
    sector: toNullableTrimmedText(draft.sector),
    requestedWindowStartAt: toNullableIsoFromLocalDateAndTime(
      draft.requestedWindowStartDate,
      draft.requestedWindowStartTime,
    ),
    requestedWindowEndAt: toNullableIsoFromLocalDateAndTime(
      draft.requestedWindowEndDate,
      draft.requestedWindowEndTime,
    ),
  };
}

const quickDurationOptions = [
  { minutes: 30, label: '30 min' },
  ...QUICK_DURATION_OPTIONS,
  { minutes: 240, label: '4 h' },
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
  customerDisplayName,
  techniciansById,
  recommendations,
  selectedRecommendationId,
  matrixCellSelection = null,
  manualSelectionDraft = null,
  isLoadingRecommendations,
  recommendationError,
  isSavingContext,
  isLoadingEligibleAssignees = false,
  onRecommend,
  onSelectRecommendation,
  onCancelRecommendations,
  onManualSelectionChange = () => undefined,
  onSaveContext,
  onOpenConfirm,
  presentation = 'drawer',
  compactRail = false,
  drawerScope = 'mobile',
  open = true,
  onClose,
  detailedAgendaHref = null,
  detailedAgendaFallbackMessage = null,
}: VisitRequestRecommendationPanelProps) {
  const [contextDraft, setContextDraft] = useState<ContextDraft>(() => toContextDraft(null));
  const [contextError, setContextError] = useState<string | null>(null);
  const [durationMinutes, setDurationMinutes] = useState('');
  const [searchHorizonDays, setSearchHorizonDays] = useState('7');
  const [isContextExpanded, setIsContextExpanded] = useState(false);
  const [isManualFormOpen, setIsManualFormOpen] = useState(false);
  const [manualTechnicianId, setManualTechnicianId] = useState('');
  const [manualDate, setManualDate] = useState('');
  const [manualStartTime, setManualStartTime] = useState('');
  const [manualErrors, setManualErrors] = useState<string[]>([]);
  const durationInputId = useId();
  const [durationMode, setDurationMode] = useState<'quick' | 'custom'>('quick');
  const durationValue = Number(durationMinutes);
  const hasDurationSelection = Number.isFinite(durationValue) && durationValue >= 15;
  const durationHours = Math.floor(Math.max(durationValue || 0, 0) / 60);
  const durationRemainderMinutes = Math.max(durationValue || 0, 0) % 60;
  const { operatingWindow, isLoadingOperatingWindow, operatingWindowError } = useOperatingWindow({
    workType: selectedVisitRequest?.workType,
    dateLocal: contextDraft.requestedWindowStartDate || null,
    organizationSiteId: selectedVisitRequest?.organizationSiteId ?? null,
    enabled: Boolean(selectedVisitRequest),
  });
  const operatingWindowMessage = getOperatingWindowMessage(operatingWindow);
  const requestTimeOptions = getScheduleTimeOptionsForWorkType(
    selectedVisitRequest?.workType,
    operatingWindow,
  );
  const {
    operatingWindow: manualOperatingWindow,
    isLoadingOperatingWindow: isLoadingManualOperatingWindow,
    operatingWindowError: manualOperatingWindowError,
  } = useOperatingWindow({
    workType: selectedVisitRequest?.workType,
    dateLocal: manualDate || null,
    organizationSiteId: selectedVisitRequest?.organizationSiteId ?? null,
    technicianId: manualTechnicianId || null,
    enabled: Boolean(selectedVisitRequest) && (isManualFormOpen || Boolean(manualSelectionDraft)),
  });
  const manualOperatingWindowMessage = getOperatingWindowMessage(manualOperatingWindow);
  const manualSuggestedTimeOptions =
    manualDate &&
    manualTechnicianId &&
    selectedVisitRequest?.workType === 'INSTALLATION' &&
    manualOperatingWindow?.status === 'OPEN'
      ? getScheduleTimeOptionsForWorkType(
          selectedVisitRequest.workType,
          manualOperatingWindow,
          durationValue,
        ).slice(0, 16)
      : [];

  const manualEndPreview = (() => {
    if (!manualStartTime || !durationMinutes) {
      return null;
    }
    const duration = durationValue;
    if (!Number.isFinite(duration) || duration <= 0) {
      return null;
    }
    const startIso = toIsoFromLocalDateAndTime(manualDate, manualStartTime);
    if (!startIso) {
      return null;
    }
    const endDate = new Date(new Date(startIso).getTime() + duration * 60 * 1000);
    if (Number.isNaN(endDate.getTime())) {
      return null;
    }
    return formatWfmDateTime(endDate.toISOString());
  })();
  const manualScheduleWindow = buildScheduleWindow(manualDate, manualStartTime, durationValue);
  const manualWindowWarning =
    selectedVisitRequest?.workType === 'INSTALLATION' && manualDate
      ? manualOperatingWindow?.status === 'CLOSED'
        ? (manualOperatingWindowMessage ??
          'La fecha seleccionada no tiene una ventana operativa habilitada.')
        : manualScheduleWindow &&
            !isScheduleWindowAllowedForWorkType(
              selectedVisitRequest.workType,
              {
                startAt: manualScheduleWindow.startAt,
                endAt: manualScheduleWindow.endAt,
              },
              manualOperatingWindow,
            )
          ? 'La hora elegida queda fuera de la ventana operativa configurada para instalaciones.'
          : null
      : null;

  function buildManualSelectionForConfirm():
    | { draft: MatrixManualScheduleDraft; errors: string[] }
    | { draft: null; errors: string[] } {
    const errors: string[] = [];

    if (missingFields.length > 0) {
      errors.push('Completa dirección y municipio antes de agendar manualmente.');
    }

    if (!manualTechnicianId) {
      errors.push('Selecciona un técnico para continuar.');
    }

    if (!manualDate || !toDateFromLocalDateValue(manualDate)) {
      errors.push('Define una fecha válida para la agenda manual.');
    }

    if (!manualStartTime) {
      errors.push('Define una hora de inicio válida para la agenda manual.');
    }

    if (!durationMinutes || !Number.isFinite(durationValue) || durationValue < 15) {
      errors.push('La duración mínima es de 15 minutos.');
    }

    if (errors.length > 0) {
      return { draft: null, errors };
    }

    const startIso = toIsoFromLocalDateAndTime(manualDate, manualStartTime);
    if (!startIso) {
      return { draft: null, errors: ['Define una hora de inicio válida para la agenda manual.'] };
    }

    if (isScheduleStartInPast(startIso)) {
      errors.push(SCHEDULE_PAST_NOT_ALLOWED_MESSAGE);
      return { draft: null, errors };
    }

    const selectedRecommendation = recommendations.find(
      (recommendation) => getRecommendationKey(recommendation) === selectedRecommendationId,
    );
    const source =
      selectedRecommendation &&
      selectedRecommendation.technicianId === manualTechnicianId &&
      toLocalDateValue(selectedRecommendation.scheduledStartAt) === manualDate &&
      toLocalTimeValue(selectedRecommendation.scheduledStartAt) === manualStartTime
        ? 'recommendation'
        : 'manual';

    return {
      draft: {
        technicianId: manualTechnicianId,
        date: manualDate,
        dayLabel: matrixCellSelection?.dayLabel ?? manualSelectionDraft?.dayLabel ?? manualDate,
        availabilityLabel:
          matrixCellSelection?.availabilityLabel ??
          manualSelectionDraft?.availabilityLabel ??
          'Selección manual en revisión',
        riskMessages: matrixCellSelection?.riskMessages ?? manualSelectionDraft?.riskMessages ?? [],
        startTime: manualStartTime,
        duration: durationMinutes,
        source,
      },
      errors: [],
    };
  }

  const handleManualSubmit = () => {
    if (!selectedVisitRequest) {
      return;
    }

    const result = buildManualSelectionForConfirm();
    if (!result.draft || result.errors.length > 0) {
      setManualErrors(result.errors);
      return;
    }

    setManualErrors([]);
    onManualSelectionChange(result.draft);
    onOpenConfirm();
  };

  useEffect(() => {
    setContextDraft(toContextDraft(selectedVisitRequest));
    setContextError(null);
  }, [selectedVisitRequest]);

  useEffect(() => {
    const nextMissingFields = selectedVisitRequest
      ? getVisitRequestMissingFields(selectedVisitRequest)
      : [];

    const defaultDuration = selectedVisitRequest
      ? String(getDefaultDurationForWorkType(selectedVisitRequest.workType))
      : '';

    setDurationMinutes(defaultDuration);
    setSearchHorizonDays('7');
    setIsContextExpanded(nextMissingFields.length > 0);
    setIsManualFormOpen(false);
    setManualTechnicianId('');
    setManualDate(
      selectedVisitRequest?.requestedWindowStartAt
        ? toLocalDateValue(selectedVisitRequest.requestedWindowStartAt)
        : '',
    );
    setManualStartTime('');
    setDurationMode(
      quickDurationOptions.some((option) => option.minutes === Number(defaultDuration))
        ? 'quick'
        : 'custom',
    );
    setManualErrors([]);
  }, [selectedVisitRequest?.id, selectedVisitRequest?.workType]);

  useEffect(() => {
    if (!manualSelectionDraft) {
      return;
    }

    setIsManualFormOpen(true);
    setManualTechnicianId(manualSelectionDraft.technicianId);
    setManualDate(manualSelectionDraft.date);
    setManualStartTime(manualSelectionDraft.startTime);
    setDurationMinutes(manualSelectionDraft.duration);
    setDurationMode(
      quickDurationOptions.some(
        (option) => option.minutes === Number(manualSelectionDraft.duration),
      )
        ? 'quick'
        : 'custom',
    );
    setManualErrors([]);
  }, [
    manualSelectionDraft?.date,
    manualSelectionDraft?.duration,
    manualSelectionDraft?.source,
    manualSelectionDraft?.startTime,
    manualSelectionDraft?.technicianId,
  ]);

  useEffect(() => {
    if (!selectedVisitRequest) {
      return;
    }

    if (!manualTechnicianId && !manualDate && !manualStartTime) {
      if (manualSelectionDraft) {
        onManualSelectionChange(null);
      }
      return;
    }

    if (!manualTechnicianId || !manualDate) {
      return;
    }

    const selectedRecommendation = recommendations.find(
      (recommendation) => getRecommendationKey(recommendation) === selectedRecommendationId,
    );
    const source =
      selectedRecommendation &&
      selectedRecommendation.technicianId === manualTechnicianId &&
      toLocalDateValue(selectedRecommendation.scheduledStartAt) === manualDate &&
      toLocalTimeValue(selectedRecommendation.scheduledStartAt) === manualStartTime
        ? 'recommendation'
        : manualSelectionDraft?.source === 'recommendation' &&
            manualSelectionDraft.technicianId === manualTechnicianId &&
            manualSelectionDraft.date === manualDate &&
            manualSelectionDraft.startTime === manualStartTime
          ? 'recommendation'
          : 'manual';

    const nextDraft: MatrixManualScheduleDraft = {
      technicianId: manualTechnicianId,
      date: manualDate,
      dayLabel: matrixCellSelection?.dayLabel ?? manualSelectionDraft?.dayLabel ?? manualDate,
      availabilityLabel:
        matrixCellSelection?.availabilityLabel ??
        manualSelectionDraft?.availabilityLabel ??
        'Selección manual en revisión',
      riskMessages: matrixCellSelection?.riskMessages ?? manualSelectionDraft?.riskMessages ?? [],
      startTime: manualStartTime,
      duration: durationMinutes,
      source,
    };

    if (
      manualSelectionDraft &&
      manualSelectionDraft.technicianId === nextDraft.technicianId &&
      manualSelectionDraft.date === nextDraft.date &&
      manualSelectionDraft.dayLabel === nextDraft.dayLabel &&
      manualSelectionDraft.availabilityLabel === nextDraft.availabilityLabel &&
      manualSelectionDraft.startTime === nextDraft.startTime &&
      manualSelectionDraft.duration === nextDraft.duration &&
      manualSelectionDraft.source === nextDraft.source &&
      manualSelectionDraft.riskMessages.join('||') === nextDraft.riskMessages.join('||')
    ) {
      return;
    }

    onManualSelectionChange(nextDraft);
  }, [
    manualDate,
    durationMinutes,
    manualStartTime,
    manualTechnicianId,
    manualSelectionDraft,
    matrixCellSelection?.availabilityLabel,
    matrixCellSelection?.dayLabel,
    matrixCellSelection?.riskMessages,
    recommendations,
    selectedRecommendationId,
    selectedVisitRequest,
  ]);

  if (!selectedVisitRequest) {
    return null;
  }

  const missingFields = getVisitRequestMissingFields(selectedVisitRequest);
  const presentationStatus = getVisitRequestPresentationStatus(selectedVisitRequest);
  const isTerminalVisitRequest = isTerminalVisitRequestStatus(selectedVisitRequest.status);
  const selectedMatrixTechnician = matrixCellSelection
    ? (techniciansById.get(matrixCellSelection.technicianId) ?? null)
    : null;
  const selectedRecommendation = recommendations.find(
    (recommendation) => getRecommendationKey(recommendation) === selectedRecommendationId,
  );
  const eligibleManualTechnicians = filterRecommendationCandidateUsers(
    Array.from(techniciansById.values()),
  );
  const hasReadyManualSelection = Boolean(
    manualSelectionDraft?.technicianId &&
    manualSelectionDraft.date &&
    manualSelectionDraft.startTime &&
    manualSelectionDraft.duration &&
    Number(manualSelectionDraft.duration) >= 15,
  );
  const displayTitle =
    customerDisplayName && selectedVisitRequest.originContext === 'CRM'
      ? customerDisplayName
      : selectedVisitRequest.title;
  const footerLabel = selectedRecommendation
    ? 'Confirmar franja seleccionada'
    : hasReadyManualSelection
      ? 'Confirmar agenda seleccionada'
      : 'Selecciona una franja para continuar';
  const isPeek = presentation === 'peek';
  const dispatchDescription =
    customerDisplayName ?? getVisitRequestReferenceLabel(selectedVisitRequest);

  const footerContent = (
    <>
      {detailedAgendaHref ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Si ninguna recomendación sirve, puedes{' '}
          <a
            href={detailedAgendaHref}
            className="font-medium text-iwana-secondary-700 underline-offset-4 hover:underline dark:text-iwana-secondary-400"
          >
            abrir la agenda detallada
          </a>{' '}
          para buscar otra opción manualmente.
        </p>
      ) : detailedAgendaFallbackMessage ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">{detailedAgendaFallbackMessage}</p>
      ) : null}
      <Button
        type="button"
        className="min-h-11 w-full"
        variant="primary"
        disabled={(!selectedRecommendation && !hasReadyManualSelection) || isTerminalVisitRequest}
        onClick={onOpenConfirm}
      >
        <Clock3 className="h-4 w-4" aria-hidden="true" />
        {footerLabel}
      </Button>
    </>
  );

  const panel = (
    <aside
      role={presentation === 'drawer' ? 'dialog' : undefined}
      aria-modal={presentation === 'drawer' ? true : undefined}
      aria-labelledby={presentation === 'drawer' ? 'visit-request-dispatch-title' : undefined}
      className={
        isPeek
          ? 'contents'
          : presentation === 'inline'
            ? compactRail
              ? 'flex h-full min-h-[520px] flex-1 flex-col overflow-hidden bg-white dark:bg-dark-surface-2'
              : 'flex h-full min-h-[720px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-dark-border dark:bg-dark-surface-2'
            : 'relative z-10 flex h-dvh w-full max-w-[560px] flex-col border-l border-gray-200 bg-white shadow-2xl dark:border-dark-border dark:bg-dark-surface-1'
      }
    >
      {!isPeek ? (
        <header className="border-b border-gray-200 px-3 py-3 dark:border-dark-border">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
                Despacho de la solicitud
              </p>
              <p
                id="visit-request-dispatch-title"
                className="mt-1 text-base font-semibold text-gray-900 dark:text-white"
              >
                {displayTitle}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {customerDisplayName ?? getVisitRequestReferenceLabel(selectedVisitRequest)}
              </p>
              {customerDisplayName && (
                <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-400">
                  {getVisitRequestReferenceLabel(selectedVisitRequest)}
                </p>
              )}
            </div>
            {presentation === 'drawer' || onClose ? (
              <button
                type="button"
                onClick={() => onClose?.()}
                className="rounded-full border border-gray-200 p-1.5 text-gray-500 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary dark:border-dark-border dark:text-gray-300 dark:hover:bg-dark-surface-3"
                aria-label="Cerrar panel"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {presentationStatus === 'NEEDS_CONTEXT' && missingFields.length > 0
              ? `Para recomendar faltan: ${missingFields.join(', ')}.`
              : getVisitRequestStatusDescription(presentationStatus)}
          </p>
        </header>
      ) : null}

      <div className={isPeek ? 'space-y-3' : 'flex-1 space-y-3 overflow-y-auto p-3'}>
        <div className="space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-dark-border dark:bg-dark-surface-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <Badge variant={getVisitRequestStatusVariant(presentationStatus)}>
              {getVisitRequestStatusLabel(presentationStatus)}
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

          <dl className="grid gap-2 text-sm text-gray-600 dark:text-gray-300">
            <div className="border-t border-gray-200 pt-3 dark:border-dark-border">
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                Dirección operativa
              </dt>
              <dd className="mt-1 text-sm text-gray-700 dark:text-gray-200">
                {selectedVisitRequest.address || 'Sin dirección operativa'}
              </dd>
            </div>
            <div className="border-t border-gray-200 pt-3 dark:border-dark-border">
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                Territorio
              </dt>
              <dd className="mt-1 text-sm text-gray-700 dark:text-gray-200">
                {formatVisitRequestTerritory(
                  selectedVisitRequest.municipality,
                  selectedVisitRequest.sector,
                )}
              </dd>
            </div>
            <div className="border-t border-gray-200 pt-3 dark:border-dark-border">
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                Nota operativa
              </dt>
              <dd className="mt-1 text-sm text-gray-700 dark:text-gray-200">
                {selectedVisitRequest.description || 'Sin nota operativa'}
              </dd>
            </div>
          </dl>
        </div>

        {matrixCellSelection && (
          <div className="space-y-3 rounded-2xl border border-iwana-secondary-200 bg-iwana-surface-soft p-4 dark:border-iwana-secondary-900/30 dark:bg-dark-surface-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
                  Selección desde matriz
                </p>
                <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                  {selectedMatrixTechnician
                    ? getTechnicianDisplayName(selectedMatrixTechnician)
                    : matrixCellSelection.technicianId}{' '}
                  · {matrixCellSelection.dayLabel}
                </p>
              </div>
              <Badge variant={matrixCellSelection.riskMessages.length > 0 ? 'warning' : 'info'}>
                {matrixCellSelection.riskMessages.length > 0
                  ? 'Requiere validación'
                  : 'Lista para afinar'}
              </Badge>
            </div>
            <div className="grid gap-2 text-sm text-gray-600 dark:text-gray-300">
              <p>
                <span className="font-semibold text-gray-900 dark:text-white">Estado del día:</span>{' '}
                {matrixCellSelection.availabilityLabel}
              </p>
              {manualSelectionDraft?.startTime && (
                <p>
                  <span className="font-semibold text-gray-900 dark:text-white">Hora elegida:</span>{' '}
                  {manualSelectionDraft.startTime}
                  {manualSelectionDraft.source === 'manual' ? ' · libre' : ' · sugerida'}
                </p>
              )}
            </div>
            {manualSelectionDraft?.source === 'manual' && (
              <PortalAlert
                variant="warning"
                title="Hora definida manualmente"
                description="La disponibilidad definitiva se valida al confirmar contra ventana operativa y conflictos del técnico."
              />
            )}
            {matrixCellSelection.riskMessages.length > 0 && (
              <PortalAlert
                variant="warning"
                title="Advertencias del día seleccionado"
                description={
                  <ul className="list-disc space-y-1 pl-5">
                    {matrixCellSelection.riskMessages.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                }
              />
            )}
          </div>
        )}

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

        <div className="space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-dark-border">
          <div className="flex items-start gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-iwana-secondary-700 dark:text-iwana-secondary-400">
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
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Duración estimada
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Duración rápida o personalizada.
                </p>
              </div>

              <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white p-1 dark:border-dark-border-2 dark:bg-dark-surface-2">
                <Button
                  type="button"
                  variant={durationMode === 'quick' ? 'primary' : 'ghost'}
                  size="sm"
                  aria-pressed={durationMode === 'quick'}
                  disabled={isTerminalVisitRequest}
                  onClick={() => setDurationMode('quick')}
                >
                  Duración rápida
                </Button>
                <Button
                  type="button"
                  variant={durationMode === 'custom' ? 'primary' : 'ghost'}
                  size="sm"
                  aria-pressed={durationMode === 'custom'}
                  disabled={isTerminalVisitRequest}
                  onClick={() => setDurationMode('custom')}
                >
                  Personalizada
                </Button>
              </div>
            </div>

            {durationMode === 'quick' ? (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Duración rápida">
                {quickDurationOptions.map((option) => {
                  const isActive = durationValue === option.minutes;

                  return (
                    <Button
                      key={option.minutes}
                      type="button"
                      variant={isActive ? 'primary' : 'secondary'}
                      size="sm"
                      aria-pressed={isActive}
                      disabled={isTerminalVisitRequest}
                      onClick={() => {
                        setDurationMinutes(String(option.minutes));
                        setManualErrors([]);
                      }}
                    >
                      {option.label}
                    </Button>
                  );
                })}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  id={`${durationInputId}-hours`}
                  type="number"
                  min={0}
                  max={12}
                  step={1}
                  label="Horas"
                  value={String(durationHours)}
                  disabled={isTerminalVisitRequest}
                  onChange={(event) => {
                    const nextHours = Number.parseInt(event.target.value || '0', 10);
                    const safeHours = Number.isNaN(nextHours)
                      ? 0
                      : Math.min(Math.max(nextHours, 0), 12);
                    setDurationMinutes(String(safeHours * 60 + durationRemainderMinutes));
                    setManualErrors([]);
                  }}
                />
                <Input
                  id={`${durationInputId}-minutes`}
                  type="number"
                  min={0}
                  max={45}
                  step={15}
                  label="Minutos"
                  value={String(durationRemainderMinutes)}
                  disabled={isTerminalVisitRequest}
                  onChange={(event) => {
                    const nextMinutes = Number.parseInt(event.target.value || '0', 10);
                    const normalizedMinutes = Number.isNaN(nextMinutes)
                      ? 0
                      : Math.min(Math.max(nextMinutes, 0), 45);
                    const roundedMinutes = Math.round(normalizedMinutes / 15) * 15;
                    setDurationMinutes(String(durationHours * 60 + roundedMinutes));
                    setManualErrors([]);
                  }}
                />
              </div>
            )}

            <Select
              id="visit-request-search-horizon"
              label="Horizonte de búsqueda"
              value={searchHorizonDays}
              disabled={isTerminalVisitRequest}
              options={horizonOptions}
              onChange={(event) => setSearchHorizonDays(event.target.value)}
            />
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-300">
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
          </p>
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={async () => {
                try {
                  setContextError(null);
                  await onSaveContext(buildContextPayload(contextDraft));
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
              loading={isLoadingRecommendations || isLoadingEligibleAssignees}
              disabled={
                missingFields.length > 0 ||
                isTerminalVisitRequest ||
                !hasDurationSelection ||
                isLoadingEligibleAssignees ||
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
            <div className="space-y-2">
              {recommendations.map((recommendation) => {
                const technician = techniciansById.get(recommendation.technicianId) ?? null;
                const recommendationKey = getRecommendationKey(recommendation);
                const isSelected = recommendationKey === selectedRecommendationId;

                return (
                  <button
                    key={`${recommendation.technicianId}-${recommendation.scheduledStartAt}`}
                    type="button"
                    onClick={() => onSelectRecommendation(recommendationKey)}
                    className={`w-full rounded-xl border px-3 py-2.5 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-2 ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/30'
                        : 'border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50 dark:border-dark-border dark:bg-dark-surface-2 dark:hover:bg-dark-surface-3'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          {technician
                            ? getTechnicianDisplayName(technician)
                            : recommendation.technicianId}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {formatWfmDateTime(recommendation.scheduledStartAt)} -{' '}
                          {formatWfmDateTime(recommendation.scheduledEndAt)}
                        </p>
                      </div>
                      <span className="whitespace-nowrap text-xs font-medium text-emerald-700 dark:text-emerald-400">
                        Puntuación: {recommendation.score}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                      <span>
                        {recommendation.distanceKm !== null
                          ? `${recommendation.distanceKm.toFixed(1)} km`
                          : 'Sin georreferencia'}
                      </span>
                      <span aria-hidden="true">•</span>
                      <span>Carga: {recommendation.totalScheduledMinutes} min</span>
                      {recommendation.labels.length > 0 && (
                        <>
                          <span aria-hidden="true">•</span>
                          <span className="italic">{recommendation.labels.join(', ')}</span>
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
              {onCancelRecommendations ? (
                <div className="flex justify-end border-t border-gray-100 pt-2 dark:border-dark-border">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onCancelRecommendations}
                    aria-label="Cancelar recomendaciones"
                  >
                    Cancelar recomendaciones
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-dark-border">
          <button
            type="button"
            className="flex w-full items-start justify-between gap-3 rounded-2xl text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-2 dark:hover:bg-dark-surface-3"
            aria-expanded={isManualFormOpen}
            aria-controls="visit-request-manual-schedule-panel"
            onClick={() => {
              setIsManualFormOpen((current) => !current);
              setManualErrors([]);
            }}
          >
            <div>
              <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                Salida directa
              </p>
              <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                Prefiero agendar manualmente
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Define técnico, fecha, hora de inicio y duración para crear la agenda sin pasar por
                las recomendaciones.
              </p>
            </div>
            <ChevronDown
              className={`mt-1 h-4 w-4 shrink-0 text-gray-400 transition-opacity duration-200 ${
                isManualFormOpen ? 'opacity-60' : 'opacity-100'
              }`}
              aria-hidden="true"
            />
          </button>

          {isManualFormOpen && (
            <div
              id="visit-request-manual-schedule-panel"
              className="space-y-3 border-t border-gray-100 pt-3 dark:border-dark-border"
            >
              {missingFields.length > 0 && (
                <PortalAlert
                  variant="warning"
                  title="Completa contexto antes de agendar manualmente"
                  description={`Aún faltan: ${missingFields.join(', ')}.`}
                  icon={AlertTriangle}
                />
              )}

              {selectedVisitRequest.workType === 'INSTALLATION' &&
                !operatingWindowError &&
                operatingWindow?.status === 'CLOSED' && (
                  <PortalAlert
                    variant="warning"
                    title="Fecha cerrada para agendar"
                    description={
                      operatingWindowMessage ??
                      'La fecha seleccionada no tiene una ventana operativa habilitada.'
                    }
                  />
                )}

              {selectedVisitRequest.workType === 'INSTALLATION' && manualOperatingWindowError && (
                <PortalAlert
                  variant="warning"
                  title="No fue posible validar la ventana operativa del técnico"
                  description={manualOperatingWindowError}
                />
              )}

              {selectedVisitRequest.workType === 'INSTALLATION' &&
                !manualOperatingWindowError &&
                manualWindowWarning && (
                  <PortalAlert
                    variant="warning"
                    title="La hora requiere validación adicional"
                    description={manualWindowWarning}
                  />
                )}

              <Select
                id="visit-request-manual-technician"
                label="Técnico"
                value={manualTechnicianId}
                disabled={isTerminalVisitRequest}
                placeholder="Selecciona un técnico"
                options={eligibleManualTechnicians.map((technician) => ({
                  value: technician.id,
                  label: getTechnicianDisplayName(technician),
                }))}
                onChange={(event) => {
                  setManualTechnicianId(event.target.value);
                  setManualErrors([]);
                }}
              />

              <div className="grid gap-3">
                <DatePicker
                  id="visit-request-manual-date"
                  label="Fecha"
                  value={toDateFromLocalDateValue(manualDate)}
                  disabled={isTerminalVisitRequest}
                  onChange={(date) => {
                    setManualDate(date ? toLocalDateValue(date) : '');
                    setManualErrors([]);
                  }}
                />
                <div className="flex w-full flex-col gap-1.5">
                  <label
                    htmlFor="visit-request-manual-start-time"
                    className="text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Hora de inicio
                  </label>
                  <TimeFieldSelect
                    id="visit-request-manual-start-time"
                    value={manualStartTime}
                    disabled={isTerminalVisitRequest}
                    ariaLabel="Hora de inicio"
                    onChange={(value) => {
                      setManualStartTime(value);
                      setManualErrors([]);
                    }}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-iwana-surface-soft px-3 py-2.5 dark:border-dark-border dark:bg-dark-surface-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                      Duración aplicada
                    </p>
                    <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                      {formatDurationLabel(durationMinutes)}
                    </p>
                  </div>
                  <p className="text-right text-xs text-gray-500 dark:text-gray-400">
                    Definida en el paso 1
                  </p>
                </div>
              </div>

              {(manualSuggestedTimeOptions.length > 0 || isLoadingManualOperatingWindow) && (
                <div className="space-y-2 rounded-2xl border border-gray-200 bg-gray-50/60 p-3 dark:border-dark-border dark:bg-dark-surface-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                      Horas sugeridas
                    </p>
                    {selectedVisitRequest.workType === 'INSTALLATION' &&
                      isLoadingManualOperatingWindow && (
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">
                          Validando ventana...
                        </span>
                      )}
                  </div>
                  {manualSuggestedTimeOptions.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {manualSuggestedTimeOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary ${
                            manualStartTime === option.value
                              ? 'border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-100'
                              : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-dark-border dark:bg-dark-surface-1 dark:text-gray-200 dark:hover:bg-dark-surface-2'
                          }`}
                          onClick={() => {
                            setManualStartTime(option.value);
                            setManualErrors([]);
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {manualEndPreview && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Hora de fin calculada: {manualEndPreview}
                </p>
              )}

              {manualErrors.length > 0 && (
                <PortalAlert
                  variant="error"
                  title="No se pudo confirmar la agenda manual"
                  description={
                    <ul className="list-disc space-y-1 pl-5">
                      {manualErrors.map((message) => (
                        <li key={message}>{message}</li>
                      ))}
                    </ul>
                  }
                />
              )}

              <div className="flex justify-end">
                <Button
                  type="button"
                  disabled={isTerminalVisitRequest}
                  onClick={handleManualSubmit}
                >
                  <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                  Revisar agenda manual
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 p-4 dark:border-dark-border">
          <button
            type="button"
            className="flex w-full items-start justify-between gap-3 rounded-2xl text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-2 dark:hover:bg-dark-surface-3"
            aria-expanded={isContextExpanded}
            aria-controls="visit-request-context-panel"
            onClick={() => setIsContextExpanded((current) => !current)}
          >
            <div>
              <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                Paso 2
              </p>
              <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                Ajustes de contexto (opcional)
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {missingFields.length > 0
                  ? `Pendiente por completar: ${missingFields.join(', ')}.`
                  : 'Úsalo solo si necesitas ajustar dirección, territorio, ventana o nota operativa antes de confirmar.'}
              </p>
            </div>
            <ChevronDown
              className={`mt-1 h-4 w-4 shrink-0 text-gray-400 transition-opacity duration-200 ${
                isContextExpanded ? 'opacity-60' : 'opacity-100'
              }`}
              aria-hidden="true"
            />
          </button>

          {isContextExpanded && (
            <div
              id="visit-request-context-panel"
              className="mt-3 space-y-3 border-t border-gray-100 pt-3 dark:border-dark-border"
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
                    setContextDraft((current) => ({
                      ...current,
                      municipality: event.target.value,
                    }))
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
              <div className="grid gap-3 rounded-lg border border-gray-200 p-3 dark:border-dark-border">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                  Franja preferida del cliente (opcional)
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Completa este bloque solo si el cliente pidió una franja específica.
                </p>
                <div className="grid gap-3">
                  <DatePicker
                    id="visit-request-window-start-date"
                    label="Desde (fecha)"
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
                    label="Desde qué hora puede recibir la visita"
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
                    label="Hasta (fecha)"
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
                    label="Hasta qué hora puede recibir la visita"
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
                    setContextDraft((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  rows={3}
                  className="rounded-2xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-iwana-primary dark:border-dark-border dark:bg-dark-surface-2 dark:text-white"
                />
              </label>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isTerminalVisitRequest || isSavingContext}
                  onClick={() => {
                    setContextError(null);
                    setContextDraft((current) => ({
                      ...current,
                      requestedWindowStartDate: '',
                      requestedWindowStartTime: '',
                      requestedWindowEndDate: '',
                      requestedWindowEndTime: '',
                    }));
                  }}
                >
                  Limpiar formulario
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  loading={isSavingContext}
                  disabled={isTerminalVisitRequest}
                  onClick={async () => {
                    try {
                      setContextError(null);
                      await onSaveContext(buildContextPayload(contextDraft));
                    } catch (error) {
                      setContextError(error instanceof Error ? error.message : 'Error inesperado.');
                    }
                  }}
                >
                  Guardar contexto
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {!isPeek ? (
        <footer className="space-y-3 border-t border-gray-200 p-3 dark:border-dark-border">
          {footerContent}
        </footer>
      ) : null}
    </aside>
  );

  if (isPeek) {
    return (
      <OperationalSidePeek
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            onClose?.();
          }
        }}
        title={displayTitle}
        description={dispatchDescription}
        eyebrow="Despacho de la solicitud"
        busy={isSavingContext}
        footer={<div className="space-y-3">{footerContent}</div>}
      >
        {panel}
      </OperationalSidePeek>
    );
  }

  if (presentation === 'inline') {
    return panel;
  }

  return (
    <DispatchDrawerPortal open={open} onClose={() => onClose?.()} drawerScope={drawerScope}>
      {panel}
    </DispatchDrawerPortal>
  );
}
