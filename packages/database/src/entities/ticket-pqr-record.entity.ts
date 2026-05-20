import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PqrDeadlineType } from '@iwana/shared';

/**
 * Entidad TicketPqrRecord — schema por tenant (dinamico via search_path).
 *
 * Registro de plazos regulatorios CRC para tickets de tipo PQR.
 * Cada plazo (respuesta inicial, resolucion final, correccion) se registra
 * como una fila independiente para trazabilidad completa.
 *
 * HLD-MOD10-SERVICE-ASSURANCE-v1.0 §4
 */
@Index('idx_ticket_pqr_records_ticket', ['ticketId'])
@Entity({ name: 'ticket_pqr_records' })
export class TicketPqrRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK logica a support_tickets.id — sin FK referencial */
  @Column({ name: 'ticket_id', type: 'uuid' })
  ticketId: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  /** Numero de radicacion ante la CRC — null si aun no asignado */
  @Column({ name: 'pqr_number', type: 'varchar', length: 50, nullable: true })
  pqrNumber: string | null;

  @Column({ name: 'deadline_type', type: 'enum', enum: PqrDeadlineType })
  deadlineType: PqrDeadlineType;

  @Column({ name: 'deadline_at', type: 'timestamptz' })
  deadlineAt: Date;

  @Column({ name: 'notified_at', type: 'timestamptz', nullable: true })
  notifiedAt: Date | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
