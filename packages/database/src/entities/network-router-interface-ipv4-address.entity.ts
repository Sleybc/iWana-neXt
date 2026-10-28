import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Index(
  'uq_network_interface_ipv4_address',
  ['tenantId', 'routerId', 'interfaceId', 'hostAddress'],
  { unique: true },
)
@Index('idx_network_interface_ipv4_host', ['tenantId', 'hostAddress'])
@Index('idx_network_interface_ipv4_interface', ['tenantId', 'routerId', 'interfaceId', 'id'])
@Entity({ name: 'network_router_interface_ipv4_addresses' })
export class NetworkRouterInterfaceIpv4Address {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'router_id', type: 'uuid' })
  routerId: string;

  @Column({ name: 'interface_id', type: 'uuid' })
  interfaceId: string;

  @Column({ type: 'inet' })
  address: string;

  @Column({
    name: 'host_address',
    type: 'inet',
    asExpression: 'set_masklen(address, 32)',
    generatedType: 'STORED',
    insert: false,
    update: false,
  })
  hostAddress: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'integer', default: 1 })
  version: number;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;
}
