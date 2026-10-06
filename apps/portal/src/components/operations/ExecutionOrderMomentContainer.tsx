'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, OperationalSidePeek, SkeletonBlock } from '@iwana/ui';
import { PortalAlert, PortalEmptyState } from '@/components/shared/portal-ui';
import { ExecutionOrderCloseSection } from './ExecutionOrderCloseSection';
import { ExecutionOrderCommitmentSection } from './ExecutionOrderCommitmentSection';
import { ExecutionOrderRequirementIndex } from './ExecutionOrderRequirementIndex';
import { ExecutionOrderSummary } from './ExecutionOrderSummary';
import type { RequirementActionDescriptor } from './execution-order-actions';
import type { ExecutionOrderDrawerProps } from './execution-order-console-types';
import { getExecutionOrderMoment, isTerminalStatus } from './execution-order-moment';
import { requirementKindLabel } from './execution-order-requirements';
import { syncCopy, toSummarySyncState } from './execution-order-sync-copy';
import { useExecutionOrderCloseForm } from './use-execution-order-close-form';

/**
 * Contenedor por momento del expediente de OT (B0, Ola 2b).
 *
 * Solo compone: estados de la vista (carga, error, sin acceso, sin conexión,
 * sincronización), resumen, compromiso, índice de requisitos y cierre. No conoce
 * el contenido de ningún acto: cada requisito delega en su slot
 * (`ExecutionOrderRequirementIndex`) y los slots viven en archivos propios, así
 * que R2 (evidencia), R3 (consumo), R4 (refresco) y E4-portal (tabla y resumen)
 * no necesitan editar este archivo ni la fachada del hook.
 *
 * La selección del acto abierto vive aquí, no en el índice: el cuerpo se
 * desmonta mientras la orden se vuelve a leer y la hoja debe reaparecer.
 */
export function ExecutionOrderMomentContainer(props: ExecutionOrderDrawerProps) {
  const {
    open,
    order,
    isLoading,
    isSubmitting,
    error,
    successMessage = null,
    offline,
    onClose,
    onOpenRequirementAction,
    onRefreshDetail,
    onStart,
    onBlock,
    template = null,
    missingRequirements = [],
    evidenceState = 'available',
    itemUsage,
    evidence,
    nonRealizationCauses = null,
    onUploadNonRealizationEvidence,
    onCloseOrder,
  } = props;
  const [selectedAction, setSelectedAction] = useState<RequirementActionDescriptor | null>(null);
  const selectedActionRef = useRef<RequirementActionDescriptor | null>(null);
  const previousOrderState = useRef({ id: order?.id, status: order?.status });
  useEffect(() => {
    const previous = previousOrderState.current;
    if (previous.id === order?.id && previous.status === order?.status) return;
    previousOrderState.current = { id: order?.id, status: order?.status };
    if (selectedActionRef.current) {
      selectedActionRef.current = null;
      onOpenRequirementAction?.(null);
    }
    setSelectedAction(null);
  }, [order?.id, order?.status, onOpenRequirementAction]);
  const closeForm = useExecutionOrderCloseForm({
    orderId: order?.id,
    itemUsage,
    template,
    evidence,
    nonRealizationCauses,
    onCloseOrder,
  });

  const forbidden = order !== null && order.allowedActions === null;
  const selectAction = (action: RequirementActionDescriptor | null) => {
    selectedActionRef.current = action;
    setSelectedAction(action);
    onOpenRequirementAction?.(action);
  };
  const refreshAction = onRefreshDetail ? (
    <Button type="button" onClick={() => void onRefreshDetail()}>
      Actualizar detalle
    </Button>
  ) : undefined;

  return (
    <OperationalSidePeek
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={forbidden ? 'Orden de trabajo' : (order?.number ?? 'OT')}
      description="Consulta los requisitos y registra el trabajo realizado en la OT"
      size="wide"
      busy={isSubmitting}
    >
      {isLoading ? (
        <div className="space-y-4" aria-busy="true" aria-label="Cargando orden de trabajo">
          <SkeletonBlock className="h-28" />
          <SkeletonBlock className="h-16" />
          <SkeletonBlock className="h-48" />
        </div>
      ) : !order ? (
        error ? (
          <PortalAlert
            variant="error"
            title="No fue posible cargar la OT"
            description={error}
            action={
              onRefreshDetail ? (
                <Button type="button" onClick={() => void onRefreshDetail()}>
                  Reintentar
                </Button>
              ) : undefined
            }
          />
        ) : (
          <PortalEmptyState
            title="Sin OT seleccionada"
            description="Abre una orden de trabajo desde Agenda u Operaciones."
          />
        )
      ) : forbidden ? (
        <PortalAlert
          variant="info"
          title="Sin acceso"
          description="No tienes acceso a esta orden."
        />
      ) : (
        <div className="space-y-5">
          {error && !selectedAction ? (
            <PortalAlert
              variant="error"
              title="No fue posible completar la operación"
              description={error}
              action={refreshAction}
            />
          ) : null}

          {successMessage ? (
            <PortalAlert
              variant="success"
              title="Operación completada"
              description={successMessage}
            />
          ) : null}

          {offline && (
            <PortalAlert
              variant="warning"
              title="Sin conexión"
              description="Sin conexión; vuelve a intentar cuando recuperes la red."
            />
          )}

          {order.syncState !== 'IN_SYNC' && (
            <PortalAlert
              variant={order.syncState === 'FAILED' ? 'error' : 'warning'}
              title="Sincronización"
              description={`${syncCopy(toSummarySyncState(order.syncState))}. Solo puedes consultar o actualizar el detalle.`}
            />
          )}

          <ExecutionOrderSummary
            order={order}
            syncState={toSummarySyncState(order.syncState)}
            readonly={isTerminalStatus(order.status) || offline || order.syncState !== 'IN_SYNC'}
            canOpen={false}
            hideProgress
          />

          <ExecutionOrderCommitmentSection
            order={order}
            isSubmitting={isSubmitting}
            offline={offline}
            onStart={onStart}
            onBlock={onBlock}
          />

          <ExecutionOrderRequirementIndex
            order={order}
            context={props}
            selectedAction={selectedAction}
            onSelectAction={selectAction}
          />
          {getExecutionOrderMoment(order.status) !== 'pre-start' &&
            missingRequirements.length > 0 && (
              <div role="alert" aria-label="Requisitos pendientes">
                <ul>
                  {missingRequirements.map((requirement) => (
                    <li key={requirement.requirementId}>
                      <p>{requirement.label?.trim() || requirementKindLabel(requirement.kind)}</p>
                      <p>
                        {requirement.reason?.trim() ||
                          'Completa el requisito pendiente antes de cerrar la orden.'}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          {!template && (
            <PortalEmptyState
              title="Requisitos no disponibles"
              description="Revisa la plantilla aplicada antes de cerrar la orden."
              action={refreshAction}
            />
          )}
          {evidenceState === 'unavailable' &&
            !template?.requirements.some((requirement) => requirement.kind === 'EVIDENCE') && (
              <PortalAlert
                variant="warning"
                title="Evidencias no disponibles"
                description="No pudimos consultar las evidencias en este momento."
              />
            )}

          <ExecutionOrderCloseSection
            order={order}
            template={template}
            form={closeForm}
            isSubmitting={isSubmitting}
            offline={offline}
            nonRealizationCauses={nonRealizationCauses}
            onUploadNonRealizationEvidence={onUploadNonRealizationEvidence}
          />
        </div>
      )}
    </OperationalSidePeek>
  );
}

// Reexport for convenience
export { ExecutionOrderMomentContainer as default };
