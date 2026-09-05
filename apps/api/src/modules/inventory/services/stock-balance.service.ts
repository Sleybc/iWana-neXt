import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { StockBalance, TenantContext, runInTenantSchema } from '@iwana/db';
import { StockBalanceCondition } from '@iwana/shared';
import { ListStockBalancesQueryInput, ListStockBalancesQuerySchema } from '../dto';
import {
  clampInventoryLimit,
  dateIdDescCursorParams,
  dateIdDescCursorWhere,
  InventoryPaginatedResult,
  sliceDateIdDescPage,
} from '../../../common/pagination';
import { acquireTransactionAdvisoryLock } from './inventory-postgres.util';

export interface ApplyStockDeltaInput {
  tenantId: string;
  itemId: string;
  locationId: string;
  lotId?: string | null;
  condition?: StockBalanceCondition;
  /** Delta de existencia física (puede ser 0 si solo se ajusta reserva). */
  delta: number;
  /** Delta de reserva comprometida (puede ser 0 si solo se ajusta existencia). */
  reservedDelta?: number;
}

export interface StockAvailability {
  onHand: number;
  reserved: number;
  available: number;
}

export interface StockAvailabilityQuery {
  itemId: string;
  locationId: string;
  lotId?: string | null;
  condition?: StockBalanceCondition;
}

/**
 * Parsea una cantidad `numeric` (la entidad la guarda como string) a number.
 * Canónico para todo cálculo de disponible (MOD12 S1 · B1 lo reutiliza).
 */
export function toNumeric(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return value;
  }

  if (!value) {
    return 0;
  }

  return Number.parseFloat(value);
}

/** Formatea una cantidad a decimal string con 2 posiciones (`numeric(12,2)`). */
export function toQuantity(value: number): string {
  return value.toFixed(2);
}

