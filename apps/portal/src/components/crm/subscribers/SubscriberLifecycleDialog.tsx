'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Select,
} from '@iwana/ui';
import {
  type LifecycleAction,
  type LifecyclePreviewRequest,
  type LifecyclePreviewResponse,
} from '@iwana/shared';
import type {
  LifecycleSuspendCommand,
  LifecycleReactivateCommand,
  LifecycleTerminateCommand,
} from '@iwana/shared';
import { ApiError, contractsApi, subscribersApi, type Contract } from '@/lib/api-client';
import {
  PortalAlert,
  PortalSkeletonBlock,
  interactiveFocusClassName,
  portalTextareaClassName,
} from '@/components/shared/portal-ui';
import { privacyDisplayValue } from '@/components/privacy/privacy-display';
import { CONTRACT_STATUS_META, SUBSCRIBER_STATUS_META } from './subscriber-ui';
import {
  contractServiceName,
  isEligibleLifecycleContract,
  lifecycleReasonOptions,
  type LifecycleReasonCode,
} from './subscriber-lifecycle-ui';

interface SubscriberLifecycleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscriberId: string;
  contracts: Contract[];
  action: LifecycleAction;
  /** Si viene de una tarjeta, la operación queda limitada a ese contrato. */
  contractId?: string | null;
  onSuccess: (action: LifecycleAction, affectedCount: number) => Promise<void> | void;
  onGoToServices: () => void;
}

interface LifecycleFeedback {
  title: string;
  description: string;
  goToServices?: boolean;
  closeOnly?: boolean;
}

const ACTION_COPY: Record<LifecycleAction, { title: string; description: string }> = {
  SUSPEND: {
    title: 'Suspender servicios',
    description: 'Elige los servicios que quieres suspender y el motivo.',
  },
  REACTIVATE: {
    title: 'Reactivar servicios',
    description: 'Elige los servicios que quieres reactivar y el motivo.',
  },
  TERMINATE: {
    title: 'Terminar servicio',
    description: 'Revisa el servicio que quieres terminar y el motivo.',
  },
};

const WARNING_COPY = {
  EQUIPMENT_ON_LOAN: {
    title: 'Equipo en comodato',
    description:
      'Este servicio tiene equipos en comodato. La terminación no los retira automáticamente.',
  },
  OPEN_WITHDRAWAL_ORDERS: {
    title: 'Órdenes de retiro abiertas',
    description: 'Hay órdenes de retiro abiertas. Debes gestionarlas por separado.',
  },
} as const;

function buildPreviewRequest(
  action: LifecycleAction,
  reasonCode: LifecycleReasonCode,
  note: string,
  contractIds: string[],
): LifecyclePreviewRequest {
  const command = {
    reasonCode,
    ...(note.trim() ? { note: note.trim() } : {}),
  };

  switch (action) {
    case 'SUSPEND':
      return {
        action,
        ...command,
        reasonCode: reasonCode as Extract<
          LifecyclePreviewRequest,
          { action: 'SUSPEND' }
        >['reasonCode'],
        ...(contractIds.length ? { contractIds } : {}),
      };
    case 'REACTIVATE':
      return {
        action,
        ...command,
        reasonCode: reasonCode as Extract<
          LifecyclePreviewRequest,
          { action: 'REACTIVATE' }
        >['reasonCode'],
        ...(contractIds.length ? { contractIds } : {}),
      };
    case 'TERMINATE':
      return {
        action,
        ...command,
        reasonCode: reasonCode as Extract<
          LifecyclePreviewRequest,
          { action: 'TERMINATE' }
        >['reasonCode'],
        contractIds,
      };
  }
}

