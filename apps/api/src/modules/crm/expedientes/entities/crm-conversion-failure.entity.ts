import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'crm_conversion_failures' })
@Index('uq_crm_conversion_failure', ['expedienteId', 'eventName'], { unique: true })
export class CrmConversionFailure {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'uuid', name: 'expediente_id' })
  expedienteId: string;

  @Column({ type: 'varchar', length: 80, name: 'event_name' })
  eventName: string;

  @Column({ type: 'varchar', length: 80, name: 'error_code' })
  errorCode: string;

  @Column({ type: 'int', name: 'attempts', default: 1 })
  attempts: number;

  @Column({ type: 'timestamptz', name: 'first_failed_at', default: () => 'now()' })
  firstFailedAt: Date;

  @Column({ type: 'timestamptz', name: 'last_failed_at', default: () => 'now()' })
  lastFailedAt: Date;

  @Column({ type: 'timestamptz', name: 'resolved_at', nullable: true })
  resolvedAt: Date | null;

  @Column({ type: 'uuid', name: 'resolved_by', nullable: true })
  resolvedBy: string | null;
}
