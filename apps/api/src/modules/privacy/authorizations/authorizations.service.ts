import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  AuditAction,
  CreateDataAuthorization,
  DataPurpose,
  DataAuthorizationView,
} from '@iwana/shared';
import { DataSource } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { MediaService } from '../../media/media.service';
import { TenantContext } from '@iwana/db';
import { DataAuthorizationEntity } from '../entities/data-authorization.entity';
import { LegalTextEntity } from '../entities/legal-text.entity';
import { IPrivacyAuthorizationReadPort } from '../ports/privacy-authorization-read.port';
import { IPrivacyAuthorizationWritePort } from '../ports/privacy-authorization-write.port';
import { withPrivacyTenant } from '../ports/privacy-tenant-query';

@Injectable()
export class AuthorizationsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly writePort: IPrivacyAuthorizationWritePort,
    private readonly readPort: IPrivacyAuthorizationReadPort,
    private readonly mediaService: MediaService,
    private readonly auditService: AuditService,
  ) {}

  async create(
    input: CreateDataAuthorization,
    context: { actorId: string; ip: string | null; userAgent: string | null },
  ): Promise<{ authorizationId: string }> {
    const { schemaName } = TenantContext.getOrThrow();
    const result = await withPrivacyTenant(this.dataSource, async (manager) => {
      const legalText = await manager.getRepository(LegalTextEntity).findOne({
        where: { id: input.legalTextId },
      });
      if (!legalText) {
        throw new BadRequestException('El texto legal indicado no existe.');
      }
      if (legalText.type !== 'AUTORIZACION') {
        throw new UnprocessableEntityException({
          code: 'PRIVACY_LEGAL_TEXT_TYPE_INVALID',
          message: 'La autorización debe referenciar un texto de tipo AUTORIZACION.',
        });
      }
      return this.writePort.record(
        {
          partyId: input.partyId,
          purpose: input.purpose,
          granted: input.granted,
          channel: input.channel,
          legalTextId: input.legalTextId,
          ...(input.evidenceMediaId ? { evidenceMediaId: input.evidenceMediaId } : {}),
          actorId: context.actorId,
        },
        { ip: context.ip, userAgent: context.userAgent, manager },
      );
    });
    if (result.created) {
      await this.auditService.log({
        action: AuditAction.CREATE,
        entityType: 'DataAuthorization',
        entityId: result.authorizationId,
      });
    }
    return { authorizationId: result.authorizationId };
  }

  listForParty(partyId: string): Promise<DataAuthorizationView[]> {
    return this.readPort.listForParty(partyId);
  }

  async proof(
    partyId: string,
    authorizationId: string,
  ): Promise<{
    legalTextVersion: string;
    sha256: string;
    evidenceUrl: string | null;
  }> {
    const record = await withPrivacyTenant(this.dataSource, async (manager) => {
      const authorization = await manager.getRepository(DataAuthorizationEntity).findOne({
        where: { id: authorizationId, partyId },
      });
      if (!authorization?.legalTextId) {
        throw new NotFoundException('No existe soporte legal versionado para esta autorización.');
      }
      const legalText = await manager.getRepository(LegalTextEntity).findOne({
        where: { id: authorization.legalTextId },
      });
      if (!legalText) {
        throw new NotFoundException('El texto legal asociado no está disponible.');
      }
      return { authorization, legalText };
    });

    const evidence = record.authorization.evidenceMediaId
      ? await this.mediaService.getPrivacyEvidenceSignedUrl(
          record.authorization.evidenceMediaId,
          TenantContext.getOrThrow().schemaName,
        )
      : null;
    return {
      legalTextVersion: record.legalText.version,
      sha256: record.legalText.sha256,
      evidenceUrl: evidence?.signedUrl ?? null,
    };
  }

  hasActive(partyId: string, purpose: DataPurpose) {
    return this.readPort.hasActive(partyId, purpose);
  }
}
