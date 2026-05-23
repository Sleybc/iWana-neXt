import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BusinessHoursWeekday } from '@iwana/shared';

/**
 * Horario base de atención y recaudo a nivel empresa.
 * Una fila por tenant_id + weekday.
 * Si is_open = false, opens_at y closes_at son null.
 * Si is_open = true, opens_at < closes_at.
 *
 * MOD00 — Configuración / Organización — Horario base empresa
 */
@Index('uq_org_company_business_hours_tenant_weekday', ['tenantId', 'weekday'], { unique: true })
@Index('idx_org_company_business_hours_tenant', ['tenantId'])
@Entity({ name: 'organization_company_business_hours' })
export class OrganizationCompanyBusinessHours {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'enum', enum: BusinessHoursWeekday, enumName: 'business_hours_weekday_enum' })
  weekday: BusinessHoursWeekday;

  @Column({ name: 'opens_at', type: 'time', nullable: true })
  opensAt: string | null;

  @Column({ name: 'closes_at', type: 'time', nullable: true })
  closesAt: string | null;

  @Column({ name: 'is_open', type: 'boolean', default: true })
  isOpen: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
