import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SupplierProfileStatus } from '@iwana/shared';

/** Perfil comercial de proveedor (MOD12 Compras); identidad en MOD08 Parties sin FK cross-module. */
@Index('uq_supplier_profiles_tenant_party_ref', ['tenantId', 'partyRefId'], { unique: true })
@Index('uq_supplier_profiles_tenant_supplier_code', ['tenantId', 'supplierCode'], { unique: true })
@Index('idx_supplier_profiles_tenant_status', ['tenantId', 'status'])
@Entity({ name: 'supplier_profiles' })
export class SupplierProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  /** Referencia logica a party.id (MOD08); sin FK cross-module. */
  @Column({ name: 'party_ref_id', type: 'uuid' })
  partyRefId: string;

  /** Referencia logica al party_role.id del rol SUPPLIER; sin FK cross-module. */
  @Column({ name: 'party_role_id', type: 'uuid' })
  partyRoleId: string;

  @Column({ name: 'supplier_code', type: 'varchar', length: 20 })
  supplierCode: string;

  @Column({ name: 'payment_terms_days', type: 'integer', nullable: true })
  paymentTermsDays: number | null;

  @Column({ type: 'char', length: 3, nullable: true })
  currency: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  incoterm: string | null;

  @Column({ name: 'default_lead_time_days', type: 'integer', nullable: true })
  defaultLeadTimeDays: number | null;

  @Column({ name: 'purchasing_contact_name', type: 'varchar', length: 200, nullable: true })
  purchasingContactName: string | null;

  @Column({ name: 'purchasing_contact_email', type: 'varchar', length: 255, nullable: true })
  purchasingContactEmail: string | null;

  @Column({ name: 'purchasing_contact_phone', type: 'varchar', length: 32, nullable: true })
  purchasingContactPhone: string | null;

  @Column({
    type: 'enum',
    enum: SupplierProfileStatus,
    enumName: 'supplier_profile_status',
    default: SupplierProfileStatus.ACTIVE,
  })
  status: SupplierProfileStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
