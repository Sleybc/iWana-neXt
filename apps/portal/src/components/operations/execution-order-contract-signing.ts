// Paso «Contrato» de la consola de OT (cierre de venta, bloque C; spec 2026-11-11 §5 C,
// CA-1, CA-12; ADR-109). Lógica pura y textos del paso: el componente solo compone.
import {
  CONTRACT_SIGNATURE_COORDINATE_DECIMALS,
  CONTRACT_SIGNER_DOCUMENT_TYPES,
  type ContractDocumentGeneration,
  type ContractSigner,
  type ExecutionOrderContract,
  type ProvisioningOrderContextDto,
  type ServiceProvisioningStatus,
  type TechnicianProvisioningViewDto,
} from '@iwana/shared';
import { ApiError } from '@/lib/api-client';
import { PORTAL_DOCUMENT_TYPE_LABELS } from '@/lib/user-labels';
import { OPERATOR_CONTRACT_FIELD_LABELS } from '@/components/settings/OperatorContractProfileSection';

/** Contrato de la OT que el panel de aprovisionamiento resolvió para el paso. */
export interface ExecutionOrderContractContext {
  contractId: string;
  /** Estado del contrato tal como lo publica el contexto de aprovisionamiento. */
  status: string;
  /** Nombre visible del titular para precargar quien firma; editable. */
  holderName: string;
  /** Estado del aprovisionamiento de la OT; habilita el paso (CERTIFIED/ACTIVE). */
  provisioningStatus: ServiceProvisioningStatus | null;
  /** Documento del titular para precargar quien firma (solo contrato sin firma); editable. */
  holderDocument?: { type: string | null; number: string | null };
}

/** Vista reducida del técnico más el contrato de la OT que publica CRM. */
export interface TechnicianContractSource {
  view: TechnicianProvisioningViewDto;
  contract: ExecutionOrderContract | null;
}

/**
 * Contrato pendiente de firma de la OT: el que el aprovisionamiento referencia o, si no
 * referencia ninguno, el único contrato en borrador del titular. En la vista del técnico usa
 * el contrato de la OT que publica CRM. Sin ambigüedad o sin contrato devuelve null.
 */
export function resolveExecutionOrderContract(
  context: ProvisioningOrderContextDto | null,
  technician: TechnicianContractSource | null = null,
): ExecutionOrderContractContext | null {
  if (!context) {
    const contract = technician?.contract;
    if (!technician || !contract) return null;
    return {
      contractId: contract.contractId,
      status: contract.status,
      holderName: contract.holder.fullName,
      provisioningStatus: technician.view.status,
      holderDocument: {
        type: contract.holder.documentType,
        number: contract.holder.documentNumber,
      },
    };
  }
  const referenced = context.provisioning?.contractId
    ? context.contracts.find((contract) => contract.id === context.provisioning?.contractId)
    : undefined;
  const drafts = context.contracts.filter((contract) => contract.status === 'DRAFT');
  const contract = referenced ?? (drafts.length === 1 ? drafts[0] : undefined);
  if (!contract) return null;
  return {
    contractId: contract.id,
    status: contract.status,
    holderName: context.subscriber.displayLabel,
    provisioningStatus: context.provisioning?.status ?? null,
  };
}

/** Servicio aprovisionado y certificado con la evidencia de servicio funcionando. */
/** Tipo de documento precargable si es uno de los admitidos para firmar; si no, null. */
export function signerDocumentTypeFrom(
  value: string | null | undefined,
): ContractSigner['documentType'] | null {
  return (CONTRACT_SIGNER_DOCUMENT_TYPES as readonly string[]).includes(value ?? '')
    ? (value as ContractSigner['documentType'])
    : null;
}

export function isProvisioningReadyForContract(status: ServiceProvisioningStatus | null): boolean {
  return status === 'CERTIFIED' || status === 'ACTIVE';
}

