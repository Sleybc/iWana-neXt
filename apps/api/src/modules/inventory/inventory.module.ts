import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AssetLifecycleEvent,
  AssetLoanAssignment,
  GoodsReceipt,
  GoodsReceiptLine,
  InventoryItem,
  InventoryCategory,
  InventoryWriteOff,
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseRequest,
  PurchaseRequestLine,
  PurchaseRequestLineAward,
  SerializedAsset,
  StockBalance,
  StockLocation,
  StockLot,
  StockIssue,
  StockIssueLine,
  StockMovement,
  StockMovementLine,
  SupplierQuote,
} from '@iwana/db';
import { PartiesModule } from '../parties/parties.module';
import {
  INVENTORY_MOVEMENT_PORT,
  InventoryMovementPortAdapter,
} from './ports/inventory-movement.port';
import { SupplierPartyPort, SupplierPartyPortAdapter } from './ports/supplier-party.port';
import { InventoryController } from './inventory.controller';
import { PurchasingController } from './purchasing.controller';
import { AssetLifecycleService } from './services/asset-lifecycle.service';
import { CustomerSiteLocationResolver } from './services/customer-site-location.resolver';
import { GoodsReceiptService } from './services/goods-receipt.service';
import { InventoryCategoryService } from './services/inventory-category.service';
import { InventoryDashboardService } from './services/inventory-dashboard.service';
import { InventoryItemService } from './services/inventory-item.service';
import { PurchasingPolicyService } from './services/purchasing-policy.service';
import { PurchasingQueryService } from './services/purchasing-query.service';
import { PurchasingService } from './services/purchasing.service';
import { SerializedAssetService } from './services/serialized-asset.service';
import { StockBalanceService } from './services/stock-balance.service';
import { StockLedgerService } from './services/stock-ledger.service';
import { StockIssueService } from './services/stock-issue.service';
import { StockLocationService } from './services/stock-location.service';

@Module({
  imports: [
    PartiesModule,
    TypeOrmModule.forFeature([
      InventoryItem,
      InventoryCategory,
      StockLocation,
      StockBalance,
      StockLot,
      SerializedAsset,
      StockIssue,
      StockIssueLine,
      StockMovement,
      StockMovementLine,
      PurchaseRequest,
      PurchaseRequestLine,
      PurchaseRequestLineAward,
      SupplierQuote,
      PurchaseOrder,
      PurchaseOrderLine,
      GoodsReceipt,
      GoodsReceiptLine,
      AssetLifecycleEvent,
      AssetLoanAssignment,
      InventoryWriteOff,
    ]),
  ],
  controllers: [InventoryController, PurchasingController],
  providers: [
    InventoryItemService,
    InventoryCategoryService,
    StockLocationService,
    CustomerSiteLocationResolver,
    StockLedgerService,
    StockIssueService,
    StockBalanceService,
    SerializedAssetService,
    PurchasingPolicyService,
    PurchasingQueryService,
    PurchasingService,
    GoodsReceiptService,
    AssetLifecycleService,
    InventoryDashboardService,
    InventoryMovementPortAdapter,
    SupplierPartyPortAdapter,
    {
      provide: INVENTORY_MOVEMENT_PORT,
      useExisting: InventoryMovementPortAdapter,
    },
    {
      provide: SupplierPartyPort,
      useExisting: SupplierPartyPortAdapter,
    },
  ],
  exports: [
    InventoryItemService,
    InventoryCategoryService,
    StockLocationService,
    CustomerSiteLocationResolver,
    StockLedgerService,
    StockIssueService,
    StockBalanceService,
    SerializedAssetService,
    PurchasingPolicyService,
    PurchasingQueryService,
    PurchasingService,
    GoodsReceiptService,
    AssetLifecycleService,
    InventoryDashboardService,
    InventoryMovementPortAdapter,
    SupplierPartyPortAdapter,
    INVENTORY_MOVEMENT_PORT,
    SupplierPartyPort,
  ],
})
export class InventoryModule {}
