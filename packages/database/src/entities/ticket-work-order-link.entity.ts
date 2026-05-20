import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Entidad TicketWorkOrderLink — schema por tenant (dinamico via search_path).
 *
 * Registro del vinculo entre un ticket de soporte y una Work Order de WFM.
 * Referencia logica — sin FK referencial cross-module.
 * Entidad append-only: la solicitud de campo queda trazada permanentemente.
 *
 * HLD-MOD10-SERVICE-ASSURANCE-v1.0 §4
 */
@Index('idx_ticket_wo_links_ticket', ['ticketId'])
@Entity({ name: 'ticket_work_order_links' })
export class TicketWorkOrderLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK logica a support_tickets.id — sin FK referencial */
  @Column({ name: 'ticket_id', type: 'uuid' })
  ticketId: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  /** Referencia logica a work_orders.id (WFM) — sin FK referencial cross-module */
  @Column({ name: 'work_order_id', type: 'uuid', nullable: true })
  workOrderId: string | null;

  @Column({ name: 'requested_at', type: 'timestamptz' })
  requestedAt: Date;

  @Column({ name: 'requested_by_user_id', type: 'uuid' })
  requestedByUserId: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
