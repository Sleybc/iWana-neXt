'use client';

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from '@iwana/ui';
import type { InternalUser, WfmScheduleRecommendation, WfmVisitRequest } from '@/lib/api-client';
import { formatWfmDateTime, getTechnicianDisplayName, getWfmWorkTypeLabel } from './scheduling-ui';
import { getVisitRequestOriginLabel, getVisitRequestReferenceLabel } from './pending-visits-ui';
import { toIsoFromLocalDateAndTime } from './schedule-event-time';
import type { MatrixManualScheduleDraft } from './matrix-scheduling-selection';

interface ScheduleVisitRequestConfirmDialogProps {
  open: boolean;
  visitRequest: WfmVisitRequest | null;
  recommendation: WfmScheduleRecommendation | null;
  manualSelectionDraft?: MatrixManualScheduleDraft | null;
  techniciansById: Map<string, InternalUser>;
  isSubmitting: boolean;
  createWorkOrder: boolean;
  workOrderNotes: string;
  onOpenChange: (open: boolean) => void;
  onCreateWorkOrderChange: (value: boolean) => void;
  onWorkOrderNotesChange: (value: string) => void;
  onConfirm: () => Promise<void>;
}

export function ScheduleVisitRequestConfirmDialog({
  open,
  visitRequest,
  recommendation,
  manualSelectionDraft = null,
  techniciansById,
  isSubmitting,
  createWorkOrder,
  workOrderNotes,
  onOpenChange,
  onCreateWorkOrderChange,
  onWorkOrderNotesChange,
  onConfirm,
}: ScheduleVisitRequestConfirmDialogProps) {
  const technician = recommendation
    ? (techniciansById.get(recommendation.technicianId) ?? null)
    : manualSelectionDraft
      ? (techniciansById.get(manualSelectionDraft.technicianId) ?? null)
      : null;
  const manualStartAt = manualSelectionDraft
    ? toIsoFromLocalDateAndTime(manualSelectionDraft.date, manualSelectionDraft.startTime)
    : null;
  const manualEndAt =
    manualStartAt && manualSelectionDraft?.duration
      ? new Date(
          new Date(manualStartAt).getTime() + Number(manualSelectionDraft.duration) * 60 * 1000,
        ).toISOString()
      : null;
  const hasSelection = Boolean(recommendation) || Boolean(manualSelectionDraft && manualStartAt);
  const confirmTitle = recommendation ? 'Franja sugerida por el sistema' : 'Agenda manual validada';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Confirmar agendamiento</DialogTitle>
          <DialogDescription>
            Revisa la solicitud, la franja y el técnico antes de convertirla en evento operativo.
          </DialogDescription>
        </DialogHeader>

        {visitRequest && hasSelection ? (
          <div className="space-y-4">
            <div className="space-y-2 rounded-2xl border border-gray-200 bg-gray-50/70 p-4 dark:border-dark-border dark:bg-dark-surface-3">
              <p className="text-base font-semibold text-gray-900 dark:text-white">
                {visitRequest.title}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {getVisitRequestReferenceLabel(visitRequest)}
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="neutral">
                  {getVisitRequestOriginLabel(visitRequest.originContext)}
                </Badge>
                <Badge variant="info">{getWfmWorkTypeLabel(visitRequest.workType)}</Badge>
              </div>
            </div>

            <div className="grid gap-3 rounded-2xl border border-gray-200 p-4 text-sm text-gray-600 dark:border-dark-border dark:text-gray-300">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
                {confirmTitle}
              </p>
              <p>
                <span className="font-semibold text-gray-900 dark:text-white">Técnico:</span>{' '}
                {technician
                  ? getTechnicianDisplayName(technician)
                  : (recommendation?.technicianId ?? manualSelectionDraft?.technicianId)}
              </p>
              <p>
                <span className="font-semibold text-gray-900 dark:text-white">Franja:</span>{' '}
                {recommendation
                  ? `${formatWfmDateTime(recommendation.scheduledStartAt)} - ${formatWfmDateTime(recommendation.scheduledEndAt)}`
                  : manualStartAt && manualEndAt
                    ? `${formatWfmDateTime(manualStartAt)} - ${formatWfmDateTime(manualEndAt)}`
                    : 'Sin franja válida'}
              </p>
              {recommendation ? (
                <p>
                  <span className="font-semibold text-gray-900 dark:text-white">Score:</span>{' '}
                  {recommendation.score}
                </p>
              ) : (
                <p>
                  <span className="font-semibold text-gray-900 dark:text-white">Origen:</span> Hora
                  libre seleccionada desde la agenda
                </p>
              )}
              {manualSelectionDraft?.riskMessages.length ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100">
                  <p className="font-semibold">Advertencias operativas</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    {manualSelectionDraft.riskMessages.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-dark-border">
              <label className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-200">
                <input
                  type="checkbox"
                  checked={createWorkOrder}
                  onChange={(event) => onCreateWorkOrderChange(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-iwana-primary-500 focus:ring-iwana-primary-500"
                />
                <span>
                  <span className="block font-semibold text-gray-900 dark:text-white">
                    Crear orden de trabajo operativa
                  </span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">
                    Desactívala si por ahora solo quieres reservar la franja en agenda.
                  </span>
                </span>
              </label>

              <Input
                id="confirm-visit-request-work-order-notes"
                label="Notas para la orden de trabajo"
                value={workOrderNotes}
                disabled={!createWorkOrder}
                placeholder="Ej. Coordinar ingreso con portería o validar material antes de salir"
                onChange={(event) => onWorkOrderNotesChange(event.target.value)}
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                Volver
              </Button>
              <Button type="button" loading={isSubmitting} onClick={() => void onConfirm()}>
                Confirmar agenda
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
