export enum ScheduleEventStatus {
  DRAFT = 'DRAFT',
  SCHEDULED = 'SCHEDULED',
  EN_ROUTE = 'EN_ROUTE',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  RESCHEDULED = 'RESCHEDULED',
  NO_SHOW = 'NO_SHOW',
  /** Evento vencido por barrido automático — no se cerró a tiempo (H2) */
  EXPIRED = 'EXPIRED',
}
