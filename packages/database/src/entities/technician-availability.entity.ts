import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TechnicianAvailabilityType } from '@iwana/shared';

/**
 * Entidad TechnicianAvailability — schema por tenant (dinamico via search_path).
 *
 * Cubre bloqueos manuales y disponibilidad puntual por tecnico o contratista.
 * Horarios recurrentes se difieren a Fase 2 segun alcance aprobado.
 *
 * Sin @Entity({ schema }) — resuelto via SET LOCAL search_path (ADR-037, ADR-018).
 *
 * HLD-MOD09-PROGRAMACION-WFM-v1.0 §4, SPEC-MOD09 §6.5
 */
@Index('idx_technician_availability_tenant_user', ['tenantId', 'userId'])
@Index('idx_technician_availability_tenant_range', ['tenantId', 'startsAt', 'endsAt'])
@Entity({ name: 'technician_availability' }) // Sin schema — resuelto via SET LOCAL search_path
export class TechnicianAvailability {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK logica a public.tenants.id — sin FK referencial cross-schema */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  /** ID del tecnico o contratista (ref logica a users.id) */
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'enum', enum: TechnicianAvailabilityType })
  type: TechnicianAvailabilityType;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt: Date;

  @Column({ name: 'ends_at', type: 'timestamptz' })
  endsAt: Date;

  @Column({ type: 'varchar', length: 160, nullable: true })
  reason: string | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
