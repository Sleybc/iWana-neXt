import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WfmWorkType } from '@iwana/shared';
import { ExecutionOrderTemplateVersion } from './execution-order-template-version.entity';

/**
 * Catálogo de plantillas de ejecución por tipo de trabajo.
 * Cada plantilla agrupa versiones que definen los requisitos de cierre.
 *
 * ADR-068 §"Plantilla versionada aplicada a OT sin afectar existentes"
 */
@Index('uq_execution_order_templates_tenant_key', ['tenantId', 'key'], { unique: true })
@Index('idx_execution_order_templates_tenant_work_type', ['tenantId', 'workType'])
@Entity({ name: 'execution_order_templates' })
export class ExecutionOrderTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  /** Clave unica por tenant (e.g., "instalacion-fibra-estandar"). */
  @Column({ type: 'varchar', length: 64 })
  key: string;

  /** Etiqueta visible (e.g., "Plantilla de instalación fibra"). */
  @Column({ type: 'varchar', length: 200 })
  label: string;

  /** Tipo de trabajo al que aplica esta plantilla. */
  @Column({
    name: 'work_type',
    type: 'enum',
    enum: WfmWorkType,
    enumName: 'wfm_work_type',
  })
  workType: WfmWorkType;

  /** Estado general del catálogo: DRAFT mientras no tenga versiones publicadas. */
  @Column({ type: 'varchar', length: 20, default: 'DRAFT' })
  status: 'DRAFT' | 'PUBLISHED' | 'RETIRED';

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => ExecutionOrderTemplateVersion, (version) => version.template)
  versions: ExecutionOrderTemplateVersion[];
}
