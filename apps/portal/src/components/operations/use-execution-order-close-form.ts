import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExecutionOrderResult, InventoryDisposition } from '@iwana/shared';
import type {
  ExecutionOrderEvidence,
  ExecutionOrderItemUsage,
  ExecutionOrderTemplateVersion,
} from '@iwana/shared';
import type { CloseExecutionOrderDto, NonRealizationCause } from '@/lib/api-client';
import { formatTaskDateTime } from './operations-labels';

// B0 — estado del formulario de cierre. Vive en un hook que monta el shell para
// que el borrador sobreviva a los refrescos de la orden (el cuerpo del drawer se
// desmonta mientras carga); el cierre es de B0 y ningún slot lo toca.

type CustomerAcceptanceMethod = NonNullable<CloseExecutionOrderDto['customerAcceptance']>['method'];

const EMPTY_EVIDENCE: ExecutionOrderEvidence[] = [];

function templateRequiresCustomerAcceptance(
  template: ExecutionOrderTemplateVersion | null,
): boolean {
  return (
    template?.requirements.some(
      (requirement) => requirement.required && requirement.kind === 'COMPLIANCE',
    ) ?? false
  );
}

function closureRequiresCustomerAcceptance(
  result: ExecutionOrderResult,
  itemUsage: ExecutionOrderItemUsage[],
  template: ExecutionOrderTemplateVersion | null,
): boolean {
  const resultImpliesInstallation = [
    ExecutionOrderResult.EXECUTED,
    ExecutionOrderResult.EXECUTED_WITH_OBSERVATIONS,
  ].includes(result);
  const materialInstalledAtCustomer = itemUsage.some(
    (usage) => usage.finalDisposition === InventoryDisposition.INSTALLED_AT_CUSTOMER,
  );

  return (
    templateRequiresCustomerAcceptance(template) ||
    (resultImpliesInstallation && materialInstalledAtCustomer)
  );
}

function isCustomerAcceptanceComplete(
  artifactId: string,
  method: CustomerAcceptanceMethod | '',
): boolean {
  return artifactId.trim().length > 0 && method === 'SIGNATURE';
}

export interface ExecutionOrderCloseFormInput {
  orderId: string | undefined;
  itemUsage: ExecutionOrderItemUsage[];
  template: ExecutionOrderTemplateVersion | null;
  evidence: ExecutionOrderEvidence[] | null | undefined;
  nonRealizationCauses: NonRealizationCause[] | null;
  onCloseOrder: (payload: CloseExecutionOrderDto) => Promise<void>;
}

