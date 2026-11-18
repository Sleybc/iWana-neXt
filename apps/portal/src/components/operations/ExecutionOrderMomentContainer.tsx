'use client';

import { useEffect, useRef, useState } from 'react';
import { ExecutionOrderResult, WfmWorkType } from '@iwana/shared';
import { Button, OperationalSidePeek, SkeletonBlock } from '@iwana/ui';
import { NETWORK_PROVISIONING_COPY } from '@/components/network/network-provisioning-labels';
import { PortalAlert, PortalEmptyState } from '@/components/shared/portal-ui';
import { ExecutionOrderProvisioningBody } from './ExecutionOrderProvisioningPanel';
import { ExecutionOrderCloseSection } from './ExecutionOrderCloseSection';
import { ExecutionOrderCommitmentSection } from './ExecutionOrderCommitmentSection';
import { ExecutionOrderContractStep } from './ExecutionOrderContractStep';
import {
  ExecutionOrderRequirementIndex,
  PROVISIONING_BODY_HEADING_ID,
  provisioningLineKey,
} from './ExecutionOrderRequirementIndex';
import { ExecutionOrderClosureBar } from './ExecutionOrderClosureBar';
import { ExecutionOrderSummary } from './ExecutionOrderSummary';
import type { RequirementActionDescriptor } from './execution-order-actions';
import type { ExecutionOrderDrawerProps } from './execution-order-console-types';
import { contractStepDisabledReason } from './execution-order-contract-signing';
import { getExecutionOrderMoment, isTerminalStatus } from './execution-order-moment';
import { requirementKindLabel } from './execution-order-requirements';
import { syncCopy, toSummarySyncState } from './execution-order-sync-copy';
import { useExecutionOrderCloseForm } from './use-execution-order-close-form';
import { useExecutionOrderProvisioning } from './use-execution-order-provisioning';

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
  const [signedContractId, setSignedContractId] = useState<string | null>(null);
  // Requisito activo del índice (D3). `undefined` = el de por defecto; se fija al
  // elegir una línea o abrir una acción, así no salta solo tras una mutación.
  const [activeRequirementKey, setActiveRequirementKey] = useState<string | null | undefined>(
    undefined,
  );
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
  useEffect(() => {
    setSignedContractId(null);
    setActiveRequirementKey(undefined);
  }, [order?.id]);
  const closeForm = useExecutionOrderCloseForm({
    orderId: order?.id,
    itemUsage,
    template,
    evidence,
    nonRealizationCauses,
    onCloseOrder,
  });
  const forbidden = order !== null && order.allowedActions === null;
  // D1: la lectura de aprovisionamiento vive aquí; el gate de cierre y el paso
  // «Contrato» no dependen de que su cuerpo esté montado. `active` reproduce el
  // ciclo de montaje del panel anterior (se relee al volver de la carga).
  const isInstallation = order?.workType === WfmWorkType.INSTALLATION;
  const provisioning = useExecutionOrderProvisioning({
    executionOrderId: order?.id ?? null,
    active: open && !isLoading && order !== null && !forbidden && isInstallation,
  });
  const provisioningSnapshot = provisioning.snapshot;
  const contractContext = provisioning.contractContext;
  const selectAction = (action: RequirementActionDescriptor | null) => {
    if (action) setActiveRequirementKey(action.requirementKey);
    selectedActionRef.current = action;
    setSelectedAction(action);
    onOpenRequirementAction?.(action);
  };
  const activateRequirement = (key: string) => {
    setActiveRequirementKey(key);
    // Un acto abierto sobre otro requisito se cierra: su cuerpo deja de estar montado.
    if (selectedActionRef.current && selectedActionRef.current.requirementKey !== key) {
      selectAction(null);
    }
  };
  const focusCloseSection = () => {
    const heading = document.getElementById('eo-close-heading');
    heading?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    heading?.focus();
  };
  const provisioningRequired =
    isInstallation &&
    provisioningSnapshot.enabled === true &&
    closeForm.closeResult !== ExecutionOrderResult.NOT_EXECUTED;
  const moment = order ? getExecutionOrderMoment(order.status) : null;
  // Solo en progreso: en pre-inicio y bloqueada se omite; en terminal no existe (R0 §3).
  const showClosureBar = !!order && !isLoading && !forbidden && moment === 'in-progress';
  const provisioningKey = provisioningLineKey(
    template?.requirements ?? order?.template?.requirements,
  );
  const focusRequirementBody = (key: string) => {
    activateRequirement(key);
    window.setTimeout(() => {
      const heading = document.getElementById(
        key === provisioningKey ? PROVISIONING_BODY_HEADING_ID : `requirement-body-heading-${key}`,
      );
      heading?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      heading?.focus();
    }, 0);
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
      title={forbidden ? 'Orden de trabajo' : (order?.number ?? 'Orden')}
      description="Consulta los requisitos y registra el trabajo realizado en la orden"
      size="wide"
      busy={isSubmitting}
      footer={
        showClosureBar && order ? (
          <ExecutionOrderClosureBar
            order={order}
            template={template}
            provisioning={
              provisioningRequired
                ? {
                    known: provisioningSnapshot.enabled !== null,
                    certified: provisioningSnapshot.certified === true,
                  }
                : null
            }
            onActivateRequirement={focusRequirementBody}
            onGoToClose={focusCloseSection}
          />
        ) : undefined
      }
    >
      {isLoading ? (
        <div className="space-y-4" aria-busy="true" aria-label="Cargando orden">
          <SkeletonBlock className="h-28" />
          <SkeletonBlock className="h-16" />
          <SkeletonBlock className="h-48" />
        </div>
      ) : !order ? (
        error ? (
          <PortalAlert
            variant="error"
            title="No pudimos cargar esta orden"
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
            title="Sin orden seleccionada"
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
        <div className="space-y-3">
          {error && !selectedAction && error !== NETWORK_PROVISIONING_COPY.closureGateIncomplete ? (
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
            variant="console"
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
            {...(activeRequirementKey !== undefined ? { activeRequirementKey } : {})}
            onActivateRequirement={activateRequirement}
            {...(isInstallation
              ? {
                  provisioningRequirement: {
                    enabled: provisioningSnapshot.enabled,
                    certified: provisioningSnapshot.certified,
                    required: provisioningRequired,
                    // C: Aprovisionamiento es el cuerpo de su línea del índice; su
                    // lectura vive en el contenedor (D1), así que puede no estar montado.
                    body: (
                      <ExecutionOrderProvisioningBody
                        key={order.id}
                        executionOrderId={order.id}
                        state={provisioning}
                        showOrderFacts={false}
                        heading="Aprovisionamiento certificado"
                      />
                    ),
                  },
                }
              : {})}
          />
          {order.workType === WfmWorkType.INSTALLATION &&
          contractContext &&
          (contractContext.status === 'DRAFT' ||
            signedContractId === contractContext.contractId) ? (
            <ExecutionOrderContractStep
              key={`${order.id}:${contractContext.contractId}`}
              executionOrderId={order.id}
              contract={contractContext}
              signed={signedContractId === contractContext.contractId}
              onSigned={setSignedContractId}
              disabledReason={contractStepDisabledReason({
                inProgress: getExecutionOrderMoment(order.status) === 'in-progress',
                canRegister: order.allowedActions?.includes('REGISTER_EVIDENCE') ?? false,
                offline,
                inSync: order.syncState === 'IN_SYNC',
                provisioningStatus: contractContext.provisioningStatus,
              })}
            />
          ) : null}
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
            provisioningRequired={provisioningRequired}
            provisioningCertified={provisioningSnapshot.certified === true}
            provisioningStatusKnown={provisioningSnapshot.enabled !== null}
            closureGateError={error === NETWORK_PROVISIONING_COPY.closureGateIncomplete}
            onReviewProvisioning={() => focusRequirementBody(provisioningKey)}
          />
        </div>
      )}
    </OperationalSidePeek>
  );
}

// Reexport for convenience
export { ExecutionOrderMomentContainer as default };
