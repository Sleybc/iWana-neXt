import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { AssetLifecycleEvent, StockLocation, TenantContext, runInTenantSchema } from '@iwana/db';
import { AssetLifecycleEventType, SerializedAssetStatus } from '@iwana/shared';
import { clampPage } from '../../../common/pagination/clamp-page';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { AssetLifecycleEventRecord } from '../types/serialized-asset-detail.types';

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
  stockMovementId?: string | null;
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

  async listPaginatedForAsset(
    serializedAssetId: string,
    rawPage: number,
    rawLimit: number,
  ): Promise<{ data: AssetLifecycleEventRecord[]; total: number; page: number; limit: number }> {
    const { page, limit } = clampPage(rawPage, rawLimit);
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(AssetLifecycleEvent, 'event')
        .where('event.tenant_id = :tenantId', { tenantId })
        .andWhere('event.serialized_asset_id = :serializedAssetId', { serializedAssetId })
        // DEF-1: desempate por id para paginación offset estable.
        .orderBy('event.created_at', 'DESC')
        .addOrderBy('event.id', 'DESC');

      const total = await qb.getCount();
      const events = await qb
        .skip((page - 1) * limit)
        .take(limit)
        .getMany();

      const locationIds = [
        ...new Set(events.map((event) => event.locationId).filter((id): id is string => !!id)),
      ];
      const locations =
        locationIds.length > 0
          ? await qr.manager.find(StockLocation, {
              where: { tenantId, id: In(locationIds) },
            })
          : [];
      const locationNameById = new Map(locations.map((location) => [location.id, location.name]));

      return {
        data: events.map((event) => this.toRecord(event, locationNameById)),
        total,
        page,
        limit,
      };
    });
  }

  private toRecord(
    event: AssetLifecycleEvent,
    locationNameById: Map<string, string>,
  ): AssetLifecycleEventRecord {
    return {
      id: event.id,
      eventType: event.eventType,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      locationId: event.locationId,
      locationName: event.locationId ? (locationNameById.get(event.locationId) ?? null) : null,
      responsibleRefId: event.responsibleRefId,
      actorUserId: event.actorUserId,
      notes: event.notes,
      occurredAt: event.createdAt,
      stockMovementId: event.stockMovementId,
    };
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
        stockMovementId: input.stockMovementId ?? null,
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
