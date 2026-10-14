import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type LegalTextType = 'POLITICA_TRATAMIENTO' | 'AVISO_PRIVACIDAD' | 'AUTORIZACION';

@Entity({ name: 'legal_texts' })
@Index('uq_legal_texts_type_version', ['type', 'version'], { unique: true })
export class LegalTextEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  type: LegalTextType;

  @Column({ type: 'text' })
  version: string;

  @Column({ type: 'char', length: 64 })
  sha256: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'published_at', type: 'timestamptz' })
  publishedAt: Date;

  @Column({ type: 'text', nullable: true })
  url: string | null;
}
