import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'retention_policies' })
export class RetentionPolicyEntity {
  @PrimaryColumn({ type: 'text' })
  category: string;

  @Column({ type: 'integer' })
  years: number;

  @Column({ name: 'start_event', type: 'text' })
  startEvent: string;

  @Column({ name: 'legal_basis', type: 'text' })
  legalBasis: string;

  @Column({ name: 'is_legal_minimum', type: 'boolean', default: true })
  isLegalMinimum: boolean;
}
