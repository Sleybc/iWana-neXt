'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, ClipboardList, X } from 'lucide-react';
import { Badge, Button, Input } from '@iwana/ui';
import type { UpdateWfmVisitRequestContextDto, WfmVisitRequest } from '@/lib/api-client';
import { PortalAlert, PortalEmptyState, PortalPanel } from '@/components/shared/portal-ui';
import { getOperatingWindowMessage, useOperatingWindow } from './useOperatingWindow';
import {
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
import {
  getWorkOrderPriorityLabel,
  getWorkOrderPriorityVariant,
  getWfmWorkTypeLabel,
} from './scheduling-ui';
import { toIsoFromLocalDateAndTime, toLocalDateTimeParts } from './schedule-event-time';
import { DispatchDrawerPortal, type DispatchDrawerScope } from './DispatchDrawerPortal';

interface PendingVisitRequestDetailPanelProps {
  selectedVisitRequest: WfmVisitRequest | null;
  customerDisplayName?: string | null;
  isSavingContext: boolean;
  onSaveContext: (payload: UpdateWfmVisitRequestContextDto) => Promise<void>;
  schedulingHref: string | null;
  presentation?: 'inline' | 'drawer';
  drawerScope?: DispatchDrawerScope;
  open?: boolean;
  onClose?: () => void;
}

interface ContextDraft {
  address: string;
  municipality: string;
  sector: string;
  description: string;
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

function buildContextPayload(draft: ContextDraft): UpdateWfmVisitRequestContextDto {
  return {
    address: toNullableTrimmedText(draft.address),
    municipality: toNullableTrimmedText(draft.municipality),
    sector: toNullableTrimmedText(draft.sector),
    description: toNullableTrimmedText(draft.description),
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

function toContextDraft(visitRequest: WfmVisitRequest | null): ContextDraft {
  const startWindow = toLocalDateTimeParts(visitRequest?.requestedWindowStartAt);
  const endWindow = toLocalDateTimeParts(visitRequest?.requestedWindowEndAt);

  return {
    address: visitRequest?.address ?? '',
    municipality: visitRequest?.municipality ?? '',
    sector: visitRequest?.sector ?? '',
    description: visitRequest?.description ?? '',
    requestedWindowStartDate: startWindow.dateLocal,
    requestedWindowStartTime: startWindow.timeLocal,
    requestedWindowEndDate: endWindow.dateLocal,
    requestedWindowEndTime: endWindow.timeLocal,
  };
}

export function PendingVisitRequestDetailPanel({
  selectedVisitRequest,
  customerDisplayName,
  isSavingContext,
  onSaveContext,
  schedulingHref,
  presentation = 'inline',
  drawerScope = 'all',
  open = true,
  onClose,
}: PendingVisitRequestDetailPanelProps) {
  const [contextDraft, setContextDraft] = useState<ContextDraft>(() => toContextDraft(null));
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setContextDraft(toContextDraft(selectedVisitRequest));
    setSaveError(null);
  }, [selectedVisitRequest]);

  const presentationStatus = selectedVisitRequest
    ? getVisitRequestPresentationStatus(selectedVisitRequest)
    : null;
  const missingFields = selectedVisitRequest
    ? getVisitRequestMissingFields(selectedVisitRequest)
    : [];
  const isTerminalVisitRequest = selectedVisitRequest
    ? isTerminalVisitRequestStatus(selectedVisitRequest.status)
    : false;
  const displayTitle =
    customerDisplayName && selectedVisitRequest?.originContext === 'CRM'
      ? customerDisplayName
      : (selectedVisitRequest?.title ?? '');
  const { operatingWindow, operatingWindowError } = useOperatingWindow({
    workType: selectedVisitRequest?.workType,
    dateLocal: contextDraft.requestedWindowStartDate || null,
    organizationSiteId: selectedVisitRequest?.organizationSiteId ?? null,
    enabled: Boolean(selectedVisitRequest),
  });
  const operatingWindowMessage = getOperatingWindowMessage(operatingWindow);

  const isDrawer = presentation === 'drawer';
  const panelMinHeightClass = isDrawer ? 'max-h-dvh' : 'min-h-[720px]';

  if (!selectedVisitRequest) {
    if (isDrawer) {
      return null;
    }

    return (
      <PortalPanel
        eyebrow="Detalle"
        title="Solicitud pendiente"
        description="Selecciona una solicitud de la bandeja para revisar contexto y enviarla a la agenda central."
        className={panelMinHeightClass}
        contentClassName="flex h-full items-center"
      >
        <PortalEmptyState
          title="Sin solicitud seleccionada"
          description="El detalle lateral se activará cuando elijas una fila de la bandeja de pendientes."
          icon={ClipboardList}
        />
      </PortalPanel>
    );
  }

  const panelBody = (
    <PortalPanel
      eyebrow="Despacho"
      title={displayTitle}
      description="Prepara la solicitud y envíala a la agenda central para elegir técnico, fecha y hora."
      className={
        isDrawer
          ? 'flex h-full flex-col overflow-hidden rounded-none border-0 shadow-none'
          : panelMinHeightClass
      }
      headerClassName={isDrawer ? 'px-4 pt-4' : undefined}
      contentClassName={isDrawer ? 'flex-1 space-y-4 overflow-y-auto px-4 pb-4' : 'space-y-4'}
      actions={
        isDrawer && onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-gray-200 p-1.5 text-gray-500 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary dark:border-dark-border dark:text-gray-300 dark:hover:bg-dark-surface-3"
            aria-label="Cerrar panel"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : undefined
      }
    >
      <section className="space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-dark-border dark:bg-dark-surface-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{displayTitle}</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {getVisitRequestReferenceLabel(selectedVisitRequest)}
            </p>
          </div>
          {presentationStatus && (
            <Badge variant={getVisitRequestStatusVariant(presentationStatus)}>
              {getVisitRequestStatusLabel(presentationStatus)}
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="neutral">
            {getVisitRequestOriginLabel(selectedVisitRequest.originContext)}
          </Badge>
          <Badge variant={getWorkOrderPriorityVariant(selectedVisitRequest.priority)}>
            {getWorkOrderPriorityLabel(selectedVisitRequest.priority)}
          </Badge>
          <Badge variant="info">{getWfmWorkTypeLabel(selectedVisitRequest.workType)}</Badge>
        </div>

        {presentationStatus && (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {getVisitRequestStatusDescription(presentationStatus)}
          </p>
        )}
      </section>

      {missingFields.length > 0 && (
        <PortalAlert
          variant="warning"
          title="Hace falta completar contexto"
          description={`Aún faltan: ${missingFields.join(', ')}.`}
          icon={AlertTriangle}
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

      {saveError && (
        <PortalAlert
          variant="error"
          title="No fue posible guardar el contexto"
          description={saveError}
        />
      )}

      {isTerminalVisitRequest && (
        <PortalAlert
          variant="info"
          title="Solicitud cerrada para despacho"
          description="Esta solicitud ya no permite edición ni envío a la agenda central."
        />
      )}

      <section className="space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-dark-border">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
            Contexto operativo
          </p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            Corrige la información mínima antes de abrir la agenda central.
          </p>
        </div>

        <Input
          id="pending-visit-address"
          label="Dirección operativa"
          value={contextDraft.address}
          disabled={isTerminalVisitRequest}
          onChange={(event) => {
            setContextDraft((current) => ({ ...current, address: event.target.value }));
            setSaveError(null);
          }}
        />

        <div className="grid gap-3">
          <Input
            id="pending-visit-municipality"
            label="Municipio"
            value={contextDraft.municipality}
            disabled={isTerminalVisitRequest}
            onChange={(event) => {
              setContextDraft((current) => ({ ...current, municipality: event.target.value }));
              setSaveError(null);
            }}
          />
          <Input
            id="pending-visit-sector"
            label="Sector"
            value={contextDraft.sector}
            disabled={isTerminalVisitRequest}
            onChange={(event) => {
              setContextDraft((current) => ({ ...current, sector: event.target.value }));
              setSaveError(null);
            }}
          />
        </div>

        <Input
          id="pending-visit-description"
          label="Nota operativa"
          value={contextDraft.description}
          disabled={isTerminalVisitRequest}
          onChange={(event) => {
            setContextDraft((current) => ({ ...current, description: event.target.value }));
            setSaveError(null);
          }}
        />

        <div className="grid gap-3">
          <Input
            id="pending-visit-window-start-date"
            label="Inicio de ventana"
            type="date"
            value={contextDraft.requestedWindowStartDate}
            disabled={isTerminalVisitRequest}
            onChange={(event) => {
              setContextDraft((current) => ({
                ...current,
                requestedWindowStartDate: event.target.value,
              }));
              setSaveError(null);
            }}
          />
          <Input
            id="pending-visit-window-start-time"
            label="Hora inicio"
            type="time"
            value={contextDraft.requestedWindowStartTime}
            disabled={isTerminalVisitRequest}
            onChange={(event) => {
              setContextDraft((current) => ({
                ...current,
                requestedWindowStartTime: event.target.value,
              }));
              setSaveError(null);
            }}
          />
          <Input
            id="pending-visit-window-end-date"
            label="Fin de ventana"
            type="date"
            value={contextDraft.requestedWindowEndDate}
            disabled={isTerminalVisitRequest}
            onChange={(event) => {
              setContextDraft((current) => ({
                ...current,
                requestedWindowEndDate: event.target.value,
              }));
              setSaveError(null);
            }}
          />
          <Input
            id="pending-visit-window-end-time"
            label="Hora fin"
            type="time"
            value={contextDraft.requestedWindowEndTime}
            disabled={isTerminalVisitRequest}
            onChange={(event) => {
              setContextDraft((current) => ({
                ...current,
                requestedWindowEndTime: event.target.value,
              }));
              setSaveError(null);
            }}
          />
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-dark-border dark:bg-dark-surface-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
            Preparación para agenda
          </p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            La elección de técnico, fecha y hora ocurre en la agenda central.
          </p>
        </div>
        <dl className="grid gap-2 text-sm text-gray-600 dark:text-gray-300">
          <div>
            <dt className="font-semibold text-gray-900 dark:text-white">Territorio</dt>
            <dd>{formatVisitRequestTerritory(contextDraft.municipality, contextDraft.sector)}</dd>
          </div>
          <div>
            <dt className="font-semibold text-gray-900 dark:text-white">Acción principal</dt>
            <dd>Abrir la solicitud en la agenda central y completar el despacho allí.</dd>
          </div>
        </dl>

        <div className="flex flex-col gap-2 pt-1">
          <Button
            type="button"
            variant="secondary"
            disabled={isTerminalVisitRequest}
            loading={isSavingContext}
            onClick={async () => {
              try {
                setSaveError(null);
                await onSaveContext(buildContextPayload(contextDraft));
              } catch (error) {
                setSaveError(
                  error instanceof Error
                    ? error.message
                    : 'No fue posible guardar el contexto operativo.',
                );
              }
            }}
          >
            Guardar contexto
          </Button>

          {schedulingHref ? (
            <Button asChild type="button" disabled={isTerminalVisitRequest}>
              <Link href={schedulingHref}>
                Abrir en agenda
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          ) : (
            <Button type="button" disabled>
              Abrir en agenda
            </Button>
          )}

          {selectedVisitRequest.executionOrderId ? (
            <Button asChild type="button" variant="secondary">
              <Link
                href={`/dashboard/operations?executionOrderId=${selectedVisitRequest.executionOrderId}`}
              >
                Abrir OT en operaciones
              </Link>
            </Button>
          ) : null}
        </div>
      </section>
    </PortalPanel>
  );

  const panel = isDrawer ? (
    <aside className="relative z-10 flex h-dvh w-full max-w-[560px] flex-col overflow-hidden border-l border-gray-200 bg-white shadow-2xl dark:border-dark-border dark:bg-dark-surface-1">
      {panelBody}
    </aside>
  ) : (
    panelBody
  );

  if (presentation === 'inline') {
    return panel;
  }

  return (
    <DispatchDrawerPortal open={open} onClose={() => onClose?.()} drawerScope={drawerScope}>
      {panel}
    </DispatchDrawerPortal>
  );
}
