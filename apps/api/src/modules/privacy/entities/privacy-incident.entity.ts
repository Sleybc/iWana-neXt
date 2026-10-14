import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'privacy_incidents' })
@Index('idx_privacy_incidents_detected_at', ['detectedAt'])
export class PrivacyIncidentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'detected_at', type: 'timestamptz' })
  detectedAt: Date;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'affected_categories', type: 'text', array: true, default: () => "'{}'" })
  affectedCategories: string[];

  @Column({ name: 'sic_report_due_at', type: 'date' })
  sicReportDueAt: string;

  @Column({ name: 'reported_at', type: 'date', nullable: true })
  reportedAt: string | null;

  @Column({ name: 'external_reference', type: 'varchar', length: 100, nullable: true })
  externalReference: string | null;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;
}
