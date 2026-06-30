import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { AssetLifecycleEvent, TenantContext, runInTenantSchema } from '@iwana/db';
import { AssetLifecycleEventType, SerializedAssetStatus } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

interface RecordAssetLifecycleInput {
  tenantId: string;
  serializedAssetId: string;
  eventType: AssetLifecycleEventType;
  fromStatus?: SerializedAssetStatus | null;
  toStatus?: SerializedAssetStatus | null;
  locationId?: string | null;
  responsibleRefId?: string | null;
  notes?: string | null;
  actorUserId?: string | null;
}

@Injectable()
export class AssetLifecycleService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async listForAsset(serializedAssetId: string) {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.find(AssetLifecycleEvent, {
        where: { tenantId, serializedAssetId },
        order: { createdAt: 'ASC' },
      }),
    );
  }

  async recordWithManager(
    manager: EntityManager,
    input: RecordAssetLifecycleInput,
  ): Promise<AssetLifecycleEvent> {
    return manager.save(
      AssetLifecycleEvent,
      manager.create(AssetLifecycleEvent, {
        tenantId: input.tenantId,
        serializedAssetId: input.serializedAssetId,
        eventType: input.eventType,
        fromStatus: input.fromStatus ?? null,
        toStatus: input.toStatus ?? null,
        locationId: input.locationId ?? null,
        responsibleRefId: input.responsibleRefId ?? null,
        notes: input.notes ?? null,
        actorUserId: input.actorUserId ?? null,
      }),
    );
  }

  async recordFromActor(
    input: Omit<RecordAssetLifecycleInput, 'actorUserId'>,
    actor: JwtPayload,
  ): Promise<AssetLifecycleEvent> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      this.recordWithManager(qr.manager, {
        ...input,
        actorUserId: actor.sub,
      }),
    );
  }
}
