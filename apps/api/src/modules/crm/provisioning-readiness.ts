import { ExpedienteStatus, SubscriberStatus } from '@iwana/shared';

export const PROVISIONING_READINESS_STATUS = {
  PENDIENTE_DE_DATOS: 'PENDIENTE_DE_DATOS',
  LISTO_PARA_APROVISIONAR: 'LISTO_PARA_APROVISIONAR',
  BLOQUEADO: 'BLOQUEADO',
  ERROR_REINTENTABLE: 'ERROR_REINTENTABLE',
  APROVISIONADO: 'APROVISIONADO',
} as const;

export type ProvisioningReadinessStatus =
  (typeof PROVISIONING_READINESS_STATUS)[keyof typeof PROVISIONING_READINESS_STATUS];

export interface ProvisioningReadinessSummary {
  status: ProvisioningReadinessStatus;
  title: string;
  message: string;
  canProvision: boolean;
  retryable: boolean;
  missingRequirements: string[];
}

export interface EvaluateProvisioningReadinessInput {
  expedienteStatus: ExpedienteStatus | null;
  subscriberStatus: SubscriberStatus | null;
  hasPartyOrDocument: boolean;
  hasInstallationAddress: boolean;
  hasSiteContact: boolean;
  hasCommercialOffer: boolean;
  hasTechnologyDefinition: boolean;
  hasTicketReference: boolean;
  hasWorkOrderReference: boolean;
  hasAssignedTechnician: boolean;
  hasMinimumConsent: boolean;
  isBlocked: boolean;
  blockedReason?: string | null;
  hasRetryableError: boolean;
  retryableErrorMessage?: string | null;
}

function normalizeCode(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toUpperCase();
}

export function isBlockingLegalComplianceStatus(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = normalizeCode(value);

  return (
    normalized.includes('NO_AUTORIZA') ||
    normalized.includes('NO AUTORIZA') ||
    normalized.includes('RECHAZ') ||
    normalized.includes('INVALID') ||
    normalized.includes('INCOMPLETO')
  );
}

function buildMissingRequirements(input: EvaluateProvisioningReadinessInput): string[] {
  const missingRequirements: string[] = [];

  if (!input.hasPartyOrDocument) missingRequirements.push('Documento o party del suscriptor');
  if (!input.hasInstallationAddress) missingRequirements.push('Dirección de instalación');
  if (!input.hasSiteContact) missingRequirements.push('Contacto operativo de instalación');
  if (!input.hasCommercialOffer) missingRequirements.push('Plan o servicio comercial');
  if (!input.hasTechnologyDefinition)
    missingRequirements.push('Definición de tecnología/cobertura');
  if (!input.hasTicketReference) missingRequirements.push('Ticket de instalación');
  if (!input.hasWorkOrderReference) missingRequirements.push('Orden de trabajo');
  if (!input.hasAssignedTechnician) missingRequirements.push('Técnico asignado');
  if (!input.hasMinimumConsent) missingRequirements.push('Consentimientos mínimos vigentes');

  return missingRequirements;
}

export function evaluateProvisioningReadiness(
  input: EvaluateProvisioningReadinessInput,
): ProvisioningReadinessSummary {
  if (input.hasRetryableError) {
    return {
      status: PROVISIONING_READINESS_STATUS.ERROR_REINTENTABLE,
      title: 'Error reintentable en preparación',
      message:
        input.retryableErrorMessage ??
        'La preparación del subscriber falló. Reintenta la sincronización operativa.',
      canProvision: false,
      retryable: true,
      missingRequirements: [],
    };
  }

  if (input.isBlocked) {
    return {
      status: PROVISIONING_READINESS_STATUS.BLOQUEADO,
      title: 'Preparación bloqueada',
      message:
        input.blockedReason ??
        'Existe una restricción operativa o legal que impide continuar con aprovisionamiento.',
      canProvision: false,
      retryable: false,
      missingRequirements: [],
    };
  }

  const subscriberIsOperational =
    input.subscriberStatus === SubscriberStatus.PROSPECT ||
    input.subscriberStatus === SubscriberStatus.ACTIVE;

  if (!subscriberIsOperational) {
    return {
      status: PROVISIONING_READINESS_STATUS.BLOQUEADO,
      title: 'Subscriber no operativo',
      message:
        'El subscriber no está en estado operativo para preparar aprovisionamiento (se requiere PROSPECT o ACTIVE).',
      canProvision: false,
      retryable: false,
      missingRequirements: [],
    };
  }

  const missingRequirements = buildMissingRequirements(input);

  if (missingRequirements.length > 0) {
    return {
      status: PROVISIONING_READINESS_STATUS.PENDIENTE_DE_DATOS,
      title: 'Preparación pendiente',
      message:
        'El subscriber existe, pero todavía faltan datos mínimos para dejarlo listo para aprovisionar.',
      canProvision: false,
      retryable: false,
      missingRequirements,
    };
  }

  return {
    status: PROVISIONING_READINESS_STATUS.LISTO_PARA_APROVISIONAR,
    title: 'Listo para aprovisionar',
    message:
      input.expedienteStatus === ExpedienteStatus.CLIENTE_ACTIVO
        ? 'El subscriber está activo y cuenta con los datos mínimos para operación técnica.'
        : 'El subscriber cuenta con los datos mínimos para que Provisioning futuro inicie la ejecución técnica.',
    canProvision: true,
    retryable: false,
    missingRequirements: [],
  };
}