function getErrorFeedback(error: unknown, isPreview: boolean): LifecycleFeedback {
  if (error instanceof ApiError && error.status === 409) {
    if (error.code === 'SUBSCRIBER_STATUS_DERIVED') {
      return {
        title: 'Usa las acciones de servicios',
        description:
          'El estado del suscriptor se actualiza con sus servicios. Usa “Suspender servicios” o “Reactivar servicios” en la ficha.',
        goToServices: true,
        closeOnly: true,
      };
    }
    if (error.code === 'SUBSCRIBER_CANCELLED') {
      return {
        title: 'No puedes crear ni activar servicios',
        description: 'No puedes crear ni activar servicios para un suscriptor cancelado.',
        closeOnly: true,
      };
    }
    if (error.code === 'SUBSCRIBER_SUSPENDED_FOR_DELINQUENCY') {
      return {
        title: 'No puedes activar este servicio',
        description:
          'No puedes activar este servicio porque el suscriptor está suspendido por mora. Puedes guardarlo como borrador.',
        closeOnly: true,
      };
    }
  }

  return {
    title: isPreview ? 'No pudimos cargar la vista previa' : 'No pudimos completar el cambio',
    description:
      error instanceof ApiError && error.message
        ? error.message
        : isPreview
          ? 'Intenta de nuevo antes de confirmar.'
          : 'Revisa los servicios e inténtalo de nuevo.',
  };
}

function contractDisplayName(contract: Contract): string {
  const name = contractServiceName(contract);
  return privacyDisplayValue(name, {
    anonymizedAt: contract.titularAnonymizedAt,
    emptyValue: 'Servicio',
  });
}

function countCopy(action: LifecycleAction, count: number): string {
  const service = count === 1 ? 'servicio' : 'servicios';
  if (action === 'SUSPEND') return `Se suspenderán ${count} ${service}.`;
  if (action === 'REACTIVATE') return `Se reactivarán ${count} ${service}.`;
  return count === 1 ? 'Se terminará 1 servicio.' : `Se terminarán ${count} servicios.`;
}

function confirmationLabel(action: LifecycleAction, count: number): string {
  const service = count === 1 ? 'servicio' : 'servicios';
  if (action === 'SUSPEND') return `Suspender ${count} ${service}`;
  if (action === 'REACTIVATE') return `Reactivar ${count} ${service}`;
  return count === 1 ? 'Terminar servicio' : `Terminar ${count} servicios`;
}

