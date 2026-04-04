import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SubscriberType } from '../../enums/subscriber-type.enum';

@Entity({ name: 'subscribers' })
@Index('idx_subscribers_tenant_status', ['tenantId', 'status'])
@Index('idx_subscribers_tenant_doc', ['tenantId', 'documentNumberEncrypted'])
export class Subscriber {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'enum', enum: SubscriberType })
  type: SubscriberType;

  @Column({ type: 'varchar', length: 500, name: 'document_number_encrypted' })
  documentNumberEncrypted: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'nit' })
  nit: string | null;

  @Column({ type: 'varchar', length: 300, name: 'first_name' })
  firstName: string;

  @Column({ type: 'varchar', length: 300, name: 'last_name' })
  lastName: string;

  @Column({ type: 'varchar', length: 300, name: 'business_name', nullable: true })
  businessName: string | null;

  @Column({ type: 'varchar', length: 500, name: 'email_encrypted' })
  emailEncrypted: string;

  @Column({ type: 'varchar', length: 100, name: 'phone_encrypted' })
  phoneEncrypted: string;

  @Column({ type: 'int', name: 'stratum', nullable: true })
  stratum: number | null;

  @Column({ type: 'varchar', length: 20, name: 'vat_treatment', default: 'EXENTO' })
  vatTreatment: string;

  @Column({ type: 'varchar', length: 500, name: 'address' })
  address: string;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'city' })
  city: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'department' })
  department: string | null;

  @Column({ type: 'varchar', length: 10, name: 'status', default: 'ACTIVE' })
  status: string;

  @Column({ type: 'uuid', name: 'coverage_node_id', nullable: true })
  coverageNodeId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
