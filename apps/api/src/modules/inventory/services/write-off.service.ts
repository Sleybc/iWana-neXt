import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Not } from 'typeorm';
import {
  InventoryItem,
  InventoryWriteOff,
  SerializedAsset,
  StockLocation,
  StockMovement,
  StockMovementLine,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import { WriteOffStatus } from '@iwana/shared';
import {
  ListWriteOffsQueryInput,
  ListWriteOffsQuerySchema,
  RejectWriteOffInput,
  RejectWriteOffSchema,
  WriteOffAssetInput,
  WriteOffAssetSchema,
} from '../dto';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import {
  InventoryDomainEventPublisher,
  type ItemStockThresholdSnapshot,
} from './inventory-domain-event-publisher.service';
import { StockLedgerService, StockMovementResult } from './stock-ledger.service';

const TERMINAL_WRITE_OFF_STATUSES = [WriteOffStatus.COMPLETED, WriteOffStatus.REJECTED];

export interface WriteOffLocationSummary {
  id: string;
  name: string;
  code: string | null;
}

export interface WriteOffItemSummary {
  id: string;
  sku: string;
  name: string;
}

export interface WriteOffAssetSummary {
  id: string;
  serialNumber: string;
  inventoryItemId: string;
}

export interface WriteOffMovementSummary {
  id: string;
  movementNumber: string;
}

export interface WriteOffDetail extends InventoryWriteOff {
  location: WriteOffLocationSummary | null;
  item: WriteOffItemSummary | null;
  serializedAsset: WriteOffAssetSummary | null;
  movement: WriteOffMovementSummary | null;
}

export interface WriteOffApproveResult {
  writeOff: WriteOffDetail;
  movementResult: StockMovementResult;
}

async function withTransaction<T>(
  manager: EntityManager,
  work: (transactionManager: EntityManager) => Promise<T>,
): Promise<T> {
  if (typeof manager.transaction === 'function') {
    return manager.transaction(work);
  }

  return work(manager);
}

@Injectable()
export class WriteOffService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly stockLedgerService: StockLedgerService,
    private readonly domainEventPublisher: InventoryDomainEventPublisher,
  ) {}

  private toQuantity(value: number): string {
    return value.toFixed(4);
  }

  private parseQuantity(value: string | number): number {
    if (typeof value === 'number') {
      return value;
    }

    return Number.parseFloat(value);
  }

  private assertApproverDistinct(requestedByUserId: string, actor: JwtPayload): void {
    if (requestedByUserId === actor.sub) {
      throw new BadRequestException(
        'El aprobador no puede ser el mismo usuario que solicitó la baja.',
      );
    }
  }

  private buildLedgerInput(writeOff: InventoryWriteOff): WriteOffAssetInput {
    return {
      itemId: writeOff.itemId,
      serializedAssetId: writeOff.serializedAssetId,
      locationId: writeOff.locationId,
      quantity: writeOff.serializedAssetId ? 1 : this.parseQuantity(writeOff.quantity),
      reason: writeOff.reason,
      notes: writeOff.notes,
      idempotencyKey:
        writeOff.idempotencyKey?.trim() ??
        `writeoff-doc:${writeOff.id}:${writeOff.reason}:${writeOff.locationId}`,
    };
  }

  private async enrichWriteOff(
    manager: EntityManager,
    tenantId: string,
    writeOff: InventoryWriteOff,
  ): Promise<WriteOffDetail> {
    const [location, item, serializedAsset, movement] = await Promise.all([
      manager.findOne(StockLocation, { where: { id: writeOff.locationId, tenantId } }),
      writeOff.itemId
        ? manager.findOne(InventoryItem, { where: { id: writeOff.itemId, tenantId } })
        : Promise.resolve(null),
      writeOff.serializedAssetId
        ? manager.findOne(SerializedAsset, {
            where: { id: writeOff.serializedAssetId, tenantId },
          })
        : Promise.resolve(null),
      writeOff.stockMovementId
        ? manager.findOne(StockMovement, { where: { id: writeOff.stockMovementId, tenantId } })
        : Promise.resolve(null),
    ]);

    return {
      ...writeOff,
      location: location
        ? {
            id: location.id,
            name: location.name,
            code: location.code,
          }
        : null,
      item: item
        ? {
            id: item.id,
            sku: item.sku,
            name: item.name,
          }
        : null,
      serializedAsset: serializedAsset
        ? {
            id: serializedAsset.id,
            serialNumber: serializedAsset.serialNumber ?? '',
            inventoryItemId: serializedAsset.inventoryItemId,
          }
        : null,
      movement: movement
        ? {
            id: movement.id,
            movementNumber: movement.movementNumber,
          }
        : null,
    };
  }

  private async loadMovementResult(
    manager: EntityManager,
    tenantId: string,
    movementId: string,
  ): Promise<StockMovementResult> {
    const movement = await manager.findOne(StockMovement, { where: { id: movementId, tenantId } });

    if (!movement) {
      throw new NotFoundException('El movimiento vinculado a la baja no existe.');
    }

    const lines = await manager.find(StockMovementLine, {
      where: { tenantId, movementId },
      order: { createdAt: 'ASC' },
    });

    return { movement, lines, created: false };
  }

  async createRequest(input: WriteOffAssetInput, actor: JwtPayload): Promise<WriteOffDetail> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = WriteOffAssetSchema.parse(input);

    if (!validated.locationId) {
      throw new BadRequestException('La solicitud de baja requiere bodega origen.');
    }

    const locationId = validated.locationId;
    const quantity = validated.serializedAssetId ? 1 : validated.quantity;

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      withTransaction(qr.manager, async (manager) => {
        const trimmedKey = validated.idempotencyKey?.trim();

        if (trimmedKey) {
          const existing = await manager.findOne(InventoryWriteOff, {
            where: {
              tenantId,
              idempotencyKey: trimmedKey,
              status: Not(In(TERMINAL_WRITE_OFF_STATUSES)),
            },
          });

          if (existing) {
            return this.enrichWriteOff(manager, tenantId, existing);
          }
        }

        const location = await manager.findOne(StockLocation, {
          where: { id: locationId, tenantId },
        });

        if (!location) {
          throw new NotFoundException('La bodega indicada no existe.');
        }

        const writeOff = await manager.save(
          InventoryWriteOff,
          manager.create(InventoryWriteOff, {
            tenantId,
            serializedAssetId: validated.serializedAssetId ?? null,
            itemId: validated.itemId ?? null,
            locationId,
            quantity: this.toQuantity(quantity),
            idempotencyKey: trimmedKey ?? null,
            reason: validated.reason,
            status: WriteOffStatus.PENDING_APPROVAL,
            requestedByUserId: actor.sub,
            notes: validated.notes ?? null,
          }),
        );

        return this.enrichWriteOff(manager, tenantId, writeOff);
      }),
    );
  }

  async list(
    query: ListWriteOffsQueryInput,
  ): Promise<{ data: WriteOffDetail[]; total: number; page: number; limit: number }> {
    const validated = ListWriteOffsQuerySchema.parse(query);
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(InventoryWriteOff, 'writeOff')
        .where('writeOff.tenant_id = :tenantId', { tenantId })
        .orderBy('writeOff.created_at', 'DESC');

      if (validated.status) {
        qb.andWhere('writeOff.status = :status', { status: validated.status });
      }

      if (validated.reason) {
        qb.andWhere('writeOff.reason = :reason', { reason: validated.reason });
      }

      if (validated.itemId) {
        qb.andWhere('writeOff.item_id = :itemId', { itemId: validated.itemId });
      }

      if (validated.serializedAssetId) {
        qb.andWhere('writeOff.serialized_asset_id = :serializedAssetId', {
          serializedAssetId: validated.serializedAssetId,
        });
      }

      if (validated.createdFrom) {
        qb.andWhere('writeOff.created_at >= :createdFrom', {
          createdFrom: validated.createdFrom,
        });
      }

      if (validated.createdTo) {
        qb.andWhere('writeOff.created_at <= :createdTo', {
          createdTo: validated.createdTo,
        });
      }

      const total = await qb.getCount();
      const writeOffs = await qb
        .skip((validated.page - 1) * validated.limit)
        .take(validated.limit)
        .getMany();

      const data = await Promise.all(
        writeOffs.map((writeOff) => this.enrichWriteOff(qr.manager, tenantId, writeOff)),
      );

      return {
        data,
        total,
        page: validated.page,
        limit: validated.limit,
      };
    });
  }

  async getById(id: string): Promise<WriteOffDetail> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const writeOff = await qr.manager.findOne(InventoryWriteOff, { where: { id, tenantId } });

      if (!writeOff) {
        throw new NotFoundException('La solicitud de baja no existe.');
      }

      return this.enrichWriteOff(qr.manager, tenantId, writeOff);
    });
  }

  async approve(id: string, actor: JwtPayload): Promise<WriteOffApproveResult> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      let itemIds: string[] = [];
      let beforeByItem = new Map<string, ItemStockThresholdSnapshot>();
      let shouldPublish = false;

      const result = await withTransaction(qr.manager, async (manager) => {
        const writeOff = await manager
          .createQueryBuilder(InventoryWriteOff, 'writeOff')
          .setLock('pessimistic_write')
          .where('writeOff.id = :id', { id })
          .andWhere('writeOff.tenant_id = :tenantId', { tenantId })
          .getOne();

        if (!writeOff) {
          throw new NotFoundException('La solicitud de baja no existe.');
        }

        if (writeOff.status === WriteOffStatus.COMPLETED) {
          if (!writeOff.stockMovementId) {
            throw new BadRequestException('La baja completada no tiene movimiento vinculado.');
          }

          const movementResult = await this.loadMovementResult(
            manager,
            tenantId,
            writeOff.stockMovementId,
          );

          return {
            writeOff: await this.enrichWriteOff(manager, tenantId, writeOff),
            movementResult,
          };
        }

        if (writeOff.status !== WriteOffStatus.PENDING_APPROVAL) {
          throw new BadRequestException('La solicitud no está pendiente de aprobación.');
        }

        this.assertApproverDistinct(writeOff.requestedByUserId, actor);

        const ledgerInput = this.buildLedgerInput(writeOff);
        if (writeOff.itemId) {
          itemIds = [writeOff.itemId];
        } else if (writeOff.serializedAssetId) {
          const asset = await manager.findOne(SerializedAsset, {
            where: { id: writeOff.serializedAssetId, tenantId },
          });
          itemIds = asset?.inventoryItemId ? [asset.inventoryItemId] : [];
        } else {
          itemIds = [];
        }
        beforeByItem = await this.domainEventPublisher.captureItemSnapshots(
          manager,
          tenantId,
          itemIds,
        );

        const movementResult = await this.stockLedgerService.recordWriteOffWithManager(
          manager,
          tenantId,
          ledgerInput,
          actor,
        );

        writeOff.status = WriteOffStatus.COMPLETED;
        writeOff.approvedByUserId = actor.sub;
        writeOff.approvedAt = new Date();
        writeOff.stockMovementId = movementResult.movement.id;

        const saved = await manager.save(InventoryWriteOff, writeOff);
        shouldPublish = movementResult.created;

        return {
          writeOff: await this.enrichWriteOff(manager, tenantId, saved),
          movementResult,
        };
      });

      if (shouldPublish && itemIds.length > 0) {
        const afterByItem = await this.domainEventPublisher.captureItemSnapshots(
          qr.manager,
          tenantId,
          itemIds,
        );
        this.domainEventPublisher.publishAfterCommittedMovement({
          tenantId,
          actorUserId: actor.sub,
          beforeByItem,
          afterByItem,
          movement: result.movementResult.movement,
          lines: result.movementResult.lines,
          created: result.movementResult.created,
        });
      }

      return result;
    });
  }

  async reject(id: string, input: RejectWriteOffInput, actor: JwtPayload): Promise<WriteOffDetail> {
    const validated = RejectWriteOffSchema.parse(input);
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      withTransaction(qr.manager, async (manager) => {
        const writeOff = await manager
          .createQueryBuilder(InventoryWriteOff, 'writeOff')
          .setLock('pessimistic_write')
          .where('writeOff.id = :id', { id })
          .andWhere('writeOff.tenant_id = :tenantId', { tenantId })
          .getOne();

        if (!writeOff) {
          throw new NotFoundException('La solicitud de baja no existe.');
        }

        if (writeOff.status !== WriteOffStatus.PENDING_APPROVAL) {
          throw new BadRequestException('La solicitud no está pendiente de aprobación.');
        }

        this.assertApproverDistinct(writeOff.requestedByUserId, actor);

        writeOff.status = WriteOffStatus.REJECTED;
        writeOff.rejectedByUserId = actor.sub;
        writeOff.rejectedAt = new Date();
        writeOff.rejectionNotes = validated.notes ?? null;

        const saved = await manager.save(InventoryWriteOff, writeOff);

        return this.enrichWriteOff(manager, tenantId, saved);
      }),
    );
  }
}
