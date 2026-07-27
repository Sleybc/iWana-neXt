import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ExecutionOrderTemplate } from './execution-order-template.entity';
import { ExecutionOrderTemplateRequirement } from './execution-order-template-requirement.entity';

/**
 * Versión congelada de una plantilla de ejecución.
 *
 * - DRAFT: editable, no asignable a OTs
 * - PUBLISHED: inmutable, asignable — al publicar se vuelve inmutable
 *   (DATA-P1-3) y no puede eliminarse si OTs activas la referencian.
 * - RETIRED: no asignable a nuevas OTs, pero las existentes la conservan
 *
 * ADR-068 §"Una OT conserva la versión asignada al crearse.
 * Publicar una nueva versión no modifica órdenes existentes."
 */
@Index('idx_execution_order_template_versions_template', ['templateId'])
@Index(
  'idx_execution_order_template_versions_key_version',
  ['tenantId', 'templateKey', 'version'],
  {
    unique: true,
  },
)
@Entity({ name: 'execution_order_template_versions' })
export class ExecutionOrderTemplateVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'template_id', type: 'uuid' })
  templateId: string;

  /** Clave heredada del template para búsqueda directa. */
  @Column({ name: 'template_key', type: 'varchar', length: 64 })
  templateKey: string;

  /** Número de versión monótono por template (1, 2, 3…). */
  @Column({ type: 'integer' })
  version: number;

  /** Etiqueta descriptiva de la versión (e.g., "Instalación fibra — v3"). */
  @Column({ type: 'varchar', length: 200 })
  label: string;

  @Column({ type: 'varchar', length: 20, default: 'DRAFT' })
  status: 'DRAFT' | 'PUBLISHED' | 'RETIRED';

  /** Fecha a partir de la cual esta versión está activa para nuevas OTs. */
  @Column({ name: 'effective_from', type: 'timestamptz', nullable: true })
  effectiveFrom: Date | null;

  /** Catálogos de motivos permitidos para bloqueo/no-ejecución/cierre. */
  @Column({ name: 'reason_catalogs', type: 'jsonb', nullable: true })
  reasonCatalogs: object | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'retired_at', type: 'timestamptz', nullable: true })
  retiredAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => ExecutionOrderTemplate, (template) => template.versions, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'template_id' })
  template: ExecutionOrderTemplate;

  @OneToMany(() => ExecutionOrderTemplateRequirement, (req) => req.version, { cascade: true })
  requirements: ExecutionOrderTemplateRequirement[];
}
