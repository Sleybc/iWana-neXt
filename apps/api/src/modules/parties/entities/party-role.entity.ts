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
import { PartyRoleType, PartyRoleStatus } from '@iwana/shared';
import { Party } from './party.entity';

/**
 * Entidad de roles asignados a parties: cliente, proveedor, empleado, etc.
 * Solo un rol activo del mismo tipo por party (índice único parcial).
 * Soporta vigencia temporal y auditoría de creador.
 * Ref: HLD-MOD08 §4, migración 022
 */
@Entity('party_role')
@Index('idx_party_role_active', ['partyId', 'role'], {
  unique: true,
  where: `"status" = 'ACTIVE'`,
})
export class PartyRole {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'party_id', type: 'uuid' })
  partyId: string;

  @ManyToOne(() => Party, (party) => party.roles)
  @JoinColumn({ name: 'party_id' })
  party: Party;

  @Column({ name: 'role', type: 'varchar' })
  role: PartyRoleType;

  @Column({ name: 'status', type: 'varchar', default: PartyRoleStatus.ACTIVE })
  status: PartyRoleStatus;

  @Column({ name: 'valid_from', type: 'timestamptz', default: () => 'NOW()' })
  validFrom: Date;

  @Column({ name: 'valid_to', type: 'timestamptz', nullable: true })
  validTo: Date | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
