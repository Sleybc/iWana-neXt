import type { BadgeProps } from '@iwana/ui';
import {
  UserRole,
  VisitRequestStatus,
  WorkOrderPriority,
  WorkOrderSourceContext,
} from '@iwana/shared';
import type { WfmVisitRequest } from '@/lib/api-client';
import { formatExpedienteDisplayRef } from '@/lib/expediente-labels';
import { formatLocationLabel } from '@/components/crm/subscribers/subscriber-ui';

type BadgeVariant = NonNullable<BadgeProps['variant']>;

/** ADR-077 — chip informativo de reintento para la bandeja de pendientes. */
export interface RetryChipInfo {
  label: string;
  variant: BadgeVariant;
  accessibleText: string;
}

export function getVisitRequestRetryChip(visitRequest: WfmVisitRequest): RetryChipInfo | null {
  if (visitRequest.status !== VisitRequestStatus.REQUIRES_RESCHEDULE) {
    return null;
  }

  const retryCount = visitRequest.retryCount ?? 0;

  if (retryCount >= 3) {
    return {
      label: 'Requiere decisión',
      variant: 'error',
      accessibleText:
        'Se agotaron los tres intentos. Alguien debe decidir si continúa o se cierra.',
    };
  }

  if (retryCount > 0) {
    return {
      label: `Intento ${retryCount} de 3`,
      variant: 'warning',
      accessibleText: visitRequest.lastNonRealizationCauseLabel
        ? `La visita no se pudo hacer: ${visitRequest.lastNonRealizationCauseLabel}. Es el intento ${retryCount}.`
        : `La visita no se pudo hacer. Es el intento ${retryCount}.`,
    };
  }

  // Causa de operación: no consume intento
  return {
    label: 'Reprogramar',
    variant: 'neutral',
    accessibleText: 'La visita no se hizo por una novedad de la operación.',
  };
}

/** ADR-077 — indica si se alcanzó el límite de intentos (solo causas de cliente). */
export function hasExhaustedRetries(visitRequest: WfmVisitRequest): boolean {
  return (visitRequest.retryCount ?? 0) >= 3;
}

/**
 * ADR-077 D4 / E5 — chip «Requiere decisión»: status real REQUIRES_RESCHEDULE y 3 intentos.
 * La CTA de agendar debe ceder a la de decidir (no muro silencioso).
 */
export function requiresAttemptDecision(visitRequest: WfmVisitRequest): boolean {
  return (
    visitRequest.status === VisitRequestStatus.REQUIRES_RESCHEDULE &&
    hasExhaustedRetries(visitRequest)
  );
}

export interface PendingVisitFilters {
  status: '' | VisitRequestStatus;
  originContext: '' | WorkOrderSourceContext;
  priority: '' | WorkOrderPriority;
  municipality: string;
  sector: string;
  page: number;
  limit: number;
}

const visitRequestStatusMeta: Record<
  VisitRequestStatus,
  { label: string; variant: BadgeVariant; description: string }
> = {
  [VisitRequestStatus.PENDING]: {
    label: 'Pendiente',
    variant: 'warning',
    description: 'Requiere validación operativa antes de programar.',
  },
  [VisitRequestStatus.NEEDS_CONTEXT]: {
    label: 'Falta contexto',
    variant: 'error',
    description: 'Hace falta completar dirección o municipio para recomendar.',
  },
  [VisitRequestStatus.READY_TO_SCHEDULE]: {
    label: 'Lista para agendar',
    variant: 'success',
    description: 'Ya tiene datos suficientes para elegir técnico y franja.',
  },
  [VisitRequestStatus.SCHEDULED]: {
    label: 'Agendada',
    variant: 'primary',
    description: 'La solicitud ya generó evento y orden de trabajo.',
  },
  [VisitRequestStatus.IN_EXECUTION]: {
    label: 'En ejecución',
    variant: 'info',
    description: 'La visita está siendo ejecutada por el técnico asignado.',
  },
  [VisitRequestStatus.CLOSED]: {
    label: 'Cerrada',
    variant: 'success',
    description: 'La visita fue completada y cerrada operativamente.',
  },
  [VisitRequestStatus.REQUIRES_RESCHEDULE]: {
    label: 'Requiere reagendar',
    variant: 'warning',
    description: 'La visita necesita ser reprogramada por novedad operativa.',
  },
  [VisitRequestStatus.CANCELLED]: {
    label: 'Cancelada',
    variant: 'neutral',
    description: 'Se cerró sin ejecutar programación.',
  },
  [VisitRequestStatus.REJECTED]: {
    label: 'Rechazada',
    variant: 'error',
    description: 'Se descartó por decisión operativa o inconsistencia.',
  },
  [VisitRequestStatus.EXPIRED]: {
    label: 'Expirada',
    variant: 'warning',
    description: 'La ventana comprometida venció sin agenda confirmada.',
  },
};

