import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Entidad TicketComment — schema por tenant (dinamico via search_path).
 *
 * Comentarios internos y externos de un ticket de soporte.
 * Entidad append-only: sin soft-delete ni UpdateDateColumn.
 *
 * HLD-MOD10-SERVICE-ASSURANCE-v1.0 §4
 */
@Index('idx_ticket_comments_ticket', ['ticketId'])
@Entity({ name: 'ticket_comments' })
export class TicketComment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK logica a support_tickets.id — sin FK referencial */
  @Column({ name: 'ticket_id', type: 'uuid' })
  ticketId: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'text' })
  body: string;

  /** Comentario interno: no visible al solicitante externo */
  @Column({ name: 'is_internal', type: 'boolean', default: false })
  isInternal: boolean;

  /** Autor del comentario — referencia logica a users.id */
  @Column({ name: 'author_user_id', type: 'uuid' })
  authorUserId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