export const CONTRACT_STEP_COPY = {
  title: 'Contrato',
  pendingBadge: 'Pendiente de firma',
  signedBadge: 'Firmado',
  closedBadge: 'Sin firma pendiente',
  closedDescription:
    'El documento ya no se puede abrir desde la consola. Continúa con el acta de conformidad y el cierre de la OT.',
  unavailableBadge: 'No disponible',
  generate: 'Generar contrato',
  generating: 'Generando contrato…',
  slowGeneration:
    'La generación está tardando más de lo normal. Consulta de nuevo en unos segundos.',
  checkAgain: 'Consultar de nuevo',
  retryGeneration: 'Generar de nuevo',
  ready: 'Contrato listo para leer con el cliente.',
  documentTitle: 'Contrato para leer con el cliente',
  documentLoadError: 'No pudimos mostrar el contrato. Intenta de nuevo.',
  readingNotice:
    'Lee el contrato completo con el cliente antes de firmar. Este documento no se descarga ni se puede volver a abrir después de la firma.',
  signerLegend: 'Quién firma',
  signerName: 'Nombre completo',
  signerDocumentType: 'Tipo de documento',
  signerDocumentNumber: 'Número de documento',
  signerHint: 'Precargado con el titular; corrígelo si firma otra persona autorizada.',
  signatureInstructions:
    'Pide al cliente que firme el contrato. Dibuja la firma dentro del recuadro con el dedo, un lápiz o el ratón.',
  sign: 'Firmar contrato',
  signing: 'Firmando contrato…',
  signed: 'Contrato firmado',
  signedDescription:
    'El contrato quedó firmado y activo. Continúa con el acta de conformidad y el cierre de la OT.',
  locationNotice:
    'Si el dispositivo lo permite, se guarda la ubicación aproximada como evidencia de la firma.',
  disabledNotInProgress: 'Se habilita cuando la OT esté en ejecución.',
  disabledNoPermission: 'No tienes permiso para registrar el contrato en esta OT.',
  disabledOffline: 'Sin conexión; vuelve a intentar cuando recuperes la red.',
  disabledSync: 'La OT se está sincronizando; actualiza el detalle antes de continuar.',
  disabledProvisioning:
    'Se habilita cuando el servicio esté aprovisionado y certificado con la evidencia de servicio funcionando.',
  operatorDataHint:
    'Pide a un administrador que los complete en Configuración, sección Organización.',
} as const;

export const CONTRACT_SIGNER_DOCUMENT_OPTIONS = CONTRACT_SIGNER_DOCUMENT_TYPES.map((value) => ({
  value,
  label: PORTAL_DOCUMENT_TYPE_LABELS[value],
}));

/** Espera progresiva del sondeo: 1 s, 2 s, 3 s, 5 s y luego cada 8 s. */
const POLL_DELAYS_MS = [1_000, 2_000, 3_000, 5_000, 8_000] as const;
/** Pasado este tiempo el sondeo se detiene y ofrece consultar de nuevo. */
export const CONTRACT_GENERATION_POLL_LIMIT_MS = 120_000;

export function contractGenerationPollDelay(attempt: number): number {
  return POLL_DELAYS_MS[Math.min(attempt, POLL_DELAYS_MS.length - 1)]!;
}

export interface ContractGenerationFailureCopy {
  title: string;
  description: string;
  /** Datos del operador que faltan, ya traducidos (CA-11). */
  missingFields: string[];
}

export function contractGenerationFailureCopy(
  generation: Pick<ContractDocumentGeneration, 'failureReason' | 'missingOperatorFields'>,
): ContractGenerationFailureCopy {
  switch (generation.failureReason) {
    case 'TEMPLATE_NOT_APPROVED':
      return {
        title: 'No hay una plantilla de contrato aprobada',
        description:
          'La plantilla del contrato debe estar aprobada por asesoría jurídica antes de firmar. Pide a un administrador que la publique.',
        missingFields: [],
      };
    case 'OPERATOR_DATA_MISSING':
      return {
        title: 'Faltan datos de la empresa para el contrato',
        description: CONTRACT_STEP_COPY.operatorDataHint,
        missingFields: generation.missingOperatorFields.map(
          (field) => OPERATOR_CONTRACT_FIELD_LABELS[field],
        ),
      };
    case 'SUBSCRIBER_BLOCKED':
      return {
        title: 'No se puede generar el contrato',
        description:
          'Los datos del titular están bloqueados; no se genera ni se firma el contrato.',
        missingFields: [],
      };
    default:
      return {
        title: 'No pudimos generar el contrato',
        description: 'Ocurrió un fallo al preparar el PDF. Intenta generarlo de nuevo.',
        missingFields: [],
      };
  }
}

export type ContractStepErrorKind =
  /** Reintentar con la misma clave (503 o red). */
  | 'retry'
  /** El documento cambió: generar y leer de nuevo. */
  | 'regenerate'
  /** El contrato ya no está pendiente (firmado o activado). */
  | 'not-draft'
  /** Sin salida desde la consola. */
  | 'final';

export interface ContractStepError {
  kind: ContractStepErrorKind;
  message: string;
}

function isNetworkFailure(error: unknown): boolean {
  // fetch rechaza con TypeError cuando no hay red; otros TypeError son defectos, no reintentos.
  if (error instanceof TypeError) return /fetch|network|load/i.test(error.message);
  return (
    error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')
  );
}

