import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ExpedienteRecord } from './expediente-record.entity';

/**
 * Entidad hijo: Verificación de cobertura técnica
 * PRD v2.0 §6.3
 */
@Entity({ name: 'coverage_checks' })
@Index('idx_coverage_checks_expediente', ['tenantId', 'expedienteId'])
export class CoverageCheck {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'uuid', name: 'expediente_id' })
  expedienteId: string;

  @Column({ type: 'timestamptz', name: 'checked_at' })
  checkedAt: Date;

  @Column({ type: 'numeric', precision: 10, scale: 7, name: 'latitude', nullable: true })
  latitude: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, name: 'longitude', nullable: true })
  longitude: number | null;

  @Column({ type: 'varchar', length: 255, name: 'address_used', nullable: true })
  addressUsed: string | null;

  @Column({ type: 'varchar', length: 30, name: 'result' })
  result: string;

  @Column({ type: 'varchar', length: 60, name: 'technology_available', nullable: true })
  technologyAvailable: string | null;

  @Column({ type: 'integer', name: 'distance_m', nullable: true })
  distanceM: number | null;

  @Column({ type: 'jsonb', name: 'snapshot_json' })
  snapshotJson: Record<string, unknown>;

  @Column({ type: 'uuid', name: 'checked_by' })
  checkedBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => ExpedienteRecord, (expediente) => expediente.coverageChecks)
  @JoinColumn({ name: 'expediente_id' })
  expediente: ExpedienteRecord;
}
