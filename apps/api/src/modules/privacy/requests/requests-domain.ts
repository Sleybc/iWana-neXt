import {
  addCalendarMonths,
  addColombiaBusinessDays,
  RequestKind,
  RequestStatus,
  RequestTaskKind,
} from '@iwana/shared';

const REQUEST_DUE_DAYS: Record<RequestKind, number> = {
  CONSULTA: 10,
  RECLAMO: 15,
  SUPLANTACION: 10,
};

export function calculateInitialDueAt(
  kind: RequestKind,
  receivedAt: string,
  completeAt: string | null,
): string {
  const baseDate = kind === 'RECLAMO' ? (completeAt ?? receivedAt) : receivedAt;
  return addColombiaBusinessDays(baseDate, REQUEST_DUE_DAYS[kind]);
}

export function calculateImpersonationComplaintDueAt(receivedAt: string): string {
  return addColombiaBusinessDays(receivedAt, 20);
}

export function calculateRequestTaskDueAt(
  kind: RequestTaskKind,
  receivedAt: string,
  requestDueAt: string,
): string {
  return kind === 'SUSPENDER_COBRO_EXTERNO' ? receivedAt : requestDueAt;
}

export function calculateDesistAt(infoRequiredAt: string): string {
  return addCalendarMonths(infoRequiredAt, 2);
}

export function calculateExtendedUntil(kind: RequestKind, dueAt: string): string {
  if (kind === 'SUPLANTACION') {
    throw new RangeError('La suplantación no admite prórroga en esta fase.');
  }
  return addColombiaBusinessDays(dueAt, kind === 'CONSULTA' ? 5 : 8);
}

export function isWithinBusinessDeadline(
  actionDate: string,
  receivedAt: string,
  days: number,
): boolean {
  return actionDate <= addColombiaBusinessDays(receivedAt, days);
}

const TRANSITIONS: Record<string, readonly RequestStatus[]> = {
  'RADICADA:require-info': ['INCOMPLETA'],
  'EN_TRAMITE:require-info': ['INCOMPLETA'],
  'RADICADA:complete': ['EN_TRAMITE'],
  'INCOMPLETA:complete': ['EN_TRAMITE'],
  'EN_TRAMITE:extend': ['PRORROGADA'],
  'EN_TRAMITE:resolve': ['RESUELTA'],
  'PRORROGADA:resolve': ['RESUELTA'],
  'RADICADA:reject': ['NO_PROCEDENTE'],
  'INCOMPLETA:reject': ['NO_PROCEDENTE'],
  'EN_TRAMITE:reject': ['NO_PROCEDENTE'],
  'PRORROGADA:reject': ['NO_PROCEDENTE'],
  'RADICADA:transfer': ['TRASLADADA'],
  'INCOMPLETA:transfer': ['TRASLADADA'],
};

export type RequestAction =
  | 'require-info'
  | 'complete'
  | 'extend'
  | 'resolve'
  | 'reject'
  | 'transfer';

export function requestTransitionAllowed(status: RequestStatus, action: RequestAction): boolean {
  return (TRANSITIONS[`${status}:${action}`]?.length ?? 0) > 0;
}

export function nextRequestStatus(status: RequestStatus, action: RequestAction): RequestStatus {
  const nextStatus = TRANSITIONS[`${status}:${action}`]?.[0];
  if (!nextStatus) {
    throw new RangeError(`La acción ${action} no aplica desde el estado ${status}.`);
  }
  return nextStatus;
}

export function civilDateAtBogotaNoon(date: string): string {
  return `${date}T17:00:00.000Z`;
}
