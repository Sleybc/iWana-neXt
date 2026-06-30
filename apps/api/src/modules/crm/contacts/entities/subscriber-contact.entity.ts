import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'subscriber_contacts' })
@Index('idx_subscriber_contacts_subscriber', ['subscriberId'])
@Index('idx_subscriber_contacts_tenant', ['tenantId'])
export class SubscriberContact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'uuid', name: 'subscriber_id' })
  subscriberId: string;

  @Column({ type: 'varchar', length: 200, name: 'full_name' })
  fullName: string;

  @Column({ type: 'varchar', length: 120, name: 'email_encrypted' })
  emailEncrypted: string;

  @Column({ type: 'varchar', length: 120, name: 'phone_encrypted' })
  phoneEncrypted: string;

  @Column({ type: 'varchar', length: 120, name: 'role', nullable: true })
  role: string | null;

  @Column({ type: 'boolean', name: 'is_primary', default: false })
  isPrimary: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;

  // subscriber_id referencia la tabla subscribers por columna UUID; sin relación navegable ORM
  // para preservar boundary entre módulos (subscribers es legado en proceso de retiro).
}
