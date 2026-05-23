import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Excepciones de horario por fecha para Organization.
 * Permite modelar festivos, cierres especiales y aperturas extraordinarias.
 *
 * - organization_site_id = null: aplica a toda la empresa.
 * - organization_site_id = <uuid>: aplica solo a esa sede.
 * - is_recurring = true: se repite cada año en el mismo mes/día (mm-dd).
 * - is_open = false: cierre total por festivo o novedad.
 * - is_open = true: apertura o ajuste extraordinario.
 *
 * MOD00 — Configuración / Organización — Excepciones por fecha
 */
@Index('idx_org_bh_exceptions_tenant', ['tenantId'])
@Index('idx_org_bh_exceptions_tenant_date', ['tenantId', 'exceptionDate'])
@Index('idx_org_bh_exceptions_tenant_site', ['tenantId', 'organizationSiteId'])
@Entity({ name: 'organization_business_hours_exceptions' })
export class OrganizationBusinessHoursException {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'organization_site_id', type: 'uuid', nullable: true })
  organizationSiteId: string | null;

  /**
   * Fecha de la excepción en formato ISO 8601 YYYY-MM-DD.
   * Para excepciones recurrentes, el año puede ser 2000 como convenio o cualquier año.
   * La comparación de recurrencia usa solo mm-dd.
   */
  @Column({ name: 'exception_date', type: 'date' })
  exceptionDate: string;

  @Column({ name: 'is_recurring', type: 'boolean', default: false })
  isRecurring: boolean;

  @Column({ name: 'is_open', type: 'boolean', default: false })
  isOpen: boolean;

  @Column({ name: 'opens_at', type: 'time', nullable: true })
  opensAt: string | null;

  @Column({ name: 'closes_at', type: 'time', nullable: true })
  closesAt: string | null;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
