import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'network_routers' })
export class NetworkRouter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ name: 'organization_site_id', type: 'uuid', nullable: true })
  organizationSiteId: string | null;

  @Column({ name: 'commercial_node_id', type: 'uuid', nullable: true })
  commercialNodeId: string | null;

  @Column({ name: 'management_host', type: 'varchar', length: 255 })
  managementHost: string;

  @Column({ name: 'lan_interface', type: 'varchar', length: 64, nullable: true })
  lanInterface: string | null;

  @Column({ name: 'legacy_lan_interface_id', type: 'uuid', nullable: true })
  legacyLanInterfaceId: string | null;

  @Column({ name: 'supported_control_methods', type: 'varchar', length: 40, array: true })
  supportedControlMethods: string[];

  @Column({ type: 'varchar', length: 16, default: 'ACTIVE' })
  status: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'integer', default: 1 })
  version: number;
}
