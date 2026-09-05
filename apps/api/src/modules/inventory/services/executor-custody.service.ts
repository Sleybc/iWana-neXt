import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, QueryRunner } from 'typeorm';
import {
  SerializedAsset,
  StockBalance,
  StockLocation,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import {
  StockLocationStatus,
  StockLocationType,
  type ExecutorCustodyResponse,
  type ListMeta,
  type SerializedAssetRecord,
  type StockBalanceRecord,
} from '@iwana/shared';
import { ListExecutorCustodyQueryInput, ListExecutorCustodyQuerySchema } from '../dto';
import { clampPage } from '../../../common/pagination/clamp-page';

/** Tamaño de página por defecto del endpoint agregado de custodia (contrato v1). */
export const EXECUTOR_CUSTODY_DEFAULT_LIMIT = 25;

const MOBILE_CUSTODY_TYPES = [StockLocationType.MOBILE_TECHNICIAN, StockLocationType.MOBILE_CREW];

/**
 * Endpoint agregado de solo lectura: custodia activa del ejecutor (MOD12).
 *
 * Resuelve la bodega móvil ACTIVE del responsable mediante el índice único
 * parcial `uq_stock_locations_active_mobile_responsible` (tenantId +
 * responsibleRefId con predicado tipo móvil + status ACTIVE), y en paralelo
 * consulta `serialized_assets` por `currentLocationId` y `stock_balances` por
 * `locationId` (con disponible > 0). Sin custodia activa responde
 * `location: null` con colecciones vacías (estado normal, no error).
 */
@Injectable()
export class ExecutorCustodyService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getCustody(query: ListExecutorCustodyQueryInput): Promise<ExecutorCustodyResponse> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = ListExecutorCustodyQuerySchema.parse(query);
    const { page, limit } = clampPage(validated.page, validated.limit);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      // La consulta usa el índice único parcial (tenantId, responsibleRefId)
      // cuyo predicado coincide con los filtros tipo móvil + status ACTIVE.
      const location = await qr.manager.findOne(StockLocation, {
        where: {
          tenantId,
          responsibleRefId: validated.responsibleRefId,
          type: In(MOBILE_CUSTODY_TYPES),
          status: StockLocationStatus.ACTIVE,
        },
      });

      if (!location?.responsibleRefId) {
        return this.emptyCustody(page, limit);
      }

      const offset = (page - 1) * limit;
      const [assets, assetsTotal, balancesPage] = await Promise.all([
        qr.manager.find(SerializedAsset, {
          where: { tenantId, currentLocationId: location.id },
          order: { updatedAt: 'DESC', id: 'DESC' },
          skip: offset,
          take: limit,
        }),
        qr.manager.count(SerializedAsset, {
          where: { tenantId, currentLocationId: location.id },
        }),
        this.listBalancesPage(qr, tenantId, location.id, offset, limit),
      ]);

      return {
        location: {
          id: location.id,
          name: location.name,
          type:
            location.type === StockLocationType.MOBILE_CREW
              ? StockLocationType.MOBILE_CREW
              : StockLocationType.MOBILE_TECHNICIAN,
          responsibleType: location.type === StockLocationType.MOBILE_CREW ? 'CREW' : 'TECHNICIAN',
          responsibleRefId: location.responsibleRefId,
        },
        assets: {
          items: assets.map((asset) => this.toAssetRecord(asset)),
          meta: this.buildMeta(assetsTotal, page, limit),
        },
        balances: {
          items: balancesPage.rows.map((balance) => this.toBalanceRecord(balance)),
          meta: this.buildMeta(balancesPage.total, page, limit),
        },
      };
    });
  }

  /**
   * Página de balances de la custodia con stock disponible:
   * (on_hand − reserved) > 0, sin filtrar por condición NEW/REFURBISHED/DAMAGED.
   */
  private async listBalancesPage(
    qr: QueryRunner,
    tenantId: string,
    locationId: string,
    offset: number,
    limit: number,
  ): Promise<{ rows: StockBalance[]; total: number }> {
    const qb = qr.manager
      .createQueryBuilder(StockBalance, 'balance')
      .where('balance.tenant_id = :tenantId', { tenantId })
      .andWhere('balance.location_id = :locationId', { locationId })
      .andWhere('balance.quantity_on_hand::numeric - balance.quantity_reserved::numeric > 0');

    const total = await qb.clone().getCount();

    const rows = await qb
      .orderBy('balance.updated_at', 'DESC')
      .addOrderBy('balance.id', 'DESC')
      .skip(offset)
      .take(limit)
      .getMany();

    return { rows, total };
  }

  private emptyCustody(page: number, limit: number): ExecutorCustodyResponse {
    return {
      location: null,
      assets: { items: [], meta: this.buildMeta(0, page, limit) },
      balances: { items: [], meta: this.buildMeta(0, page, limit) },
    };
  }

  private buildMeta(total: number, page: number, limit: number): ListMeta {
    const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
    return {
      nextCursor: null,
      total,
      totalIsEstimate: false,
      page,
      limit,
      totalPages,
      hasMore: page < totalPages,
      mode: 'page',
      capabilities: { randomAccess: true, sortableFields: [] },
      sort: null,
    };
  }

  private toAssetRecord(asset: SerializedAsset): SerializedAssetRecord {
    return {
      id: asset.id,
      tenantId: asset.tenantId,
      inventoryItemId: asset.inventoryItemId,
      serialNumber: asset.serialNumber,
      normalizedSerialNumber: asset.normalizedSerialNumber,
      macAddress: asset.macAddress,
      normalizedMacAddress: asset.normalizedMacAddress,
      assetTag: asset.assetTag,
      currentStatus: asset.currentStatus,
      currentLocationId: asset.currentLocationId,
      currentResponsibleType: asset.currentResponsibleType,
      currentResponsibleRefId: asset.currentResponsibleRefId,
      subscriberRefId: asset.subscriberRefId,
      contractRefId: asset.contractRefId,
      purchaseOrderRef: asset.purchaseOrderRef,
      purchaseDate: asset.purchaseDate,
      usefulLifeMonths: asset.usefulLifeMonths,
      warrantyUntil: asset.warrantyUntil,
      createdAt: asset.createdAt.toISOString(),
      updatedAt: asset.updatedAt.toISOString(),
    };
  }

  private toBalanceRecord(balance: StockBalance): StockBalanceRecord {
    return {
      id: balance.id,
      tenantId: balance.tenantId,
      itemId: balance.itemId,
      locationId: balance.locationId,
      lotId: balance.lotId,
      condition: balance.condition,
      quantityOnHand: balance.quantityOnHand,
      quantityReserved: balance.quantityReserved,
      createdAt: balance.createdAt.toISOString(),
      updatedAt: balance.updatedAt.toISOString(),
    };
  }
}