function roundQty(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeAvailable(onHand: number, reserved: number): number {
  return roundQty(onHand - reserved);
}

export function formatInsufficientAvailableMessage(onHand: number, reserved: number): string {
  return `No hay disponible suficiente: ${toQuantity(onHand)} en existencia, ${toQuantity(reserved)} comprometidos.`;
}

/**
 * Clave determinística de serialización por tupla de balance
 * (tenant × ítem × bodega × lote × condición). El lote ausente se normaliza a `null`
 * para que dos llamadas equivalentes produzcan siempre la misma clave.
 */
export function buildStockBalanceLockKey(input: {
  tenantId: string;
  itemId: string;
  locationId: string;
  lotId?: string | null;
  condition?: StockBalanceCondition;
}): string {
  const condition = input.condition ?? StockBalanceCondition.NEW;
  const lotId = input.lotId ?? 'null';
  return `stock-balance:${input.tenantId}:${input.itemId}:${input.locationId}:${lotId}:${condition}`;
}

export function formatInvariantViolationMessage(onHand: number, reserved: number): string {
  return `El movimiento dejaría la existencia (${toQuantity(onHand)}) por debajo de lo comprometido (${toQuantity(reserved)}).`;
}

@Injectable()
export class StockBalanceService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async list(query: ListStockBalancesQueryInput): Promise<InventoryPaginatedResult<StockBalance>> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = ListStockBalancesQuerySchema.parse(query);
    const limit = clampInventoryLimit(validated.limit);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(StockBalance, 'balance')
        .where('balance.tenant_id = :tenantId', { tenantId });

      if (validated.itemId) {
        qb.andWhere('balance.item_id = :itemId', { itemId: validated.itemId });
      }

      if (validated.locationId) {
        qb.andWhere('balance.location_id = :locationId', { locationId: validated.locationId });
      }

      if (validated.condition) {
        qb.andWhere('balance.condition = :condition', { condition: validated.condition });
      }

      const total = await qb.clone().getCount();

      if (validated.cursor) {
        qb.andWhere(
          dateIdDescCursorWhere('balance', 'updated_at'),
          dateIdDescCursorParams(validated.cursor),
        );
      }

      const rows = await qb
        .orderBy('balance.updated_at', 'DESC')
        .addOrderBy('balance.id', 'DESC')
        .take(limit + 1)
        .getMany();

      const { data, nextCursor } = sliceDateIdDescPage(rows, limit, (row) => row.updatedAt);
      return { data, meta: { nextCursor, total } };
    });
  }

  /**
   * Disponible por tupla (ítem × bodega × lote × condición).
   * Único cálculo canónico: available = onHand − reserved.
   */
  async getAvailabilityWithManager(
    manager: EntityManager,
    tenantId: string,
    input: StockAvailabilityQuery,
  ): Promise<StockAvailability> {
    const condition = input.condition ?? StockBalanceCondition.NEW;
    const balances = await manager.find(StockBalance, {
      where: {
        tenantId,
        itemId: input.itemId,
        locationId: input.locationId,
        condition,
      },
    });

    const matching = balances.filter(
      (balance) => (balance.lotId ?? null) === (input.lotId ?? null),
    );
    const onHand = roundQty(
      matching.reduce((total, balance) => total + toNumeric(balance.quantityOnHand), 0),
    );
    const reserved = roundQty(
      matching.reduce((total, balance) => total + toNumeric(balance.quantityReserved), 0),
    );

    return {
      onHand,
      reserved,
      available: computeAvailable(onHand, reserved),
    };
  }

  async getAvailableQuantityWithManager(
    manager: EntityManager,
    tenantId: string,
    input: StockAvailabilityQuery,
  ): Promise<number> {
    const availability = await this.getAvailabilityWithManager(manager, tenantId, input);
    return availability.available;
  }

  async applyDeltaWithManager(
    manager: EntityManager,
    input: ApplyStockDeltaInput,
  ): Promise<StockBalance> {
    const condition = input.condition ?? StockBalanceCondition.NEW;
    const reservedDelta = input.reservedDelta ?? 0;

    // Serializa el read-modify-write por tupla de balance ANTES de leer.
    // Sin esto, dos transacciones concurrentes en READ COMMITTED leen el mismo
    // quantity_reserved y la segunda pisa a la primera (lost update → sobre-reserva).
    // Se usa advisory lock en lugar de SELECT ... FOR UPDATE porque también cubre
    // el caso "la fila aún no existe" (dos inserciones concurrentes de la misma tupla);
    // el índice UNIQUE queda como segunda red.
    await acquireTransactionAdvisoryLock(
      manager,
      buildStockBalanceLockKey({
        tenantId: input.tenantId,
        itemId: input.itemId,
        locationId: input.locationId,
        lotId: input.lotId ?? null,
        condition,
      }),
    );

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
      const nextOnHand = roundQty(input.delta);
      const nextReserved = roundQty(reservedDelta);

      if (nextOnHand < 0) {
        throw new BadRequestException('El movimiento dejaría saldo negativo.');
      }

      if (nextReserved < 0 || nextReserved > nextOnHand) {
        throw new BadRequestException(
          nextReserved > nextOnHand
            ? formatInvariantViolationMessage(nextOnHand, nextReserved)
            : formatInsufficientAvailableMessage(nextOnHand, 0),
        );
      }

      return manager.save(
        StockBalance,
        manager.create(StockBalance, {
          tenantId: input.tenantId,
          itemId: input.itemId,
          locationId: input.locationId,
          lotId: input.lotId ?? null,
          condition,
          quantityOnHand: toQuantity(nextOnHand),
          quantityReserved: toQuantity(nextReserved),
        }),
      );
    }

    const currentOnHand = toNumeric(existing.quantityOnHand);
    const currentReserved = toNumeric(existing.quantityReserved);
    const nextOnHand = roundQty(currentOnHand + input.delta);
    const nextReserved = roundQty(currentReserved + reservedDelta);

    if (nextOnHand < 0) {
      throw new BadRequestException('El movimiento dejaría saldo negativo.');
    }

    if (nextReserved < 0) {
      throw new BadRequestException(
        `No se puede liberar más reserva de la comprometida (${toQuantity(currentReserved)}).`,
      );
    }

    if (nextReserved > nextOnHand) {
      throw new BadRequestException(formatInvariantViolationMessage(nextOnHand, nextReserved));
    }

    existing.quantityOnHand = toQuantity(nextOnHand);
    existing.quantityReserved = toQuantity(nextReserved);
    return manager.save(StockBalance, existing);
  }
}
