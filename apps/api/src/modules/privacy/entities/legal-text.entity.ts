import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { LEGAL_APPROVAL_DECLARATION, LegalTextFormat, LegalTextType } from '@iwana/shared';

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

  @Column({ type: 'text', default: 'PLAIN' })
  format: LegalTextFormat;

  @Column({ name: 'published_at', type: 'timestamptz' })
  publishedAt: Date;

  @Column({ type: 'text', nullable: true })
  url: string | null;

  /** Declaración de aprobación jurídica (migración 185); obligatoria en CONTRATO_SERVICIO. */
  @Column({ name: 'legal_approval_declaration', type: 'text', nullable: true })
  legalApprovalDeclaration: typeof LEGAL_APPROVAL_DECLARATION | null;

  /** Usuario que publicó con la declaración; sale del JWT. */
  @Column({ name: 'approved_by_user_id', type: 'uuid', nullable: true })
  approvedByUserId: string | null;

  /** Fecha del servidor al publicar con la declaración. */
  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;
}
