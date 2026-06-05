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

interface ScheduleVisitRequestConfirmDialogProps {
  open: boolean;
  visitRequest: WfmVisitRequest | null;
  recommendation: WfmScheduleRecommendation | null;
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
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Confirmar agendamiento</DialogTitle>
          <DialogDescription>
            Revisa la solicitud, la franja y el técnico antes de convertirla en evento operativo.
          </DialogDescription>
        </DialogHeader>

        {visitRequest && recommendation ? (
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
              <p>
                <span className="font-semibold text-gray-900 dark:text-white">Técnico:</span>{' '}
                {technician ? getTechnicianDisplayName(technician) : recommendation.technicianId}
              </p>
              <p>
                <span className="font-semibold text-gray-900 dark:text-white">Franja:</span>{' '}
                {formatWfmDateTime(recommendation.scheduledStartAt)} -{' '}
                {formatWfmDateTime(recommendation.scheduledEndAt)}
              </p>
              <p>
                <span className="font-semibold text-gray-900 dark:text-white">Score:</span>{' '}
                {recommendation.score}
              </p>
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
