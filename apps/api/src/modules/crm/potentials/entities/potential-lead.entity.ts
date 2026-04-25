import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'potential_leads' })
@Index('idx_potential_leads_tenant_created', ['tenantId', 'createdAt'])
export class PotentialLead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'varchar', length: 160, name: 'full_name' })
  fullName: string;

  @Column({ type: 'varchar', length: 255, name: 'email_encrypted', nullable: true })
  emailEncrypted: string | null;

  @Column({ type: 'varchar', length: 120, name: 'phone_encrypted', nullable: true })
  phoneEncrypted: string | null;

  @Column({ type: 'varchar', length: 120, name: 'source' })
  source: string;

  @Column({ type: 'text', name: 'notes', nullable: true })
  notes: string | null;

  @Column({ type: 'boolean', name: 'qualified', default: false })
  qualified: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
