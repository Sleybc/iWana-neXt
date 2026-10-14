import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type PartyPrivacyMark =
  | 'RECLAMO_EN_TRAMITE'
  | 'VICTIMA_FALSEDAD_PERSONAL'
  | 'DATOS_BLOQUEADOS';
export type PartyPrivacyMarkEvent = 'OPEN' | 'CLOSE';

@Entity({ name: 'party_privacy_marks' })
@Index('idx_party_privacy_marks_party_mark_occurred', ['partyId', 'mark', 'occurredAt'])
export class PartyPrivacyMarkEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'party_id', type: 'uuid' })
  partyId: string;

  @Column({ type: 'text' })
  mark: PartyPrivacyMark;

  @Column({ type: 'text' })
  event: PartyPrivacyMarkEvent;

  @Column({ name: 'request_id', type: 'uuid', nullable: true })
  requestId: string | null;

  @Column({ name: 'occurred_at', type: 'timestamptz', default: () => 'now()' })
  occurredAt: Date;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;
}