const visitRequestOriginLabels: Record<WorkOrderSourceContext, string> = {
  [WorkOrderSourceContext.CRM]: 'CRM',
  [WorkOrderSourceContext.ASSURANCE]: 'Mesa de ayuda',
  [WorkOrderSourceContext.PROVISIONING]: 'Provisionamiento',
  [WorkOrderSourceContext.TASKS]: 'Tareas',
  [WorkOrderSourceContext.MANUAL]: 'Manual',
};

const PENDING_VISIT_ROLES = new Set<string>([
  UserRole.ADMIN,
  UserRole.NOC,
  UserRole.SUPPORT,
  UserRole.SALES,
]);

const TERMINAL_VISIT_REQUEST_STATUSES = new Set<VisitRequestStatus>([
  VisitRequestStatus.SCHEDULED,
  VisitRequestStatus.CANCELLED,
  VisitRequestStatus.REJECTED,
  VisitRequestStatus.EXPIRED,
]);

export function canAccessPendingVisits(role: string | null | undefined): boolean {
  return Boolean(role && PENDING_VISIT_ROLES.has(role));
}

export function isTerminalVisitRequestStatus(status: VisitRequestStatus): boolean {
  return TERMINAL_VISIT_REQUEST_STATUSES.has(status);
}

export function filterActionablePendingVisitRequests(
  visitRequests: WfmVisitRequest[] | null | undefined,
): WfmVisitRequest[] {
  return (visitRequests ?? []).filter(
    (visitRequest) => !isTerminalVisitRequestStatus(visitRequest.status),
  );
}

export function buildDefaultPendingVisitFilters(): PendingVisitFilters {
  return {
    status: '',
    originContext: '',
    priority: '',
    municipality: '',
    sector: '',
    page: 1,
    limit: 20,
  };
}

export function getVisitRequestStatusLabel(status: VisitRequestStatus): string {
  return visitRequestStatusMeta[status].label;
}

export function getVisitRequestStatusVariant(status: VisitRequestStatus): BadgeVariant {
  return visitRequestStatusMeta[status].variant;
}

export function getVisitRequestStatusDescription(status: VisitRequestStatus): string {
  return visitRequestStatusMeta[status].description;
}

export function getVisitRequestOriginLabel(originContext: WorkOrderSourceContext): string {
  return visitRequestOriginLabels[originContext];
}

export function getVisitRequestReferenceLabel(visitRequest: WfmVisitRequest): string {
  if (visitRequest.originLabel?.trim()) {
    return visitRequest.originLabel;
  }

  if (visitRequest.originContext === WorkOrderSourceContext.CRM && visitRequest.expedienteId) {
    return formatExpedienteDisplayRef(visitRequest.expedienteId);
  }

  if (visitRequest.ticketId?.trim()) {
    return `Ticket ${visitRequest.ticketId}`;
  }

  if (visitRequest.originRef?.trim()) {
    return visitRequest.originRef;
  }

  return 'Solicitud sin referencia visible';
}

export function formatVisitRequestLocationLabel(value: string | null | undefined): string {
  return formatLocationLabel(value);
}

export function formatVisitRequestTerritory(
  municipality: string | null | undefined,
  sector: string | null | undefined,
): string {
  const municipalityLabel = formatVisitRequestLocationLabel(municipality);
  const sectorLabel = formatVisitRequestLocationLabel(sector);

  if (municipalityLabel && sectorLabel) {
    return `${municipalityLabel} · ${sectorLabel}`;
  }

  return municipalityLabel || sectorLabel || 'Municipio no definido';
}

export function getVisitRequestMissingFields(visitRequest: WfmVisitRequest): string[] {
  const missing: string[] = [];

  if (!visitRequest.address?.trim()) {
    missing.push('Dirección operativa');
  }

  if (!visitRequest.municipality?.trim()) {
    missing.push('Municipio');
  }

  return missing;
}

export function getVisitRequestPresentationStatus(
  visitRequest: WfmVisitRequest,
): VisitRequestStatus {
  return visitRequest.status;
}
