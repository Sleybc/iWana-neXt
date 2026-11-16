import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { AssetLoanAssignment, TenantContext, runInTenantSchema } from '@iwana/db';
import type { SubscriberEquipmentResponse } from '@iwana/shared';
import { buildPageMeta } from '../../../common/pagination/build-page-meta';
import { clampPage } from '../../../common/pagination/clamp-page';
import {
  GetSubscriberEquipmentQueryInput,
  GetSubscriberEquipmentQuerySchema,
  ListLoansQueryInput,
  ListLoansQuerySchema,
} from '../dto';
import { AssetLoanRecord } from '../types/serialized-asset-detail.types';
import {
  loadSubscriberEquipment,
  loadSubscriberHistory,
  loadSubscriberMaterials,
} from './subscriber-equipment.queries';

export interface OpenLoanWithManagerInput {
  tenantId: string;
  serializedAssetId: string;
  subscriberRefId: string;
  contractRefId?: string | null;
  installedAt: Date;
  executionOrderRefId?: string | null;
  stockMovementId: string;
}

export interface CloseOpenLoanWithManagerInput {
  tenantId: string;
  serializedAssetId: string;
  removedAt: Date;
}

export interface CloseLoanForMovementWithManagerInput {
  tenantId: string;
  serializedAssetId: string;
  stockMovementId: string;
  removedAt: Date;
}

