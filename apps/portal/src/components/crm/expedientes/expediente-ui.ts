import type { ExpedienteStatus } from '@/lib/api-client';

export type StatusBadgeVariant =
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'neutral'
  | 'primary'
  | 'lime';

export const EXPEDIENTE_STATUS_META: Record<
  ExpedienteStatus,
  { label: string; variant: StatusBadgeVariant }
> = {
  NUEVO_POTENCIAL: { label: 'Nuevo', variant: 'info' },
  CONTACTADO: { label: 'Contactado', variant: 'primary' },
  PENDIENTE_DATOS: { label: 'Pendiente datos', variant: 'warning' },
  PRECALIFICADO: { label: 'Precalificado', variant: 'primary' },
  VALIDANDO_COBERTURA: { label: 'Validando cobertura', variant: 'primary' },
  VIABLE_COMERCIALMENTE: { label: 'Viable', variant: 'lime' },
  EN_COTIZACION: { label: 'En cotización', variant: 'info' },
  PENDIENTE_DECISION: { label: 'Pendiente decisión', variant: 'warning' },
  LISTO_PARA_INSTALACION: { label: 'Listo instalación', variant: 'lime' },
  INSTALACION_AGENDADA: { label: 'Instalación agendada', variant: 'success' },
  CLIENTE_ACTIVO: { label: 'Activo', variant: 'success' },
  DESCARTADO: { label: 'Descartado', variant: 'neutral' },
};

export function formatExpedienteStatus(status: string): string {
  return EXPEDIENTE_STATUS_META[status as ExpedienteStatus]?.label ?? status.replace(/_/g, ' ');
}

export function formatCrmDate(value: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
  }).format(new Date(value));
}

export function formatCrmDateTime(value: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
