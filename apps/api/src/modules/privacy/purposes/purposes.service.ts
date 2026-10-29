import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { AuditAction, DataPurpose, PurposeSetting, UpdatePurposeSettings } from '@iwana/shared';
import { DataSource } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { IPrivacyPurposeReadPort } from '../ports/privacy-purpose-read.port';
import { withPrivacyTenant } from '../ports/privacy-tenant-query';

@Injectable()
export class PurposesService implements IPrivacyPurposeReadPort {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<PurposeSetting[]> {
    return withPrivacyTenant(
      this.dataSource,
      async (manager) =>
        manager.query(
          'SELECT purpose, enabled FROM privacy_purpose_settings ORDER BY purpose',
        ) as Promise<PurposeSetting[]>,
    );
  }

  async enabledPurposes(): Promise<DataPurpose[]> {
    return (await this.list()).filter((item) => item.enabled).map((item) => item.purpose);
  }

  async update(input: UpdatePurposeSettings, actorId: string): Promise<PurposeSetting[]> {
    if (input.items.some((item) => item.purpose === 'TRATAMIENTO_CONTRACTUAL' && !item.enabled)) {
      throw new UnprocessableEntityException({
        code: 'PRIVACY_PURPOSE_REQUIRED',
        message: 'Esta finalidad es siempre requerida.',
      });
    }
    return withPrivacyTenant(this.dataSource, async (manager) => {
      const before = (await manager.query(
        'SELECT purpose, enabled FROM privacy_purpose_settings ORDER BY purpose FOR UPDATE',
      )) as PurposeSetting[];
      for (const item of input.items) {
        await manager.query(
          'UPDATE privacy_purpose_settings SET enabled = $1, updated_at = now(), updated_by = $2 WHERE purpose = $3',
          [item.enabled, actorId, item.purpose],
        );
      }
      const after = (await manager.query(
        'SELECT purpose, enabled FROM privacy_purpose_settings ORDER BY purpose',
      )) as PurposeSetting[];
      await this.audit.logWithin(
        {
          action: AuditAction.UPDATE,
          entityType: 'PrivacyPurposeSetting',
          entityId: actorId,
          userId: actorId,
          oldValue: { items: before },
          newValue: { items: after },
        },
        manager,
      );
      return after;
    });
  }
}
