import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import { runInTenantSchema } from '@iwana/db';
import { CatalogItemType, CustomerSegment } from '@iwana/shared';
import { CatalogItem } from '../entities/catalog-item.entity';
import { PlanDetail } from '../entities/plan-detail.entity';
import { CatalogPriceHistory } from '../entities/catalog-price-history.entity';
import {
  CommercialCatalogItem,
  CommercialCatalogReadPort,
  CommercialItemSnapshot,
} from './commercial-catalog-read.port';

/**
 * Adaptador real del puerto CommercialCatalogReadPort.
 * Lee directamente de las tablas del módulo comercial dentro del schema del tenant.
 *
 * Registrado en CommercialModule y exportado para consumo por CrmModule.
 */
@Injectable()
export class CommercialCatalogReadAdapter extends CommercialCatalogReadPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  async getActivePlans(tenantId: string, schemaName: string): Promise<CommercialCatalogItem[]> {
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const items = await qr.manager.find(CatalogItem, {
        where: { tenantId, type: CatalogItemType.PLAN, isActive: true, deletedAt: IsNull() },
        order: { name: 'ASC' },
      });

      const itemIds = items.map((item) => item.id);
      const priceMap = new Map<string, string>();
      const installationMap = new Map<string, string>();
      const detailMap = new Map<string, PlanDetail>();

      if (itemIds.length) {
        const priceRows = await qr.manager
          .createQueryBuilder(CatalogPriceHistory, 'ph')
          .where('ph.item_id = ANY(:ids)', { ids: itemIds })
          .andWhere('ph.customer_segment = :seg', { seg: CustomerSegment.RESIDENTIAL })
          .andWhere('ph.is_current = true')
          .getMany();

        for (const row of priceRows) {
          priceMap.set(row.itemId, row.basePrice);
          installationMap.set(row.itemId, row.installationFee);
        }

        const planDetails = await qr.manager
          .createQueryBuilder(PlanDetail, 'pd')
          .where('pd.item_id = ANY(:ids)', { ids: itemIds })
          .getMany();

        for (const detail of planDetails) {
          detailMap.set(detail.itemId, detail);
        }
      }

      return items.map((item) => ({
        id: item.id,
        name: item.name,
        technology: detailMap.get(item.id)?.technology ?? 'N/A',
        downloadSpeedMbps: detailMap.get(item.id)?.downloadSpeedMbps ?? 0,
        uploadSpeedMbps: detailMap.get(item.id)?.uploadSpeedMbps ?? 0,
        isActive: item.isActive,
        basePrice: priceMap.has(item.id) ? parseFloat(priceMap.get(item.id)!) : 0,
        installationFee: installationMap.has(item.id)
          ? parseFloat(installationMap.get(item.id)!)
          : 0,
      }));
    });
  }

  async createSnapshot(
    tenantId: string,
    schemaName: string,
    itemId: string,
    segment: CustomerSegment = CustomerSegment.RESIDENTIAL,
  ): Promise<CommercialItemSnapshot> {
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const item = await qr.manager.findOne(CatalogItem, {
        where: { id: itemId, tenantId, isActive: true, deletedAt: IsNull() },
      });
      if (!item) throw new NotFoundException(`Ítem de catálogo ${itemId} no encontrado o inactivo`);

      const price = await qr.manager.findOne(CatalogPriceHistory, {
        where: { itemId, customerSegment: segment, isCurrent: true },
      });
      if (!price) {
        throw new NotFoundException(
          `No hay precio vigente para ítem ${itemId} en segmento ${segment}`,
        );
      }

      const detail = await qr.manager.findOne(PlanDetail, { where: { itemId } });

      return {
        planId: item.id,
        name: item.name,
        downloadSpeed: detail?.downloadSpeedMbps ?? 0,
        uploadSpeed: detail?.uploadSpeedMbps ?? 0,
        monthlyPrice: parseFloat(price.basePrice),
        installationFee: parseFloat(price.installationFee),
        technology: detail?.technology ?? 'N/A',
        snapshotAt: new Date(),
      };
    });
  }
}
