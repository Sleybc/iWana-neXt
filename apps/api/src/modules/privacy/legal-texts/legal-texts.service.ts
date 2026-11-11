import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  AuditAction,
  CreateLegalText,
  LEGAL_TEXT_TYPES_REQUIRING_LEGAL_APPROVAL,
  LegalText,
  LegalTextType,
} from '@iwana/shared';
import { DataSource, QueryFailedError } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { LegalTextEntity } from '../entities/legal-text.entity';
import { IPrivacyLegalTextReadPort } from '../ports/privacy-legal-text-read.port';
import { withPrivacyTenant } from '../ports/privacy-tenant-query';

/** Quién publica; sale del JWT verificado, nunca del cuerpo. */
export interface LegalTextPublisher {
  userId: string;
}

/**
 * Construcciones activas que no caben en una plantilla de contrato: el worker la
 * renderiza en Chromium, así que no se admite script, marcos ni manejadores de eventos.
 */
const UNSAFE_HTML_PATTERNS: readonly RegExp[] = [
  /<\s*(script|iframe|object|embed|frame|frameset|base|form|meta\s+http-equiv)\b/iu,
  /\son[a-z]+\s*=/iu,
  /javascript\s*:/iu,
];

export function requiresLegalApproval(type: LegalTextType): boolean {
  return (LEGAL_TEXT_TYPES_REQUIRING_LEGAL_APPROVAL as readonly string[]).includes(type);
}

export function sha256LegalText(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

@Injectable()
export class LegalTextsService implements IPrivacyLegalTextReadPort {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async list(): Promise<LegalText[]> {
    return withPrivacyTenant(this.dataSource, async (manager) => {
      const rows = await manager.getRepository(LegalTextEntity).find({
        order: { publishedAt: 'DESC', type: 'ASC', id: 'DESC' },
      });
      const currentByType = new Map<string, string>();
      for (const row of rows) {
        if (!currentByType.has(row.type)) currentByType.set(row.type, row.id);
      }
      return rows.map((row) => this.toView(row, currentByType.get(row.type) === row.id));
    });
  }

  async current(
    type: LegalTextType,
  ): Promise<{ id: string; version: string; sha256: string } | null> {
    const row = await this.getCurrentEntity(type);
    return row ? { id: row.id, version: row.version, sha256: row.sha256 } : null;
  }

  async findByVersion(type: LegalTextType, version: string): Promise<{ id: string } | null> {
    return withPrivacyTenant(this.dataSource, async (manager) => {
      const row = await manager.getRepository(LegalTextEntity).findOne({
        where: { type, version },
        select: { id: true },
      });
      return row ? { id: row.id } : null;
    });
  }

  async getCurrent(type: LegalTextType): Promise<LegalText | null> {
    const row = await this.getCurrentEntity(type);
    return row ? this.toView(row, true) : null;
  }

  async create(input: CreateLegalText, publisher?: LegalTextPublisher): Promise<LegalText> {
    const needsApproval = requiresLegalApproval(input.type);
    if (needsApproval && (input.legalApprovalDeclaration === undefined || !publisher)) {
      throw new BadRequestException({
        code: 'PRIVACY_LEGAL_TEXT_APPROVAL_REQUIRED',
        message: 'La plantilla de contrato solo se publica aprobada por asesoría jurídica.',
      });
    }
    if (
      input.format === 'HTML' &&
      UNSAFE_HTML_PATTERNS.some((pattern) => pattern.test(input.content))
    ) {
      throw new BadRequestException({
        code: 'PRIVACY_LEGAL_TEXT_UNSAFE_HTML',
        message: 'La plantilla no admite scripts, marcos, formularios ni manejadores de eventos.',
      });
    }
    const approval =
      input.legalApprovalDeclaration !== undefined && publisher
        ? {
            legalApprovalDeclaration: input.legalApprovalDeclaration,
            approvedByUserId: publisher.userId,
            approvedAt: new Date(),
          }
        : { legalApprovalDeclaration: null, approvedByUserId: null, approvedAt: null };
    const sha256 = sha256LegalText(input.content);
    let saved: LegalTextEntity;
    try {
      saved = await withPrivacyTenant(this.dataSource, async (manager) => {
        const repository = manager.getRepository(LegalTextEntity);
        return repository.save(
          repository.create({
            type: input.type,
            version: input.version,
            sha256,
            content: input.content,
            format: input.format,
            publishedAt: new Date(),
            url: input.url ?? null,
            ...approval,
          }),
        );
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23505'
      ) {
        throw new ConflictException('Ya existe una versión de este texto legal.');
      }
      throw error;
    }

    await this.auditService.log({
      action: AuditAction.CREATE,
      entityType: 'LegalText',
      entityId: saved.id,
      userId: publisher?.userId ?? null,
      newValue: {
        type: saved.type,
        version: saved.version,
        sha256: saved.sha256,
        legalApprovalDeclaration: saved.legalApprovalDeclaration ?? null,
        approvedAt: saved.approvedAt ? saved.approvedAt.toISOString() : null,
      },
    });
    return this.toView(saved, true);
  }

  private getCurrentEntity(type: LegalTextType): Promise<LegalTextEntity | null> {
    return withPrivacyTenant(this.dataSource, (manager) =>
      manager.getRepository(LegalTextEntity).findOne({
        where: { type },
        order: { publishedAt: 'DESC', id: 'DESC' },
      }),
    );
  }

  private toView(row: LegalTextEntity, isCurrent: boolean): LegalText {
    return {
      id: row.id,
      type: row.type,
      version: row.version,
      sha256: row.sha256,
      content: row.content,
      format: row.format,
      publishedAt: row.publishedAt.toISOString(),
      url: row.url,
      isCurrent,
      ...(row.legalApprovalDeclaration && row.approvedByUserId && row.approvedAt
        ? {
            legalApproval: {
              declaration: row.legalApprovalDeclaration,
              approvedByUserId: row.approvedByUserId,
              approvedAt: row.approvedAt.toISOString(),
            },
          }
        : {}),
    };
  }
}
