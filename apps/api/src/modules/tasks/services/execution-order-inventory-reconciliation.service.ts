import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ExecutionOrderItemUsage, TenantContext, runInTenantSchema } from '@iwana/db';

export interface InventoryMovementConfirmedInput {
  inventoryRequestId: string;
  stockMovementId: string;
  executionOrderId: string;
}

export interface InventoryMovementRejectedInput {
  inventoryRequestId: string;
  reasonCode: string;
  executionOrderId: string;
}

/**
 * Servicio de reconciliación de inventario para MOD11.
 *
 * Consume los eventos de MOD12 (InventoryMovementConfirmedV1,
 * InventoryMovementRejectedV1) y actualiza el estado de los
 * registros de consumo (ExecutionOrderItemUsage) de forma
 * idempotente.
 *
 * ADR-068 §6:
 * - MOD11 solicita consumo/devolución mediante outbox.
 * - MOD12 confirma o rechaza.
 * - MOD11 conserva referencias confirmadas y no comparte
 *   EntityManager con MOD12.
 */
@Injectable()
export class ExecutionOrderInventoryReconciliationService {
  private readonly logger = new Logger(ExecutionOrderInventoryReconciliationService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Procesa una confirmación de inventario desde MOD12.
   *
   * Idempotente: si el registro ya está CONFIRMED con el mismo
   * stockMovementId, no hace nada. Si el registro no existe (race
   * condition), lanza error para que el inbox reintente.
   */
  async applyInventoryMovementConfirmed(
    input: InventoryMovementConfirmedInput,
    tenantId: string,
  ): Promise<void> {
    const { schemaName } = TenantContext.getOrThrow();

    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const usage = await qr.manager.findOne(ExecutionOrderItemUsage, {
        where: {
          tenantId,
          inventoryRequestId: input.inventoryRequestId,
        },
      });

      if (!usage) {
        this.logger.warn(
          `[inv-reconciliation] Usage no encontrado para inventoryRequestId=${input.inventoryRequestId}. Se reintentará.`,
        );
        throw new NotFoundException(
          `Registro de consumo no encontrado para inventoryRequestId=${input.inventoryRequestId}`,
        );
      }

      // Idempotencia: si ya está confirmado con el mismo stockMovementId,
      // no hacemos nada.
      if (usage.movementStatus === 'CONFIRMED' && usage.stockMovementId === input.stockMovementId) {
        this.logger.debug(
          `[inv-reconciliation] Duplicado idempotente ignorado para inventoryRequestId=${input.inventoryRequestId}`,
        );
        return;
      }

      usage.movementStatus = 'CONFIRMED';
      usage.stockMovementId = input.stockMovementId;

      await qr.manager.save(ExecutionOrderItemUsage, usage);

      this.logger.log(
        `[inv-reconciliation] Consumo confirmado: inventoryRequestId=${input.inventoryRequestId} stockMovementId=${input.stockMovementId}`,
      );
    });
  }

  /**
   * Procesa un rechazo de inventario desde MOD12.
   *
   * Idempotente: si el registro ya está REJECTED, no hace nada.
   */
  async applyInventoryMovementRejected(
    input: InventoryMovementRejectedInput,
    tenantId: string,
  ): Promise<void> {
    const { schemaName } = TenantContext.getOrThrow();

    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const usage = await qr.manager.findOne(ExecutionOrderItemUsage, {
        where: {
          tenantId,
          inventoryRequestId: input.inventoryRequestId,
        },
      });

      if (!usage) {
        this.logger.warn(
          `[inv-reconciliation] Usage no encontrado para inventoryRequestId=${input.inventoryRequestId}. Se reintentará.`,
        );
        throw new NotFoundException(
          `Registro de consumo no encontrado para inventoryRequestId=${input.inventoryRequestId}`,
        );
      }

      // Idempotencia: si ya está rechazado, no hacemos nada.
      if (usage.movementStatus === 'REJECTED') {
        this.logger.debug(
          `[inv-reconciliation] Rechazo duplicado ignorado para inventoryRequestId=${input.inventoryRequestId}`,
        );
        return;
      }

      usage.movementStatus = 'REJECTED';

      await qr.manager.save(ExecutionOrderItemUsage, usage);

      this.logger.log(
        `[inv-reconciliation] Consumo rechazado: inventoryRequestId=${input.inventoryRequestId} reasonCode=${input.reasonCode}`,
      );
    });
  }

  /**
   * Computa el estado de reconciliación de inventario para una OT.
   *
   * ADR-068: el cierre técnico puede quedar "pendiente de conciliación
   * de inventario", sin bloquear el resultado.
   *
   * Reglas:
   * - Sin usages → NOT_REQUIRED
   * - Todos CONFIRMED → CONFIRMED
   * - Al menos un REJECTED → DIVERGED
   * - Todos PENDING o mixto CONFIRMED+PENDING → PENDING
   */
  computeInventoryReconciliation(
    usages: Array<{ movementStatus: 'PENDING' | 'CONFIRMED' | 'REJECTED' | null }>,
  ): 'NOT_REQUIRED' | 'PENDING' | 'CONFIRMED' | 'DIVERGED' {
    if (usages.length === 0) {
      return 'NOT_REQUIRED';
    }

    const hasRejected = usages.some((u) => u.movementStatus === 'REJECTED');
    if (hasRejected) {
      return 'DIVERGED';
    }

    const allConfirmed = usages.every((u) => u.movementStatus === 'CONFIRMED');
    if (allConfirmed) {
      return 'CONFIRMED';
    }

    // Mixto: algunos PENDING, algunos CONFIRMED (o todos PENDING)
    return 'PENDING';
  }

  /**
   * Obtiene el estado de reconciliación de inventario para una OT
   * consultando los ExecutionOrderItemUsage asociados.
   */
  async getInventoryReconciliation(
    executionOrderId: string,
  ): Promise<'NOT_REQUIRED' | 'PENDING' | 'CONFIRMED' | 'DIVERGED'> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const usages = await qr.manager
        .createQueryBuilder(ExecutionOrderItemUsage, 'usage')
        .select(['usage.movementStatus'])
        .where('usage.executionOrderId = :executionOrderId', {
          executionOrderId,
        })
        .andWhere('usage.tenantId = :tenantId', { tenantId })
        .getMany();

      return this.computeInventoryReconciliation(usages);
    });
  }
}
