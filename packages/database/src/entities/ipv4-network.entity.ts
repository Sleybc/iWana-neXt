import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'ipv4_networks' })
export class Ipv4Network {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'router_id', type: 'uuid' })
  routerId: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'cidr' })
  cidr: string;

  @Column({ type: 'inet' })
  gateway: string;

  @Column({ name: 'assignable_from', type: 'inet' })
  assignableFrom: string;

  @Column({ name: 'assignable_to', type: 'inet' })
  assignableTo: string;

  @Column({ name: 'excluded_ips', type: 'inet', array: true, default: () => "'{}'" })
  excludedIps: string[];

  @Column({ name: 'default_control_method', type: 'varchar', length: 40 })
  defaultControlMethod: string;

  @Column({ type: 'varchar', length: 16, default: 'ACTIVE' })
  status: string;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'integer', default: 1 })
  version: number;
}