/** Traduce el error de generación, lectura o firma a un mensaje y una salida. */
export function contractStepError(error: unknown): ContractStepError {
  if (isNetworkFailure(error)) {
    return {
      kind: 'retry',
      message: 'No hubo respuesta del servidor. Revisa la conexión y reintenta.',
    };
  }
  if (!(error instanceof ApiError)) {
    return { kind: 'retry', message: 'No fue posible completar la operación. Reintenta.' };
  }
  if (error.status === 503) {
    return {
      kind: 'retry',
      message:
        'El servidor no pudo terminar la firma. Reintenta: el contrato no se firmará dos veces.',
    };
  }
  if (error.status === 403) {
    return error.code === 'CONTRACT_DOCUMENT_SIGNED'
      ? { kind: 'not-draft', message: 'El contrato ya está firmado.' }
      : { kind: 'final', message: 'No tienes acceso al contrato de esta orden.' };
  }
  if (error.status === 404) {
    return {
      kind: 'regenerate',
      message: 'El contrato ya no está disponible. Genéralo de nuevo.',
    };
  }
  if (error.status === 409) {
    switch (error.code) {
      case 'CONTRACT_NOT_DRAFT':
        return { kind: 'not-draft', message: 'Este contrato ya no está pendiente de firma.' };
      case 'PROVISIONING_NOT_ACTIVE':
        return {
          kind: 'final',
          message:
            'El servicio de este contrato aún no figura como activo. Revisa el aprovisionamiento y reintenta.',
        };
      case 'CONTRACT_DOCUMENT_NOT_READY':
      case 'CONTRACT_DOCUMENT_HASH_MISMATCH':
      case 'CONTRACT_DOCUMENT_INTEGRITY_FAILED':
        return {
          kind: 'regenerate',
          message:
            'El contrato cambió desde que se mostró. Genéralo de nuevo y léelo con el cliente.',
        };
      case 'IDEMPOTENCY_KEY_REUSED':
        return {
          kind: 'retry',
          message: 'La firma cambió durante el reintento. Vuelve a firmar el contrato.',
        };
      default:
        return {
          kind: 'final',
          message: 'No se puede firmar este contrato: el titular tiene restricciones vigentes.',
        };
    }
  }
  if (error.status === 422) {
    return {
      kind: 'final',
      message: 'Los datos de la firma no son válidos. Revisa el nombre, el documento y la firma.',
    };
  }
  return { kind: 'retry', message: 'No fue posible completar la operación. Reintenta.' };
}

/** Redondeo a 3 decimales (≈110 m): precisión limitada de la evidencia (spec §6). */
export function roundContractCoordinate(value: number): number {
  return Number(value.toFixed(CONTRACT_SIGNATURE_COORDINATE_DECIMALS));
}

/** Ubicación aproximada opcional; null si no hay soporte, se niega o vence el tiempo. */
export function readApproximateLocation(
  timeoutMs = 8_000,
): Promise<{ latitude: number; longitude: number } | null> {
  const geolocation = typeof navigator !== 'undefined' ? navigator.geolocation : undefined;
  if (!geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: { latitude: number; longitude: number } | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs + 500);
    try {
      geolocation.getCurrentPosition(
        (position) =>
          finish({
            latitude: roundContractCoordinate(position.coords.latitude),
            longitude: roundContractCoordinate(position.coords.longitude),
          }),
        () => finish(null),
        { enableHighAccuracy: false, maximumAge: 60_000, timeout: timeoutMs },
      );
    } catch {
      finish(null);
    }
  });
}

/** Dispositivo de la firma, recortado a los límites del contrato. */
export function readSigningDevice(): { userAgent: string; platform: string | null } {
  const userAgent = (typeof navigator !== 'undefined' ? navigator.userAgent : '').trim();
  const rawPlatform =
    typeof navigator !== 'undefined'
      ? ((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
          ?.platform ?? navigator.platform)
      : '';
  const platform = rawPlatform?.trim().slice(0, 64) ?? '';
  return {
    userAgent: (userAgent || 'Navegador sin identificar').slice(0, 512),
    platform: platform.length > 0 ? platform : null,
  };
}

export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('read'));
    reader.onerror = () => reject(reader.error ?? new Error('read'));
    reader.readAsDataURL(file);
  });
}

/** Huella de un intento: si cambia, la clave de idempotencia también (evita IDEMPOTENCY_KEY_REUSED). */
export function contractSignatureAttemptFingerprint(
  generationId: string,
  signer: ContractSigner,
  signatureImage: string,
): string {
  return JSON.stringify([
    generationId,
    signer.fullName,
    signer.documentType,
    signer.documentNumber,
    signatureImage,
  ]);
}

/** Motivo visible por el que el paso no se puede operar; null si está habilitado. */
export function contractStepDisabledReason(input: {
  inProgress: boolean;
  canRegister: boolean;
  offline: boolean;
  inSync: boolean;
  provisioningStatus: ServiceProvisioningStatus | null;
}): string | null {
  if (!input.inProgress) return CONTRACT_STEP_COPY.disabledNotInProgress;
  if (!input.canRegister) return CONTRACT_STEP_COPY.disabledNoPermission;
  if (input.offline) return CONTRACT_STEP_COPY.disabledOffline;
  if (!input.inSync) return CONTRACT_STEP_COPY.disabledSync;
  if (!isProvisioningReadyForContract(input.provisioningStatus)) {
    return CONTRACT_STEP_COPY.disabledProvisioning;
  }
  return null;
}
