import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { StockBalance, TenantContext, runInTenantSchema } from '@iwana/db';
import { StockBalanceCondition } from '@iwana/shared';
import { ListStockBalancesQueryInput, ListStockBalancesQuerySchema } from '../dto';

interface ApplyStockDeltaInput {
  tenantId: string;
  itemId: string;
  locationId: string;
  lotId?: string | null;
  condition?: StockBalanceCondition;
  delta: number;
}

function toNumeric(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return value;
  }

  if (!value) {
    return 0;
  }

  return Number.parseFloat(value);
}

function toQuantity(value: number): string {
  return value.toFixed(2);
}

@Injectable()
export class StockBalanceService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async list(query: ListStockBalancesQueryInput): Promise<StockBalance[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = ListStockBalancesQuerySchema.parse(query);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(StockBalance, 'balance')
        .where('balance.tenant_id = :tenantId', { tenantId })
        .orderBy('balance.updated_at', 'DESC');

      if (validated.itemId) {
        qb.andWhere('balance.item_id = :itemId', { itemId: validated.itemId });
      }

      if (validated.locationId) {
        qb.andWhere('balance.location_id = :locationId', { locationId: validated.locationId });
      }

      if (validated.condition) {
        qb.andWhere('balance.condition = :condition', { condition: validated.condition });
      }

      return qb.getMany();
    });
  }

  async applyDeltaWithManager(
    manager: EntityManager,
    input: ApplyStockDeltaInput,
  ): Promise<StockBalance> {
    const condition = input.condition ?? StockBalanceCondition.NEW;
    const existingQuery = manager
      .createQueryBuilder(StockBalance, 'balance')
      .where('balance.tenant_id = :tenantId', { tenantId: input.tenantId })
      .andWhere('balance.item_id = :itemId', { itemId: input.itemId })
      .andWhere('balance.location_id = :locationId', { locationId: input.locationId })
      .andWhere('balance.condition = :condition', { condition });

    if (input.lotId) {
      existingQuery.andWhere('balance.lot_id = :lotId', { lotId: input.lotId });
    } else {
      existingQuery.andWhere('balance.lot_id IS NULL');
    }

    const existing = await existingQuery.getOne();

    if (!existing) {
      if (input.delta < 0) {
        throw new BadRequestException('El movimiento dejaría saldo negativo.');
      }

      return manager.save(
        StockBalance,
        manager.create(StockBalance, {
          tenantId: input.tenantId,
          itemId: input.itemId,
          locationId: input.locationId,
          lotId: input.lotId ?? null,
          condition,
          quantityOnHand: toQuantity(input.delta),
          quantityReserved: toQuantity(0),
        }),
      );
    }

    const current = toNumeric(existing.quantityOnHand);
    const next = current + input.delta;

    if (next < 0) {
      throw new BadRequestException('El movimiento dejaría saldo negativo.');
    }

    existing.quantityOnHand = toQuantity(next);
    return manager.save(StockBalance, existing);
  }
}
