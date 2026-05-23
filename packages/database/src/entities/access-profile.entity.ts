import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole } from '@iwana/shared';

@Index('uq_access_profiles_tenant_name', ['tenantId', 'name'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Index('idx_access_profiles_tenant_active', ['tenantId', 'isActive'], {
  where: '"deleted_at" IS NULL',
})
@Entity({ name: 'access_profiles' })
export class AccessProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'base_role_constraint', type: 'varchar', length: 30, nullable: true })
  baseRoleConstraint: UserRole | null;

  @Column({ name: 'scope_site_id', type: 'uuid', nullable: true })
  scopeSiteId: string | null;

  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
