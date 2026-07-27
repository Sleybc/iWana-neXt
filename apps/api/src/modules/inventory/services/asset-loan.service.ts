import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { AssetLoanAssignment, TenantContext, runInTenantSchema } from '@iwana/db';
import { clampPage } from '../../../common/pagination/clamp-page';
import { ListLoansQueryInput, ListLoansQuerySchema } from '../dto';
import { AssetLoanRecord } from '../types/serialized-asset-detail.types';

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
}