@Injectable()
export class AssetLoanService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async openLoanWithManager(
    manager: EntityManager,
    input: OpenLoanWithManagerInput,
  ): Promise<AssetLoanAssignment> {
    const existing = await manager.findOne(AssetLoanAssignment, {
      where: {
        tenantId: input.tenantId,
        stockMovementId: input.stockMovementId,
      },
    });

    if (existing) {
      return existing;
    }

    return manager.save(
      AssetLoanAssignment,
      manager.create(AssetLoanAssignment, {
        tenantId: input.tenantId,
        serializedAssetId: input.serializedAssetId,
        subscriberRefId: input.subscriberRefId,
        contractRefId: input.contractRefId ?? null,
        installedAt: input.installedAt,
        removedAt: null,
        executionOrderRefId: input.executionOrderRefId ?? null,
        stockMovementId: input.stockMovementId,
      }),
    );
  }

  async closeOpenLoanWithManager(
    manager: EntityManager,
    input: CloseOpenLoanWithManagerInput,
  ): Promise<AssetLoanAssignment | null> {
    const openLoan = await manager.findOne(AssetLoanAssignment, {
      where: {
        tenantId: input.tenantId,
        serializedAssetId: input.serializedAssetId,
        removedAt: IsNull(),
      },
    });

    if (!openLoan) {
      return null;
    }

    openLoan.removedAt = input.removedAt;
    return manager.save(AssetLoanAssignment, openLoan);
  }

  /** Cierra exclusivamente el comodato creado por el movimiento especificado. */
  async closeLoanForMovementWithManager(
    manager: EntityManager,
    input: CloseLoanForMovementWithManagerInput,
  ): Promise<AssetLoanAssignment | null> {
    const loan = await manager.findOne(AssetLoanAssignment, {
      where: {
        tenantId: input.tenantId,
        serializedAssetId: input.serializedAssetId,
        stockMovementId: input.stockMovementId,
        removedAt: IsNull(),
      },
      lock: { mode: 'pessimistic_write' },
    });

    if (!loan) return null;

    loan.removedAt = input.removedAt;
    return manager.save(AssetLoanAssignment, loan);
  }

  toRecord(loan: AssetLoanAssignment): AssetLoanRecord {
    return {
      id: loan.id,
      serializedAssetId: loan.serializedAssetId,
      subscriberRefId: loan.subscriberRefId,
      contractRefId: loan.contractRefId,
      installedAt: loan.installedAt,
      removedAt: loan.removedAt,
      executionOrderRefId: loan.executionOrderRefId,
      stockMovementId: loan.stockMovementId,
      status: loan.removedAt === null ? 'abierto' : 'cerrado',
    };
  }

  async listForAsset(
    manager: EntityManager,
    tenantId: string,
    serializedAssetId: string,
  ): Promise<{ data: AssetLoanRecord[]; total: number }> {
    const [loans, total] = await manager.findAndCount(AssetLoanAssignment, {
      where: { tenantId, serializedAssetId },
      order: { installedAt: 'DESC' },
    });

    return {
      data: loans.map((loan) => this.toRecord(loan)),
      total,
    };
  }

  /**
   * Devuelve solo los contratos seleccionados que conservan un comodato abierto.
   * Tenant y schema se obtienen del contexto autenticado del request.
   */
  async findOpenContractIds(contractIds: string[]): Promise<string[]> {
    if (contractIds.length === 0) {
      return [];
    }

    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const rows = await qr.manager
        .createQueryBuilder(AssetLoanAssignment, 'loan')
        .select('loan.contractRefId', 'contractId')
        .where('loan.tenantId = :tenantId', { tenantId })
        .andWhere('loan.removedAt IS NULL')
        .andWhere('loan.contractRefId IN (:...contractIds)', { contractIds })
        .distinct(true)
        .getRawMany<{ contractId: string }>();

      return rows.map(({ contractId }) => contractId);
    });
  }

  async list(
    query: ListLoansQueryInput,
  ): Promise<{ data: AssetLoanRecord[]; total: number; page: number; limit: number }> {
    const validated = ListLoansQuerySchema.parse(query);
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const { status, subscriberRefId, contractRefId, serializedAssetId } = validated;
    const { page, limit } = clampPage(validated.page, validated.limit);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(AssetLoanAssignment, 'loan')
        .where('loan.tenant_id = :tenantId', { tenantId });

      if (status === 'abierto') {
        qb.andWhere('loan.removed_at IS NULL');
      } else if (status === 'cerrado') {
        qb.andWhere('loan.removed_at IS NOT NULL');
      }

      if (subscriberRefId) {
        qb.andWhere('loan.subscriber_ref_id = :subscriberRefId', { subscriberRefId });
      }

      if (contractRefId) {
        qb.andWhere('loan.contract_ref_id = :contractRefId', { contractRefId });
      }

      if (serializedAssetId) {
        qb.andWhere('loan.serialized_asset_id = :serializedAssetId', { serializedAssetId });
      }

      qb.orderBy('loan.installed_at', 'DESC').addOrderBy('loan.id', 'DESC');

      const total = await qb.getCount();
      const loans = await qb
        .skip((page - 1) * limit)
        .take(limit)
        .getMany();

      return {
        data: loans.map((loan) => this.toRecord(loan)),
        total,
        page,
        limit,
      };
    });
  }

  /**
   * Lectura por suscriptor (contrato A1 v1.0, spec 2026-11-16 §2.1): comodatos con
   * datos del equipo, materiales del sitio del cliente e historial recortado por
   * periodo de comodato. Tenant y schema salen solo del `TenantContext`; otro
   * tenant o un suscriptor sin datos responde con colecciones vacías, igual.
   *
   * Un control previo (p. ej. bloqueo de datos) se añadiría antes de
   * `runInTenantSchema`, sin tocar las consultas.
   */
  async getSubscriberEquipment(
    subscriberRefId: string,
    query: GetSubscriberEquipmentQueryInput,
  ): Promise<SubscriberEquipmentResponse> {
    const validated = GetSubscriberEquipmentQuerySchema.parse(query);
    const materialsPage = clampPage(validated.materialsPage, validated.materialsLimit);
    const historyPage = clampPage(validated.historyPage, validated.historyLimit);
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      // Secuencial: las tres consultas comparten la conexión de la transacción.
      const equipment = await loadSubscriberEquipment(qr, tenantId, subscriberRefId);
      const materials = await loadSubscriberMaterials(
        qr,
        tenantId,
        subscriberRefId,
        materialsPage.page,
        materialsPage.limit,
      );
      const history = await loadSubscriberHistory(
        qr,
        tenantId,
        subscriberRefId,
        historyPage.page,
        historyPage.limit,
        validated.historyAssetId,
      );

      return {
        equipment,
        materials: {
          items: materials.items,
          meta: buildPageMeta({ total: materials.total, ...materialsPage }),
        },
        history: {
          items: history.items,
          meta: buildPageMeta({ total: history.total, ...historyPage }),
        },
      };
    });
  }
}
