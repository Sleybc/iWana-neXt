import type { ExpedienteStatus } from '@/lib/api-client';

export const INSTALLATION_SCHEDULING_MIN_PROGRESS = 75;

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

  return `/dashboard/scheduling?${searchParams.toString()}`;
}
