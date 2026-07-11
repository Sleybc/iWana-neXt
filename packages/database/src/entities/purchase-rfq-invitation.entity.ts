import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PurchaseRfqInvitationStatus } from '@iwana/shared';

@Index('idx_purchase_rfq_invitations_tenant_rfq', ['tenantId', 'rfqId'])
@Index('idx_purchase_rfq_invitations_tenant_party', ['tenantId', 'partyRefId'])
@Index('uq_purchase_rfq_invitations_rfq_party', ['rfqId', 'partyRefId'], { unique: true })
@Entity({ name: 'purchase_rfq_invitations' })
export class PurchaseRfqInvitation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'rfq_id', type: 'uuid' })
  rfqId: string;

  @Column({ name: 'party_ref_id', type: 'uuid' })
  partyRefId: string;

  @Column({
    type: 'enum',
    enum: PurchaseRfqInvitationStatus,
    enumName: 'purchase_rfq_invitation_status',
    default: PurchaseRfqInvitationStatus.INVITED,
  })
  status: PurchaseRfqInvitationStatus;

  @Column({ name: 'invited_at', type: 'timestamptz', nullable: true })
  invitedAt: Date | null;

  @Column({ name: 'responded_at', type: 'timestamptz', nullable: true })
  respondedAt: Date | null;

  @Column({ name: 'declined_at', type: 'timestamptz', nullable: true })
  declinedAt: Date | null;

  @Column({ name: 'decline_reason', type: 'text', nullable: true })
  declineReason: string | null;

  @Column({ name: 'declined_by_user_id', type: 'uuid', nullable: true })
  declinedByUserId: string | null;

  @Column({ name: 'invited_by_user_id', type: 'uuid', nullable: true })
  invitedByUserId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
