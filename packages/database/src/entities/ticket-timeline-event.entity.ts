import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { TicketTimelineEventType } from '@iwana/shared';

/**
 * Entidad TicketTimelineEvent — schema por tenant (dinamico via search_path).
 *
 * Registro append-only de eventos del ciclo de vida de un ticket.
 * Sin soft-delete, sin UpdateDateColumn — la timeline es inmutable.
 *
 * HLD-MOD10-SERVICE-ASSURANCE-v1.0 §4
 */
@Index('idx_ticket_timeline_ticket', ['ticketId', 'occurredAt'])
@Entity({ name: 'ticket_timeline_events' })
export class TicketTimelineEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK logica a support_tickets.id — sin FK referencial */
  @Column({ name: 'ticket_id', type: 'uuid' })
  ticketId: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'event_type', type: 'enum', enum: TicketTimelineEventType })
  eventType: TicketTimelineEventType;

  /** Datos adicionales del evento — estructura libre segun eventType */
  @Column({ type: 'jsonb', default: {} })
  payload: Record<string, unknown>;

  /** Usuario que origino el evento — null si fue automatico */
  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId: string | null;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt: Date;
}
