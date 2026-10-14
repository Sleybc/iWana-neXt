import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ConsentChannel, DataPurpose, DataAuthorizationView } from '@iwana/shared';
import { DataSource, EntityManager } from 'typeorm';
import { DataAuthorizationEntity } from '../entities/data-authorization.entity';
import { LegalTextEntity } from '../entities/legal-text.entity';
import { IPrivacyAuthorizationReadPort } from '../ports/privacy-authorization-read.port';
import {
  IPrivacyAuthorizationWritePort,
  PrivacyAuthorizationWriteInput,
} from '../ports/privacy-authorization-write.port';
import { withPrivacyTenant } from '../ports/privacy-tenant-query';

const consentChannelValues = new Set<string>(Object.values(ConsentChannel));

@Injectable()
export class PrivacyAuthorizationAdapter
  implements IPrivacyAuthorizationReadPort, IPrivacyAuthorizationWritePort
{
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async hasActive(
    partyId: string,
    purpose: DataPurpose,
  ): Promise<{
    active: boolean;
    authorizationId: string | null;
    legalTextVersion: string | null;
    legacyUnverified: boolean;
  }> {
    return withPrivacyTenant(this.dataSource, async (manager) => {
      const latest = await manager.getRepository(DataAuthorizationEntity).findOne({
        where: { partyId, purpose },
        order: { capturedAt: 'DESC', id: 'DESC' },
      });
      if (!latest) {
        return {
          active: false,
          authorizationId: null,
          legalTextVersion: null,
          legacyUnverified: false,
        };
      }

      const legalText = latest.legalTextId
        ? await manager.getRepository(LegalTextEntity).findOne({
            where: { id: latest.legalTextId },
          })
        : null;
      const active = latest.granted;
      return {
        active,
        authorizationId: active ? latest.id : null,
        legalTextVersion: active ? (legalText?.version ?? null) : null,
        legacyUnverified: active && latest.kind === 'LEGACY_IMPORT',
      };
    });
  }

  async listForParty(partyId: string): Promise<DataAuthorizationView[]> {
    return withPrivacyTenant(this.dataSource, async (manager) => {
      const records = await manager.getRepository(DataAuthorizationEntity).find({
        where: { partyId },
        order: { capturedAt: 'DESC', id: 'DESC' },
      });
      return records.map((record) => ({
        id: record.id,
        partyId: record.partyId,
        purpose: record.purpose as DataPurpose,
        kind: record.kind,
        granted: record.granted,
        channel: record.channel,
        legalTextId: record.legalTextId,
        capturedAt: record.capturedAt.toISOString(),
      }));
    });
  }

  async record(
    input: PrivacyAuthorizationWriteInput,
    ctx: { ip: string | null; userAgent: string | null; manager: EntityManager },
  ): Promise<{ authorizationId: string; created: boolean }> {
    const kind = input.kind ?? (input.granted ? 'GRANT' : 'REVOCATION');
    if (kind !== 'LEGACY_IMPORT' && !consentChannelValues.has(input.channel)) {
      throw new BadRequestException('El canal debe ser un medio de consentimiento vigente.');
    }

    if (input.legalTextId === null && kind !== 'LEGACY_IMPORT') {
      throw new BadRequestException('Solo LEGACY_IMPORT puede omitir el texto legal.');
    }

    const repository = ctx.manager.getRepository(DataAuthorizationEntity);

    const capturedAt = input.capturedAt ? new Date(input.capturedAt) : new Date();
    if (Number.isNaN(capturedAt.getTime()) || capturedAt.getTime() > Date.now()) {
      throw new BadRequestException('capturedAt debe ser una fecha válida no futura.');
    }

    if (input.sourceRef) {
      const existing = await repository.findOne({
        where: { sourceRef: input.sourceRef },
        select: { id: true },
      });
      if (existing) return { authorizationId: existing.id, created: false };
    }

    const record = repository.create({
      partyId: input.partyId,
      purpose: input.purpose,
      kind,
      granted: input.granted,
      channel: input.channel,
      legalTextId: input.legalTextId,
      evidenceMediaId: input.evidenceMediaId ?? null,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      capturedBy: input.actorId,
      capturedAt,
      sourceRef: input.sourceRef ?? null,
    });
    try {
      const saved = await repository.save(record);
      return { authorizationId: saved.id, created: true };
    } catch (error) {
      const postgresCode = (error as { driverError?: { code?: string } }).driverError?.code;
      if (input.sourceRef && postgresCode === '23505') {
        const existing = await repository.findOne({
          where: { sourceRef: input.sourceRef },
          select: { id: true },
        });
        if (existing) return { authorizationId: existing.id, created: false };
      }
      throw error;
    }
  }
}
