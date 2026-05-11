import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Entidad TicketSlaPolicy — schema por tenant (dinamico via search_path).
 *
 * Politica de SLA configurable por tenant. Puede aplicarse a un tipo de ticket
 * especifico, una prioridad especifica, o ambos. La politica mas especifica gana.
 *
 * HLD-MOD10-SERVICE-ASSURANCE-v1.0 §4
 */
@Index('idx_ticket_sla_policies_tenant', ['tenantId'])
@Entity({ name: 'ticket_sla_policies' })
export class TicketSlaPolicy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  /** Tipo de ticket al que aplica (valor de TicketType como string) — null = cualquiera */
  @Column({ name: 'applies_to_type', type: 'varchar', length: 50, nullable: true })
  appliesToType: string | null;

  /** Prioridad a la que aplica (valor de TicketPriority como string) — null = cualquiera */
  @Column({ name: 'applies_to_priority', type: 'varchar', length: 50, nullable: true })
  appliesToPriority: string | null;

  /** Minutos para primera respuesta desde creacion */
  @Column({ name: 'first_response_minutes', type: 'int' })
  firstResponseMinutes: number;

  /** Minutos para resolucion desde creacion */
  @Column({ name: 'resolution_minutes', type: 'int' })
  resolutionMinutes: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
