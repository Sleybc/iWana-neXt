import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Index('uq_ip_assignments_live', ['tenantId', 'ip'], {
  unique: true,
  where: "\"status\" IN ('RESERVED', 'ACTIVE')",
})
@Index('idx_ip_assignments_network', ['tenantId', 'ipv4NetworkId', 'status'])
@Entity({ name: 'ip_assignments' })
export class IpAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'ipv4_network_id', type: 'uuid' })
  ipv4NetworkId: string;

  @Column({ type: 'inet' })
  ip: string;

  @Column({ name: 'service_provisioning_id', type: 'uuid' })
  serviceProvisioningId: string;

  @Column({ type: 'varchar', length: 16 })
  status: string;

  @Column({ name: 'released_at', type: 'timestamptz', nullable: true })
  releasedAt: Date | null;

  @Column({ name: 'release_reason', type: 'varchar', length: 32, nullable: true })
  releaseReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
