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
  PurchaseRfq,
  PurchaseRfqInvitation,
  SerializedAsset,
  StockBalance,
  StockLocation,
  StockLot,
  StockIssue,
  StockIssueLine,
  StockMovement,
  StockMovementLine,
  SupplierProfile,
  SupplierQuote,
} from '@iwana/db';
import { PartiesModule } from '../parties/parties.module';
import { CommercialModule } from '../commercial/commercial.module';
import {
  INVENTORY_MOVEMENT_PORT,
  InventoryMovementPortAdapter,
} from './ports/inventory-movement.port';
import {
  CommercialProductReferencePort,
  CommercialProductReferencePortAdapter,
} from './ports/commercial-product-reference.port';
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
import { CounterPurchaseService } from './services/counter-purchase.service';
import { RfqPdfService } from './services/rfq-pdf.service';
import { RfqService } from './services/rfq.service';
import { StockLocationService } from './services/stock-location.service';
import { SupplierProfileService } from './services/supplier-profile.service';

@Module({
  imports: [
    PartiesModule,
    CommercialModule,
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
      PurchaseRfq,
      PurchaseRfqInvitation,
      PurchaseOrder,
      PurchaseOrderLine,
      GoodsReceipt,
      GoodsReceiptLine,
      AssetLifecycleEvent,
      AssetLoanAssignment,
      InventoryWriteOff,
      SupplierProfile,
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
    CounterPurchaseService,
    RfqService,
    RfqPdfService,
    AssetLifecycleService,
    InventoryDashboardService,
    SupplierProfileService,
    InventoryMovementPortAdapter,
    CommercialProductReferencePortAdapter,
    SupplierPartyPortAdapter,
    {
      provide: INVENTORY_MOVEMENT_PORT,
      useExisting: InventoryMovementPortAdapter,
    },
    {
      provide: CommercialProductReferencePort,
      useExisting: CommercialProductReferencePortAdapter,
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
    CounterPurchaseService,
    AssetLifecycleService,
    InventoryDashboardService,
    SupplierProfileService,
    InventoryMovementPortAdapter,
    CommercialProductReferencePortAdapter,
    SupplierPartyPortAdapter,
    INVENTORY_MOVEMENT_PORT,
    CommercialProductReferencePort,
    SupplierPartyPort,
  ],
})
export class InventoryModule {}
