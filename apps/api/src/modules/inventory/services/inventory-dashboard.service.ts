import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  InventoryItem,
  SerializedAsset,
  StockBalance,
  StockLocation,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';

@Injectable()
export class InventoryDashboardService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getSummary() {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const [itemsCount, locationsCount, serializedAssetsCount, balances] = await Promise.all([
        qr.manager.count(InventoryItem, { where: { tenantId } }),
        qr.manager.count(StockLocation, { where: { tenantId } }),
        qr.manager.count(SerializedAsset, { where: { tenantId } }),
        qr.manager.find(StockBalance, { where: { tenantId } }),
      ]);

      const totalOnHand = balances.reduce(
        (sum, balance) => sum + Number.parseFloat(balance.quantityOnHand),
        0,
      );

      return {
        itemsCount,
        locationsCount,
        serializedAssetsCount,
        balancesCount: balances.length,
        totalOnHand,
      };
    });
  }
}
