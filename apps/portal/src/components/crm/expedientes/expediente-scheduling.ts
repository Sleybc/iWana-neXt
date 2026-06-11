import type { ExpedienteStatus } from '@/lib/api-client';

export const INSTALLATION_SCHEDULING_MIN_PROGRESS = 75;
const INSTALLATION_REQUIRED_OPERATIONAL_REFS = new Set([
  'ticket vinculado',
  'orden de trabajo vinculada',
]);

interface ScheduleInstallationEligibilityInput {
  status: ExpedienteStatus;
  overallProgress: number;
  canTransition: boolean;
}

export function canScheduleInstallation({
  status,
  overallProgress,
  canTransition,
}: ScheduleInstallationEligibilityInput): boolean {
  return (
    status === 'LISTO_PARA_INSTALACION' &&
    canTransition &&
    overallProgress >= INSTALLATION_SCHEDULING_MIN_PROGRESS
  );
}

export function buildSchedulingHref(expedienteId: string): string {
  const searchParams = new URLSearchParams({
    open: 'create',
    type: 'INSTALLATION',
    expedienteId,
  });

  return `/dashboard/scheduling/agenda?${searchParams.toString()}`;
}

function normalizeRequirementLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('es-CO');
}

export function hasMissingOperationalRefsForInstallation(missingFields: string[]): boolean {
  const normalized = new Set(missingFields.map((field) => normalizeRequirementLabel(field)));

  return Array.from(INSTALLATION_REQUIRED_OPERATIONAL_REFS).some((requiredField) =>
    normalized.has(requiredField),
  );
}