export function SubscriberLifecycleDialog({
  open,
  onOpenChange,
  subscriberId,
  contracts,
  action,
  contractId,
  onSuccess,
  onGoToServices,
}: SubscriberLifecycleDialogProps) {
  const applyingRef = useRef(false);
  const previousStepRef = useRef<1 | 2>(1);
  // `DialogTitle` no expone `ref` en su tipo: el título se busca dentro de este
  // bloque, acotado a la instancia, en lugar de por un id global.
  const titleBlockRef = useRef<HTMLDivElement>(null);
  const eligibleContracts = useMemo(
    () =>
      contracts.filter(
        (contract) =>
          isEligibleLifecycleContract(contract, action) &&
          (!contractId || contract.id === contractId),
      ),
    [action, contractId, contracts],
  );
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [reasonCode, setReasonCode] = useState<LifecycleReasonCode | ''>('');
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<LifecyclePreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [feedback, setFeedback] = useState<LifecycleFeedback | null>(null);
  const reasonOptions = useMemo(() => lifecycleReasonOptions(action), [action]);
  const selectionLocked =
    Boolean(contractId) || action === 'TERMINATE' || eligibleContracts.length <= 1;
  const selectedContracts = eligibleContracts.filter((contract) =>
    selectedIds.includes(contract.id),
  );
  const canPreview = selectedIds.length > 0 && Boolean(reasonCode) && !previewLoading;
  const canApply = Boolean(preview && preview.affectedContracts.length > 0) && !applying;

  useEffect(() => {
    if (!open) return;

    setStep(1);
    setSelectedIds(eligibleContracts.map((contract) => contract.id));
    setReasonCode('');
    setNote('');
    setPreview(null);
    setFeedback(null);
    setPreviewLoading(false);
    setApplying(false);
    applyingRef.current = false;
    previousStepRef.current = 1;
  }, [eligibleContracts, open]);

  useEffect(() => {
    if (previousStepRef.current === step) return;
    previousStepRef.current = step;

    // Al cambiar de paso el foco va al título (accesibilidad), pero se difiere un
    // frame para que el paso nuevo ya esté pintado, y ese frame puede llegar
    // después de que el operador toque otro control: reubicarlo cerraría el menú
    // portalado del `Select` (su `onBlurCapture` lo cierra al perder el foco) o le
    // quitaría el foco a lo que está tecleando. Solo se enfoca si el foco sigue
    // donde estaba al cambiar de paso. Misma guarda que `Dialog` de `@iwana/ui`
    // (commit 8fe22a87). El frame se cancela al cambiar de nuevo o al desmontar:
    // sin eso caía sobre el diálogo siguiente (CI de main, run 39282324929).
    const focusedAtStepChange = document.activeElement;
    const focusFrame = window.requestAnimationFrame(() => {
      const active = document.activeElement;
      const untouched =
        active == null ||
        active === document.body ||
        active === document.documentElement ||
        active === focusedAtStepChange;
      if (!untouched) return;
      titleBlockRef.current?.querySelector<HTMLHeadingElement>('h2')?.focus();
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
    };
  }, [step]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && applyingRef.current) return;
    onOpenChange(nextOpen);
  };

  const invalidatePreview = () => {
    setPreview(null);
    setFeedback(null);
    setStep(1);
  };

  const handlePreview = async () => {
    if (!canPreview || !reasonCode) return;
    setPreviewLoading(true);
    setFeedback(null);
    try {
      const response = await subscribersApi.previewServices(
        subscriberId,
        buildPreviewRequest(action, reasonCode, note, selectedIds),
      );
      setPreview(response);
      setStep(2);
    } catch (error) {
      setFeedback(getErrorFeedback(error, true));
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleApply = async () => {
    if (!preview || preview.affectedContracts.length === 0 || applying) return;
    applyingRef.current = true;
    setApplying(true);
    setFeedback(null);
    const affectedContractIds = preview.affectedContracts.map((contract) => contract.id);
    const notePayload = note.trim() ? { note: note.trim() } : {};

    try {
      if (contractId) {
        if (action === 'SUSPEND') {
          const command: LifecycleSuspendCommand = {
            reasonCode: reasonCode as LifecycleSuspendCommand['reasonCode'],
            ...notePayload,
          };
          await contractsApi.suspend(contractId, command);
        } else if (action === 'REACTIVATE') {
          const command: LifecycleReactivateCommand = {
            reasonCode: reasonCode as LifecycleReactivateCommand['reasonCode'],
            ...notePayload,
          };
          await contractsApi.reactivate(contractId, command);
        } else {
          const command: LifecycleTerminateCommand = {
            reasonCode: reasonCode as LifecycleTerminateCommand['reasonCode'],
            contractIds: affectedContractIds,
            ...notePayload,
          };
          await contractsApi.terminate(contractId, command);
        }
      } else if (action === 'SUSPEND') {
        const command: LifecycleSuspendCommand = {
          reasonCode: reasonCode as LifecycleSuspendCommand['reasonCode'],
          ...(affectedContractIds.length ? { contractIds: affectedContractIds } : {}),
          ...notePayload,
        };
        await subscribersApi.suspendServices(subscriberId, command);
      } else if (action === 'REACTIVATE') {
        const command: LifecycleReactivateCommand = {
          reasonCode: reasonCode as LifecycleReactivateCommand['reasonCode'],
          ...(affectedContractIds.length ? { contractIds: affectedContractIds } : {}),
          ...notePayload,
        };
        await subscribersApi.reactivateServices(subscriberId, command);
      } else {
        const command: LifecycleTerminateCommand = {
          reasonCode: reasonCode as LifecycleTerminateCommand['reasonCode'],
          contractIds: affectedContractIds,
          ...notePayload,
        };
        await subscribersApi.terminateServices(subscriberId, command);
      }

      await onSuccess(action, preview.affectedContracts.length);
      applyingRef.current = false;
      setApplying(false);
      onOpenChange(false);
    } catch (error) {
      applyingRef.current = false;
      setApplying(false);
      setFeedback(getErrorFeedback(error, false));
    }
  };

  const title = step === 1 ? ACTION_COPY[action].title : 'Revisa el cambio';
  const previewCount = preview?.affectedContracts.length ?? 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto">
        <DialogHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div ref={titleBlockRef} className="min-w-0 space-y-1">
            <DialogTitle tabIndex={-1}>{title}</DialogTitle>
            <DialogDescription>
              {step === 1
                ? ACTION_COPY[action].description
                : 'Confirma el efecto antes de aplicar el cambio.'}
            </DialogDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11 shrink-0"
            disabled={applying}
            aria-label="Cerrar diálogo"
            onClick={() => handleOpenChange(false)}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DialogHeader>

        <p className="sr-only" aria-live="polite">
          Paso {step} de 2 · {step === 1 ? 'Servicios y motivo' : 'Vista previa'}
        </p>

        {feedback && (
          <PortalAlert
            variant={feedback.goToServices ? 'info' : 'error'}
            live="assertive"
            title={feedback.title}
            description={feedback.description}
            action={
              feedback.goToServices ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11"
                  onClick={() => {
                    handleOpenChange(false);
                    onGoToServices();
                  }}
                >
                  Ir a servicios
                </Button>
              ) : undefined
            }
          />
        )}

        {step === 1 ? (
          <div className="space-y-4">
            {eligibleContracts.length === 0 ? (
              <PortalAlert
                variant="info"
                title="No hay servicios disponibles"
                description="Revisa los servicios registrados antes de continuar."
              />
            ) : eligibleContracts.length === 1 || selectionLocked ? (
              <div className="rounded-xl border border-gray-200 p-3 dark:border-dark-border">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  Se incluirá 1 servicio
                </p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                  {contractDisplayName(eligibleContracts[0]!)}
                </p>
              </div>
            ) : (
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                  Servicios a incluir
                </legend>
                {eligibleContracts.map((contract) => {
                  const checked = selectedIds.includes(contract.id);
                  return (
                    <label
                      key={contract.id}
                      className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm ${interactiveFocusClassName} ${checked ? 'border-iwana-primary/40 bg-iwana-surface-soft dark:bg-dark-surface-3' : 'border-gray-200 dark:border-dark-border'}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        className="h-5 w-5 accent-iwana-primary"
                        onChange={() => {
                          invalidatePreview();
                          setSelectedIds((current) =>
                            checked
                              ? current.filter((id) => id !== contract.id)
                              : [...current, contract.id],
                          );
                        }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-gray-900 dark:text-white">
                          {contractDisplayName(contract)}
                        </span>
                        <span className="block text-xs text-gray-600 dark:text-gray-300">
                          {CONTRACT_STATUS_META[contract.status].label}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            )}

            {selectedIds.length === 0 && (
              <p className="text-sm text-red-700 dark:text-red-300" role="alert">
                Selecciona al menos un servicio para continuar.
              </p>
            )}

            <Select
              id="lifecycle-reason"
              label="Motivo *"
              required
              aria-required="true"
              value={reasonCode}
              onChange={(event) => {
                setReasonCode(event.target.value as LifecycleReasonCode | '');
                invalidatePreview();
              }}
              options={reasonOptions}
              placeholder="Selecciona un motivo"
              className="min-h-11"
            >
              <option value="">Selecciona un motivo</option>
            </Select>
            {!reasonCode && (
              <p className="text-sm text-red-700 dark:text-red-300" role="status">
                Selecciona un motivo.
              </p>
            )}

            <div className="space-y-1">
              <label
                htmlFor="lifecycle-note"
                className="block text-sm font-medium text-gray-800 dark:text-gray-100"
              >
                Nota (opcional)
              </label>
              <textarea
                id="lifecycle-note"
                value={note}
                maxLength={500}
                rows={3}
                placeholder="Agrega un detalle para el historial."
                className={portalTextareaClassName}
                aria-describedby="lifecycle-note-count"
                onChange={(event) => {
                  setNote(event.target.value);
                  invalidatePreview();
                }}
              />
              <p
                id="lifecycle-note-count"
                className="text-right text-xs text-gray-500 dark:text-gray-400"
              >
                {note.length}/500 caracteres
              </p>
            </div>

            {previewLoading && (
              <div className="space-y-3" aria-busy="true">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Calculando la vista previa…
                </p>
                <PortalSkeletonBlock className="h-14 rounded-xl" />
                <PortalSkeletonBlock className="h-12 rounded-xl" />
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="secondary"
                className="min-h-11"
                disabled={previewLoading}
                onClick={() => handleOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="min-h-11"
                loading={previewLoading}
                disabled={!canPreview || eligibleContracts.length === 0}
                onClick={() => void handlePreview()}
              >
                {feedback?.title === 'No pudimos cargar la vista previa'
                  ? 'Reintentar vista previa'
                  : 'Ver vista previa'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {previewLoading ? (
              <div className="space-y-3" aria-busy="true">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Calculando la vista previa…
                </p>
                <PortalSkeletonBlock className="h-14 rounded-xl" />
                <PortalSkeletonBlock className="h-12 rounded-xl" />
              </div>
            ) : preview ? (
              <>
                {preview.affectedContracts.length === 0 ? (
                  <PortalAlert
                    variant="info"
                    title="No hay cambios para aplicar."
                    description="Revisa los servicios seleccionados y vuelve a intentarlo."
                    action={
                      <Button
                        type="button"
                        variant="secondary"
                        className="min-h-11"
                        onClick={() => setStep(1)}
                      >
                        Volver a editar
                      </Button>
                    }
                  />
                ) : (
                  <>
                    <div className="rounded-xl border border-gray-200 p-4 dark:border-dark-border">
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {countCopy(action, previewCount)}
                      </p>
                      <ul className="mt-3 space-y-2 text-sm text-gray-700 dark:text-gray-200">
                        {preview.affectedContracts.map((affected) => {
                          const contract = contracts.find((item) => item.id === affected.id);
                          return (
                            <li key={affected.id} className="flex flex-wrap justify-between gap-2">
                              <span>{contract ? contractDisplayName(contract) : 'Servicio'}</span>
                              <span>
                                {CONTRACT_STATUS_META[affected.fromStatus].label} →{' '}
                                {CONTRACT_STATUS_META[affected.toStatus].label}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>

                    <p className="text-sm text-gray-700 dark:text-gray-200">
                      {preview.subscriberStatus.from === preview.subscriberStatus.to
                        ? 'El estado del suscriptor no cambia.'
                        : `El suscriptor quedará ${SUBSCRIBER_STATUS_META[preview.subscriberStatus.to].label}.`}
                    </p>

                    {action === 'TERMINATE' && !preview.hasLiveContracts && (
                      <PortalAlert
                        variant="info"
                        title="Sin servicios vigentes"
                        description="El suscriptor no tendrá servicios activos ni suspendidos. Su estado no cambiará automáticamente."
                      />
                    )}

                    {preview.warnings.map((warning) => {
                      const warningCopy = WARNING_COPY[warning.code];
                      const relatedServices = warning.contractIds
                        .map((id) => contracts.find((contract) => contract.id === id))
                        .filter((contract): contract is Contract => Boolean(contract))
                        .map(contractDisplayName);
                      return (
                        <PortalAlert
                          key={warning.code}
                          variant="warning"
                          title={warningCopy.title}
                          description={
                            <>
                              {warningCopy.description}
                              {relatedServices.length > 0 && (
                                <span className="mt-1 block">
                                  Servicios relacionados: {relatedServices.join(', ')}.
                                </span>
                              )}
                            </>
                          }
                        />
                      );
                    })}
                  </>
                )}
              </>
            ) : null}

            <div className="flex flex-wrap justify-end gap-3 pt-2">
              {feedback?.closeOnly ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11"
                  disabled={applying}
                  onClick={() => handleOpenChange(false)}
                >
                  Cerrar
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-11"
                    disabled={applying}
                    onClick={() => setStep(1)}
                  >
                    Volver
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-11"
                    disabled={applying}
                    onClick={() => handleOpenChange(false)}
                  >
                    Cancelar
                  </Button>
                </>
              )}
              {feedback && !feedback.closeOnly && (
                <Button
                  type="button"
                  className="min-h-11"
                  loading={applying}
                  disabled={applying || !preview || preview.affectedContracts.length === 0}
                  onClick={() => void handleApply()}
                >
                  Reintentar
                </Button>
              )}
              {!feedback && (
                <Button
                  type="button"
                  className="min-h-11"
                  loading={applying}
                  disabled={!canApply}
                  onClick={() => void handleApply()}
                >
                  {applying
                    ? action === 'SUSPEND'
                      ? 'Suspendiendo…'
                      : action === 'REACTIVATE'
                        ? 'Reactivando…'
                        : 'Terminando…'
                    : confirmationLabel(action, previewCount)}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
