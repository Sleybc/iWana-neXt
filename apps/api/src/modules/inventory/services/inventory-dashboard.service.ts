import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  InventoryCategory,
  InventoryItem,
  SerializedAsset,
  StockBalance,
  StockLocation,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import { resolveValuationUnitCost } from './inventory-costing.service';

function resolveUnitCost(item: InventoryItem): number {
  return resolveValuationUnitCost(item);
}

@Injectable()
export class InventoryDashboardService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getSummary() {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const [items, locations, assets, balances, categories] = await Promise.all([
        qr.manager.find(InventoryItem, { where: { tenantId } }),
        qr.manager.find(StockLocation, { where: { tenantId } }),
        qr.manager.find(SerializedAsset, { where: { tenantId } }),
        qr.manager.find(StockBalance, { where: { tenantId } }),
        qr.manager.find(InventoryCategory, { where: { tenantId } }),
      ]);

      const itemsCount = items.length;
      const locationsCount = locations.length;
      const serializedAssetsCount = assets.length;

      const totalOnHand = balances.reduce(
        (sum, balance) => sum + Number.parseFloat(balance.quantityOnHand),
        0,
      );

      const locationMap = new Map(locations.map((location) => [location.id, location]));
      const categoryMap = new Map(categories.map((category) => [category.id, category]));
      const itemMap = new Map(items.map((item) => [item.id, item]));

      let estimatedTotalValue = 0;
      for (const balance of balances) {
        const item = itemMap.get(balance.itemId);
        if (!item) {
          continue;
        }

        estimatedTotalValue += Number.parseFloat(balance.quantityOnHand) * resolveUnitCost(item);
      }

      const balancesByLocation = Array.from(
        balances
          .reduce(
            (groups, balance) => {
              const location = locationMap.get(balance.locationId);
              if (!location) {
                return groups;
              }

              const current = groups.get(balance.locationId) ?? {
                locationId: location.id,
                locationCode: location.code,
                locationName: location.name,
                totalOnHand: 0,
                itemIds: new Set<string>(),
              };

              current.totalOnHand += Number.parseFloat(balance.quantityOnHand);
              current.itemIds.add(balance.itemId);
              groups.set(balance.locationId, current);
              return groups;
            },
            new Map<
              string,
              {
                locationId: string;
                locationCode: string;
                locationName: string;
                totalOnHand: number;
                itemIds: Set<string>;
              }
            >(),
          )
          .values(),
      )
        .map((entry) => ({
          locationId: entry.locationId,
          locationCode: entry.locationCode,
          locationName: entry.locationName,
          totalOnHand: entry.totalOnHand,
          uniqueItems: entry.itemIds.size,
        }))
        .sort((left, right) => right.totalOnHand - left.totalOnHand);

      const balancesByCategory = Array.from(
        balances
          .reduce(
            (groups, balance) => {
              const item = itemMap.get(balance.itemId);
              if (!item) {
                return groups;
              }

              const category = categoryMap.get(item.categoryId);
              if (!category) {
                return groups;
              }

              const onHand = Number.parseFloat(balance.quantityOnHand);
              const current = groups.get(category.id) ?? {
                categoryId: category.id,
                categoryCodePrefix: category.codePrefix,
                categoryName: category.name,
                totalOnHand: 0,
                estimatedValue: 0,
                itemIds: new Set<string>(),
              };

              current.totalOnHand += onHand;
              current.estimatedValue += onHand * resolveUnitCost(item);
              current.itemIds.add(balance.itemId);
              groups.set(category.id, current);
              return groups;
            },
            new Map<
              string,
              {
                categoryId: string;
                categoryCodePrefix: string;
                categoryName: string;
                totalOnHand: number;
                estimatedValue: number;
                itemIds: Set<string>;
              }
            >(),
          )
          .values(),
      )
        .map((entry) => ({
          categoryId: entry.categoryId,
          categoryCodePrefix: entry.categoryCodePrefix,
          categoryName: entry.categoryName,
          totalOnHand: entry.totalOnHand,
          estimatedValue: entry.estimatedValue,
          uniqueItems: entry.itemIds.size,
        }))
        .sort((left, right) => right.totalOnHand - left.totalOnHand);

      const serializedAssetsByStatus = Array.from(
        assets.reduce((groups, asset) => {
          groups.set(asset.currentStatus, (groups.get(asset.currentStatus) ?? 0) + 1);
          return groups;
        }, new Map<string, number>()),
      )
        .map(([status, count]) => ({ status, count }))
        .sort((left, right) => right.count - left.count);

      const serializedAssetsByResponsibleType = Array.from(
        assets.reduce((groups, asset) => {
          groups.set(
            asset.currentResponsibleType,
            (groups.get(asset.currentResponsibleType) ?? 0) + 1,
          );
          return groups;
        }, new Map<string, number>()),
      )
        .map(([responsibleType, count]) => ({ responsibleType, count }))
        .sort((left, right) => right.count - left.count);

      return {
        itemsCount,
        locationsCount,
        serializedAssetsCount,
        balancesCount: balances.length,
        totalOnHand,
        estimatedTotalValue,
        balancesByLocation,
        balancesByCategory,
        serializedAssetsByStatus,
        serializedAssetsByResponsibleType,
      };
    });
  }
}
