import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ArcoRequestType } from '../../enums/arco-request-type.enum';

@Entity({ name: 'arco_requests' })
@Index('idx_arco_requests_subscriber', ['subscriberId'])
@Index('idx_arco_requests_tenant_status', ['tenantId', 'status'])
export class ArcoRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'uuid', name: 'subscriber_id' })
  subscriberId: string;

  @Column({ type: 'enum', enum: ArcoRequestType, name: 'request_type' })
  requestType: ArcoRequestType;

  @Column({ type: 'varchar', length: 20, name: 'status', default: 'PENDING' })
  status: string;

  @Column({ type: 'text', name: 'description', nullable: true })
  description: string | null;

  @Column({ type: 'timestamptz', name: 'resolved_at', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
