/**
 * Barrel export de entidades TypeORM del paquete @iwana/db.
 * Sprint 1 — Entidades de MOD01: Auth + Tenant + Audit.
 * Sprint 2 — Entidades de MOD03: Media/Assets.
 */

// Schema publico
export { Tenant } from './tenant.entity';
export { PlatformUser } from './platform-user.entity';
export { PlatformAuditLog } from './platform-audit-log.entity';
export { PlatformBrandingSettings } from './platform-branding-settings.entity';
export { MediaAsset, MediaUsage } from './media-asset.entity';
export type { MediaThemeVariant } from './media-asset.entity';

// Schema por tenant (dinamico via SET LOCAL search_path)
export { User } from './user.entity';
export { RefreshToken } from './refresh-token.entity';
export { AuditLog } from './audit-log.entity';

// MOD09 — WFM / Programacion Fase 1
export { ScheduleEvent } from './schedule-event.entity';
export { WorkOrder } from './work-order.entity';
export { WorkOrderTask } from './work-order-task.entity';
export { ScheduleRescheduleLog } from './schedule-reschedule-log.entity';
export { TechnicianAvailability } from './technician-availability.entity';
export { VisitRequest } from './visit-request.entity';

// MOD10 — Service Assurance
export { SupportTicket } from './support-ticket.entity';
export { TicketComment } from './ticket-comment.entity';
export { TicketPqrRecord } from './ticket-pqr-record.entity';
export { TicketSlaPolicy } from './ticket-sla-policy.entity';
export { TicketTimelineEvent } from './ticket-timeline-event.entity';
export { TicketWorkOrderLink } from './ticket-work-order-link.entity';
