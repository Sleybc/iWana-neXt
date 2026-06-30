import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CompatibilityRuleType } from '@iwana/shared';
import { CatalogItem } from './catalog-item.entity';

/**
 * Regla de compatibilidad entre ítems del catálogo.
 * - REQUIRES: el source no puede ofrecerse sin el target
 * - EXCLUDES: source y target no pueden coexistir
 * - REPLACES: source es la versión nueva del target (ambos no deben ofrecerse juntos)
 *
 * La constraint CHECK (source_item_id != target_item_id) impide auto-referencias en DB.
 */
@Entity({ name: 'catalog_compatibility_rules' })
@Index('idx_compat_rules_source', ['tenantId', 'sourceItemId', 'isActive'])
export class CompatibilityRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'varchar', length: 20, name: 'rule_type' })
  ruleType: CompatibilityRuleType;

  @Column({ type: 'uuid', name: 'source_item_id' })
  sourceItemId: string;

  @Column({ type: 'uuid', name: 'target_item_id' })
  targetItemId: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'date', name: 'effective_from', nullable: true })
  effectiveFrom: Date | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => CatalogItem)
  @JoinColumn({ name: 'source_item_id' })
  sourceItem: CatalogItem;

  @ManyToOne(() => CatalogItem)
  @JoinColumn({ name: 'target_item_id' })
  targetItem: CatalogItem;
}
