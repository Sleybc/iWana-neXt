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
import { PartyContactType } from '@iwana/shared';
import { Party } from './party.entity';

/**
 * Entidad de contactos de party: email, teléfono, dirección.
 * Múltiples contactos por tipo, con uno marcado como primario.
 * Ref: HLD-MOD08 §4, migración 022
 */
@Entity('party_contact')
@Index('idx_party_contact_primary', ['partyId', 'type'], {
  unique: true,
  where: `"is_primary" = TRUE`,
})
export class PartyContact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'party_id', type: 'uuid' })
  partyId: string;

  @ManyToOne(() => Party, (party) => party.contacts)
  @JoinColumn({ name: 'party_id' })
  party: Party;

  @Column({ name: 'type', type: 'varchar' })
  type: PartyContactType;

  @Column({ name: 'value', type: 'varchar', length: 255 })
  value: string;

  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary: boolean;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