export function useExecutionOrderCloseForm({
  orderId,
  itemUsage,
  template,
  evidence,
  nonRealizationCauses,
  onCloseOrder,
}: ExecutionOrderCloseFormInput) {
  const [closeResult, setCloseResult] = useState<ExecutionOrderResult>(
    ExecutionOrderResult.EXECUTED,
  );
  const [closeSummary, setCloseSummary] = useState('');
  const [customerAcceptanceArtifactId, setCustomerAcceptanceArtifactId] = useState('');
  const [customerAcceptanceMethod, setCustomerAcceptanceMethod] = useState<
    CustomerAcceptanceMethod | ''
  >('');
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [closeValidationError, setCloseValidationError] = useState<string | null>(null);
  // ADR-077 — cierre con causa de no realización
  const [selectedNonRealizationCauseId, setSelectedNonRealizationCauseId] = useState('');
  const [nonRealizationNote, setNonRealizationNote] = useState('');
  const [nonRealizationEvidenceFile, setNonRealizationEvidenceFile] = useState<File | null>(null);
  const nonRealizationEvidenceRef = useRef<HTMLInputElement>(null);

  // El borrador pertenece a una orden: al cambiar de OT (o cerrar el drawer) no se arrastra.
  useEffect(() => {
    setCloseResult(ExecutionOrderResult.EXECUTED);
    setCloseSummary('');
    setCustomerAcceptanceArtifactId('');
    setCustomerAcceptanceMethod('');
    setCloseConfirmOpen(false);
    setCloseValidationError(null);
    setSelectedNonRealizationCauseId('');
    setNonRealizationNote('');
    setNonRealizationEvidenceFile(null);
  }, [orderId]);

  const isNotExecuted = closeResult === ExecutionOrderResult.NOT_EXECUTED;
  const selectedNonRealizationCause = isNotExecuted
    ? ((nonRealizationCauses ?? []).find((cause) => cause.id === selectedNonRealizationCauseId) ??
      null)
    : null;
  const nonRealizationRequiresEvidence = selectedNonRealizationCause?.requiresEvidence === true;
  const nonRealizationCanConfirm =
    !isNotExecuted ||
    (selectedNonRealizationCauseId.length > 0 &&
      (!nonRealizationRequiresEvidence || nonRealizationEvidenceFile !== null));

  const resultOptions = useMemo(
    () => [
      { value: ExecutionOrderResult.EXECUTED, label: 'Ejecutada' },
      {
        value: ExecutionOrderResult.EXECUTED_WITH_OBSERVATIONS,
        label: 'Ejecutada con observaciones',
      },
      ...(nonRealizationCauses && nonRealizationCauses.length > 0
        ? [{ value: ExecutionOrderResult.NOT_EXECUTED, label: 'No ejecutada' }]
        : []),
    ],
    [nonRealizationCauses],
  );

  const customerAcceptanceRequired = closureRequiresCustomerAcceptance(
    closeResult,
    itemUsage,
    template,
  );
  const customerAcceptanceProvided =
    customerAcceptanceArtifactId.trim().length > 0 || customerAcceptanceMethod !== '';
  const customerAcceptanceIncomplete =
    customerAcceptanceRequired || customerAcceptanceProvided
      ? !isCustomerAcceptanceComplete(customerAcceptanceArtifactId, customerAcceptanceMethod)
      : false;

  const customerAcceptanceMethodOptions = useMemo(
    () => [{ value: 'SIGNATURE', label: 'Firma' }],
    [],
  );
  const normalizedEvidence = evidence ?? EMPTY_EVIDENCE;
  const customerAcceptanceEvidenceOptions = useMemo(
    () =>
      normalizedEvidence
        .filter(
          (entry) =>
            entry.status === 'AVAILABLE' &&
            entry.evidenceType === 'SIGNATURE' &&
            entry.requirementKey === 'CUSTOMER_SIGNATURE',
        )
        .map((entry) => ({
          value: entry.mediaAssetId,
          label: `Firma del cliente · ${formatTaskDateTime(entry.capturedAt ?? entry.receivedAt)}`,
        })),
    [normalizedEvidence],
  );

  const handleCloseConfirm = useCallback(async () => {
    if (!closeSummary.trim()) return;

    // La confirmación puede permanecer abierta mientras cambia el formulario. Revalidar aquí
    // contra el requisito contractual evita enviar un cierre sin aceptación cuando la plantilla
    // exige conformidad del cliente.
    const customerAcceptanceRequiredAtSend = closureRequiresCustomerAcceptance(
      closeResult,
      itemUsage,
      template,
    );
    const artifactId = customerAcceptanceArtifactId.trim();
    const acceptanceMethod = customerAcceptanceMethod;
    const acceptanceProvided = artifactId.length > 0 || acceptanceMethod !== '';
    const acceptanceComplete = isCustomerAcceptanceComplete(artifactId, acceptanceMethod);
    if (
      (customerAcceptanceRequiredAtSend && !acceptanceComplete) ||
      (acceptanceProvided && !acceptanceComplete)
    ) {
      setCloseValidationError(
        'La aceptación del cliente debe incluir una firma disponible y validada en esta orden.',
      );
      return;
    }

    setCloseValidationError(null);
    setCloseConfirmOpen(false);
    const payload: CloseExecutionOrderDto = {
      result: closeResult,
      summary: closeSummary.trim(),
    };
    if (isNotExecuted && selectedNonRealizationCauseId) {
      payload.reasonCode = selectedNonRealizationCauseId;
      if (selectedNonRealizationCause) {
        payload.followUp = {
          reasonCode: selectedNonRealizationCause.code,
        };
      }
    }
    if (acceptanceComplete) {
      payload.customerAcceptance = {
        artifactId,
        method: 'SIGNATURE',
      };
    }
    await onCloseOrder(payload);
  }, [
    closeResult,
    closeSummary,
    customerAcceptanceArtifactId,
    customerAcceptanceMethod,
    itemUsage,
    template,
    onCloseOrder,
    isNotExecuted,
    selectedNonRealizationCauseId,
    selectedNonRealizationCause,
  ]);

  return {
    closeResult,
    setCloseResult,
    closeSummary,
    setCloseSummary,
    customerAcceptanceArtifactId,
    setCustomerAcceptanceArtifactId,
    customerAcceptanceMethod,
    setCustomerAcceptanceMethod,
    closeConfirmOpen,
    setCloseConfirmOpen,
    closeValidationError,
    setCloseValidationError,
    selectedNonRealizationCauseId,
    setSelectedNonRealizationCauseId,
    nonRealizationNote,
    setNonRealizationNote,
    nonRealizationEvidenceFile,
    setNonRealizationEvidenceFile,
    nonRealizationEvidenceRef,
    isNotExecuted,
    nonRealizationRequiresEvidence,
    nonRealizationCanConfirm,
    resultOptions,
    customerAcceptanceRequired,
    customerAcceptanceIncomplete,
    customerAcceptanceMethodOptions,
    customerAcceptanceEvidenceOptions,
    handleCloseConfirm,
  };
}

export type ExecutionOrderCloseForm = ReturnType<typeof useExecutionOrderCloseForm>;
