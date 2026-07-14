import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PartyType, DocumentTypeParty, PartyStatus } from '@iwana/shared';

/**
 * Entidad central de registro de personas naturales y jurídicas.
 * Sin prefijo de schema — cada tenant tiene sus parties en su schema.
 * Soporta fusión de duplicados mediante merged_into_party_id.
 * Ref: HLD-MOD08 §4, migración 022
 */
@Entity('party')
@Index('idx_party_document_active', ['documentType', 'documentNumber'], {
  unique: true,
  where: `"deleted_at" IS NULL AND "status" != 'MERGED'`,
})
export class Party {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'party_type', type: 'varchar' })
  partyType: PartyType;

  @Column({ name: 'document_type', type: 'varchar' })
  documentType: DocumentTypeParty;

  // Longitud 500: acomoda valores cifrados AES-256-GCM (migración 024 — ADR-030)
  @Column({ name: 'document_number', type: 'varchar', length: 500 })
  documentNumber: string;

  @Column({ name: 'verification_digit', type: 'varchar', length: 2, nullable: true })
  verificationDigit: string | null;

  @Column({ name: 'display_name', type: 'varchar', length: 160 })
  displayName: string;

  @Column({ name: 'legal_name', type: 'varchar', length: 200, nullable: true })
  legalName: string | null;

  @Column({ name: 'birth_date', type: 'date', nullable: true })
  birthDate: Date | null;

  @Column({ name: 'incorporation_date', type: 'date', nullable: true })
  incorporationDate: Date | null;

  @Column({ name: 'status', type: 'varchar', default: PartyStatus.ACTIVE })
  status: PartyStatus;

  @Column({ name: 'merged_into_party_id', type: 'uuid', nullable: true })
  mergedIntoPartyId: string | null;

  @ManyToOne(() => Party, { nullable: true })
  @JoinColumn({ name: 'merged_into_party_id' })
  mergedIntoParty: Party | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'address', type: 'varchar', length: 255, nullable: true })
  address: string | null;

  @Column({ name: 'latitude', type: 'numeric', precision: 10, scale: 7, nullable: true })
  latitude: number | null;

  @Column({ name: 'longitude', type: 'numeric', precision: 10, scale: 7, nullable: true })
  longitude: number | null;

  @Column({ name: 'city', type: 'varchar', length: 120, nullable: true })
  city: string | null;

  @Column({ name: 'department', type: 'varchar', length: 120, nullable: true })
  department: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @OneToMany(() => PartyContact, (contact) => contact.party)
  contacts: PartyContact[];

  @OneToMany(() => PartyRole, (role) => role.party)
  roles: PartyRole[];
}

// Importaciones circulares resueltas al final del archivo
import { PartyContact } from './party-contact.entity';
import { PartyRole } from './party-role.entity';
