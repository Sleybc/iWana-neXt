import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  InventoryTrackingMode,
  StockBalanceCondition,
  StockCountStatus,
  StockMovementOrigin,
} from '@iwana/shared';
import { DataSource, EntityManager, In } from 'typeorm';
import {
  InventoryItem,
  StockBalance,
  StockCount,
  StockCountLine,
  StockLocation,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import {
  CreateStockCountInput,
  CreateStockCountSchema,
  ListStockCountsQueryInput,
  ListStockCountsQuerySchema,
  UpdateStockCountInput,
  UpdateStockCountSchema,
} from '../dto';
import { generateSequentialNumber } from '../utils/sequential-number';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import {
  InventoryDomainEventPublisher,
  type ItemStockThresholdSnapshot,
} from './inventory-domain-event-publisher.service';
import { StockLedgerService } from './stock-ledger.service';
import {
  assertExclusivePageCursor,
  buildCursorMeta,
  buildPageMeta,
  clampInventoryLimit,
  dateIdDescCursorParams,
  dateIdDescCursorWhere,
  sliceDateIdDescPage,
} from '../../../common/pagination';
import { clampPage } from '../../../common/pagination/clamp-page';
import type { ListResponse } from '@iwana/shared';

export type StockCountLineView = StockCountLine & {
  variance: string | null;
  itemSku?: string | null;
  itemName?: string | null;
};

export type StockCountDetail = StockCount & { lines: StockCountLineView[] };

@Injectable()
export class CycleCountService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly stockLedgerService: StockLedgerService,
    private readonly domainEventPublisher: InventoryDomainEventPublisher,
  ) {}

  private toNumeric(value: string | number | null | undefined): number {
    if (typeof value === 'number') {
      return value;
    }

    if (value == null || value === '') {
      return 0;
    }

    return Number.parseFloat(value);
  }

  private toQuantity(value: number): string {
    return value.toFixed(2);
  }

  private assertEditable(status: StockCountStatus) {
    if (status === StockCountStatus.CLOSED || status === StockCountStatus.CANCELLED) {
      throw new BadRequestException('El conteo está cerrado o cancelado y no admite cambios.');
    }
  }

  private mapLine(line: StockCountLine, item?: InventoryItem | null): StockCountLineView {
    const variance =
      line.countedQty == null
        ? null
        : this.toQuantity(this.toNumeric(line.countedQty) - this.toNumeric(line.expectedQty));

    return {
      ...line,
      variance,
      itemSku: item?.sku ?? null,
      itemName: item?.name ?? null,
    };
  }

  private async getLiveOnHand(
    manager: EntityManager,
    tenantId: string,
    input: {
      itemId: string;
      locationId: string;
      lotId: string | null;
      condition: StockBalanceCondition;
    },
  ): Promise<number> {
    const balances = await manager.find(StockBalance, {
      where: {
        tenantId,
        itemId: input.itemId,
        locationId: input.locationId,
        condition: input.condition,
      },
    });

    return balances
      .filter((balance) => (balance.lotId ?? null) === (input.lotId ?? null))
      .reduce((total, balance) => total + this.toNumeric(balance.quantityOnHand), 0);
  }

  async create(input: CreateStockCountInput, actor: JwtPayload): Promise<StockCountDetail> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = CreateStockCountSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.transaction(async (manager) => {
        const location = await manager.findOne(StockLocation, {
          where: { id: validated.locationId, tenantId },
        });
        if (!location) {
          throw new NotFoundException('La bodega indicada no existe.');
        }

        const balances = await manager.find(StockBalance, {
          where: { tenantId, locationId: validated.locationId },
        });

        const itemIds = [...new Set(balances.map((balance) => balance.itemId))];
        const items =
          itemIds.length === 0
            ? []
            : await manager.find(InventoryItem, {
                where: {
                  tenantId,
                  id: In(itemIds),
                  trackingMode: InventoryTrackingMode.CONSUMABLE,
                  ...(validated.categoryId ? { categoryId: validated.categoryId } : {}),
                },
              });
        const consumableById = new Map(items.map((item) => [item.id, item]));

        const countNumber = await generateSequentialNumber(manager, {
          entity: StockCount,
          alias: 'count',
          columnName: 'count_number',
          prefix: 'CNT-',
          tenantId,
        });
        const count = await manager.save(
          StockCount,
          manager.create(StockCount, {
            tenantId,
            countNumber,
            status: StockCountStatus.COUNTING,
            locationId: validated.locationId,
            categoryId: validated.categoryId ?? null,
            notes: validated.notes ?? null,
            createdByUserId: actor.sub,
            closedByUserId: null,
            closedAt: null,
            stockMovementId: null,
          }),
        );

        const lineEntities: StockCountLine[] = [];
        for (const balance of balances) {
          const item = consumableById.get(balance.itemId);
          if (!item) {
            continue;
          }

          const onHand = this.toNumeric(balance.quantityOnHand);
          if (onHand === 0) {
            continue;
          }

          lineEntities.push(
            manager.create(StockCountLine, {
              tenantId,
              countId: count.id,
              itemId: balance.itemId,
              lotId: balance.lotId ?? null,
              condition: balance.condition,
              expectedQty: this.toQuantity(onHand),
              countedQty: null,
            }),
          );
        }

        const lines =
          lineEntities.length > 0 ? await manager.save(StockCountLine, lineEntities) : [];

        return {
          ...count,
          lines: lines.map((line) => this.mapLine(line, consumableById.get(line.itemId))),
        };
      }),
    );
  }

  async list(query: ListStockCountsQueryInput): Promise<ListResponse<StockCount>> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = ListStockCountsQuerySchema.parse(query);
    assertExclusivePageCursor(validated);
    const limit = clampInventoryLimit(validated.limit);
    const usePage = validated.page !== undefined;
    const page = usePage ? clampPage(validated.page!, limit).page : 1;

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(StockCount, 'count')
        .where('count.tenant_id = :tenantId', { tenantId });

      if (validated.status) {
        qb.andWhere('count.status = :status', { status: validated.status });
      }

      if (validated.locationId) {
        qb.andWhere('count.location_id = :locationId', { locationId: validated.locationId });
      }

      const total = await qb.clone().getCount();

      qb.orderBy('count.created_at', 'DESC').addOrderBy('count.id', 'DESC');

      if (usePage) {
        const rows = await qb
          .skip((page - 1) * limit)
          .take(limit)
          .getMany();
        return {
          data: rows,
          meta: buildPageMeta({
            total,
            page,
            limit,
            randomAccess: false,
            sortableFields: [],
          }),
        };
      }

      if (validated.cursor) {
        qb.andWhere(
          dateIdDescCursorWhere('count', 'created_at'),
          dateIdDescCursorParams(validated.cursor),
        );
      }

      const rows = await qb.take(limit + 1).getMany();
      const { data, nextCursor } = sliceDateIdDescPage(rows, limit, (row) => row.createdAt);
      return {
        data,
        meta: buildCursorMeta({
          nextCursor,
          total,
          limit,
        }),
      };
    });
  }

  async getById(id: string): Promise<StockCountDetail> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const count = await qr.manager.findOne(StockCount, { where: { id, tenantId } });
      if (!count) {
        throw new NotFoundException('El conteo solicitado no existe.');
      }

      const lines = await qr.manager.find(StockCountLine, {
        where: { tenantId, countId: id },
        order: { createdAt: 'ASC' },
      });
      const itemIds = [...new Set(lines.map((line) => line.itemId))];
      const items =
        itemIds.length === 0
          ? []
          : await qr.manager.find(InventoryItem, {
              where: { tenantId, id: In(itemIds) },
            });
      const itemById = new Map(items.map((item) => [item.id, item]));

      return {
        ...count,
        lines: lines.map((line) => this.mapLine(line, itemById.get(line.itemId))),
      };
    });
  }

  async update(
    id: string,
    input: UpdateStockCountInput,
    _actor: JwtPayload,
  ): Promise<StockCountDetail> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = UpdateStockCountSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.transaction(async (manager) => {
        const count = await manager.findOne(StockCount, { where: { id, tenantId } });
        if (!count) {
          throw new NotFoundException('El conteo solicitado no existe.');
        }

        this.assertEditable(count.status);

        for (const lineInput of validated.lines) {
          if (lineInput.id) {
            const existing = await manager.findOne(StockCountLine, {
              where: { id: lineInput.id, tenantId, countId: id },
            });
            if (!existing) {
              throw new NotFoundException('Una de las líneas del conteo no existe.');
            }

            existing.countedQty = this.toQuantity(lineInput.countedQty);
            await manager.save(StockCountLine, existing);
            continue;
          }

          if (!lineInput.itemId) {
            throw new BadRequestException('Las líneas nuevas del conteo requieren itemId.');
          }

          const item = await manager.findOne(InventoryItem, {
            where: {
              id: lineInput.itemId,
              tenantId,
              trackingMode: InventoryTrackingMode.CONSUMABLE,
            },
          });
          if (!item) {
            throw new BadRequestException('Solo se pueden agregar ítems consumibles al conteo.');
          }

          await manager.save(
            StockCountLine,
            manager.create(StockCountLine, {
              tenantId,
              countId: id,
              itemId: lineInput.itemId,
              lotId: lineInput.lotId ?? null,
              condition: lineInput.condition ?? StockBalanceCondition.NEW,
              expectedQty: this.toQuantity(lineInput.expectedQty ?? 0),
              countedQty: this.toQuantity(lineInput.countedQty),
            }),
          );
        }

        if (count.status === StockCountStatus.OPEN) {
          count.status = StockCountStatus.COUNTING;
          await manager.save(StockCount, count);
        }

        const lines = await manager.find(StockCountLine, {
          where: { tenantId, countId: id },
          order: { createdAt: 'ASC' },
        });
        const items = await manager.find(InventoryItem, {
          where: { tenantId, id: In([...new Set(lines.map((line) => line.itemId))]) },
        });
        const itemById = new Map(items.map((item) => [item.id, item]));

        return {
          ...count,
          lines: lines.map((line) => this.mapLine(line, itemById.get(line.itemId))),
        };
      }),
    );
  }

  async close(id: string, actor: JwtPayload): Promise<StockCountDetail> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      let itemIds: string[] = [];
      let beforeByItem = new Map<string, ItemStockThresholdSnapshot>();

      type CloseTxResult = {
        detail: StockCountDetail;
        movementResult: Awaited<ReturnType<StockLedgerService['recordMovementWithManager']>> | null;
      };

      const closed = await qr.manager.transaction(async (manager): Promise<CloseTxResult> => {
        const count = await manager.findOne(StockCount, { where: { id, tenantId } });
        if (!count) {
          throw new NotFoundException('El conteo solicitado no existe.');
        }

        if (count.status === StockCountStatus.CANCELLED) {
          throw new BadRequestException('No se puede cerrar un conteo cancelado.');
        }

        if (count.status === StockCountStatus.CLOSED) {
          const lines = await manager.find(StockCountLine, {
            where: { tenantId, countId: id },
            order: { createdAt: 'ASC' },
          });
          return {
            detail: {
              ...count,
              lines: lines.map((line) => this.mapLine(line)),
            },
            movementResult: null,
          };
        }

        const lines = await manager.find(StockCountLine, {
          where: { tenantId, countId: id },
          order: { createdAt: 'ASC' },
        });

        const movementLines: Array<{
          itemId: string;
          locationId: string;
          lotId: string | null;
          condition: StockBalanceCondition;
          quantity: number;
        }> = [];

        for (const line of lines) {
          if (line.countedQty == null) {
            continue;
          }

          const liveOnHand = await this.getLiveOnHand(manager, tenantId, {
            itemId: line.itemId,
            locationId: count.locationId,
            lotId: line.lotId,
            condition: line.condition,
          });
          const delta = this.toNumeric(line.countedQty) - liveOnHand;
          if (delta === 0) {
            continue;
          }

          movementLines.push({
            itemId: line.itemId,
            locationId: count.locationId,
            lotId: line.lotId,
            condition: line.condition,
            quantity: delta,
          });
        }

        let stockMovementId: string | null = count.stockMovementId;
        let movementResult: CloseTxResult['movementResult'] = null;
        if (movementLines.length > 0) {
          itemIds = [...new Set(movementLines.map((line) => line.itemId))];
          beforeByItem = await this.domainEventPublisher.captureItemSnapshots(
            manager,
            tenantId,
            itemIds,
          );
          movementResult = await this.stockLedgerService.recordMovementWithManager(
            manager,
            tenantId,
            {
              origin: StockMovementOrigin.ADJUSTMENT,
              originContext: 'inventory.cycle-count',
              originRefId: count.id,
              idempotencyKey: `cycle-count:${count.id}`,
              notes: `Conteo físico ${count.countNumber}`,
              lines: movementLines,
            },
            actor,
          );
          stockMovementId = movementResult.movement.id;
        }

        count.status = StockCountStatus.CLOSED;
        count.closedAt = new Date();
        count.closedByUserId = actor.sub;
        count.stockMovementId = stockMovementId;
        await manager.save(StockCount, count);

        return {
          detail: {
            ...count,
            lines: lines.map((line) => this.mapLine(line)),
          },
          movementResult,
        };
      });

      if (closed.movementResult?.created && itemIds.length > 0) {
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
          movement: closed.movementResult.movement,
          lines: closed.movementResult.lines,
          created: closed.movementResult.created,
        });
      }

      return closed.detail;
    });
  }

  async cancel(id: string, _actor: JwtPayload): Promise<StockCountDetail> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.transaction(async (manager) => {
        const count = await manager.findOne(StockCount, { where: { id, tenantId } });
        if (!count) {
          throw new NotFoundException('El conteo solicitado no existe.');
        }

        if (count.status === StockCountStatus.CLOSED) {
          throw new BadRequestException('No se puede cancelar un conteo cerrado.');
        }

        if (count.status === StockCountStatus.CANCELLED) {
          const lines = await manager.find(StockCountLine, {
            where: { tenantId, countId: id },
            order: { createdAt: 'ASC' },
          });
          return { ...count, lines: lines.map((line) => this.mapLine(line)) };
        }

        count.status = StockCountStatus.CANCELLED;
        await manager.save(StockCount, count);

        const lines = await manager.find(StockCountLine, {
          where: { tenantId, countId: id },
          order: { createdAt: 'ASC' },
        });

        return {
          ...count,
          lines: lines.map((line) => this.mapLine(line)),
        };
      }),
    );
  }
}
