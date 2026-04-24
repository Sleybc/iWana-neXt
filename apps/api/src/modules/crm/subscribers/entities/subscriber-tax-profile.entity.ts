import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TaxProfileStatus } from '@iwana/shared';
import { SubscriberTaxAssignment } from './subscriber-tax-assignment.entity';

/**
 * Perfil tributario del suscriptor.
 *
 * Dueño del perfil: CRM/Subscribers (bounded context del cliente).
 * NO vive dentro de TaxationModule — ADR-029 §D3, spec-2026-04-22 §7.1.
 *
 * Relación 1:1 con Subscriber. Una vez creado se actualiza, no se recrea.
 * El campo profileStatus refleja el estado operativo visible para facturación.
 *
 * Ref: HLD-MOD07 §7.2, spec-2026-04-22 §7.2, BT-TAXMVP-01
 */
@Entity({ name: 'subscriber_tax_profiles' })
@Index('idx_stp_subscriber_id', ['subscriberId'], { unique: true })
@Index('idx_stp_tenant_status', ['tenantId', 'profileStatus'])
export class SubscriberTaxProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ── Multi-tenant ──
  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  // ── FK al suscriptor dueño de este perfil ──
  @Column({ type: 'uuid', name: 'subscriber_id' })
  subscriberId: string;

  /**
   * Segmento de negocio capturado en el momento de la sugerencia.
   * Se almacena como snapshot para auditoría; no es FK al subscriber.
   */
  @Column({ type: 'varchar', length: 30, name: 'segment', nullable: true })
  segment: string | null;

  /**
   * Estrato capturado al momento de la sugerencia.
   * Permite recalcular la sugerencia IVA si el estrato cambia.
   */
  @Column({ type: 'int', name: 'stratum_at_suggestion', nullable: true })
  stratumAtSuggestion: number | null;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'profile_status',
    default: TaxProfileStatus.PENDING_REVIEW,
  })
  profileStatus: TaxProfileStatus;

  /** Fecha en que facturación confirmó o ajustó el perfil por primera vez. */
  @Column({ type: 'timestamptz', name: 'confirmed_at', nullable: true })
  confirmedAt: Date | null;

  /** Usuario (UUID) que realizó la última confirmación o ajuste manual. */
  @Column({ type: 'uuid', name: 'confirmed_by', nullable: true })
  confirmedBy: string | null;

  @OneToMany(() => SubscriberTaxAssignment, (a) => a.profile, { cascade: ['insert', 'update'] })
  assignments: SubscriberTaxAssignment[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
