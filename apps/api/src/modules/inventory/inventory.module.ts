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
  StockCount,
  StockCountLine,
  StockMovement,
  StockMovementLine,
  SupplierProfile,
  SupplierQuote,
  SupplierQuoteLine,
} from '@iwana/db';
import { PartiesModule } from '../parties/parties.module';
import { CommercialModule } from '../commercial/commercial.module';
import { TenantModule } from '../tenant/tenant.module';
import {
  INVENTORY_MOVEMENT_PORT,
  InventoryMovementPortAdapter,
} from './ports/inventory-movement.port';
import {
  CommercialProductReferencePort,
  CommercialProductReferencePortAdapter,
} from './ports/commercial-product-reference.port';
import { SupplierPartyPort, SupplierPartyPortAdapter } from './ports/supplier-party.port';
import { TenantContactPort } from './ports/tenant-contact.port';
import { TenantContactPortAdapter } from './ports/tenant-contact.adapter';
import { InventoryController } from './inventory.controller';
import { PurchasingController } from './purchasing.controller';
import { AssetLifecycleService } from './services/asset-lifecycle.service';
import { CustomerSiteLocationResolver } from './services/customer-site-location.resolver';
import { GoodsReceiptService } from './services/goods-receipt.service';
import { InventoryCategoryService } from './services/inventory-category.service';
import { InventoryDashboardService } from './services/inventory-dashboard.service';
import { InventoryItemService } from './services/inventory-item.service';
import { ReplenishmentService } from './services/replenishment.service';
import { PurchasingPolicyService } from './services/purchasing-policy.service';
import { PurchasingQueryService } from './services/purchasing-query.service';
import { PurchasingService } from './services/purchasing.service';
import { SerializedAssetService } from './services/serialized-asset.service';
import { StockBalanceService } from './services/stock-balance.service';
import { StockLedgerService } from './services/stock-ledger.service';
import { StockMovementQueryService } from './services/stock-movement-query.service';
import { StockIssueService } from './services/stock-issue.service';
import { CycleCountService } from './services/cycle-count.service';
import { CounterPurchaseService } from './services/counter-purchase.service';
import { RfqPdfService } from './services/rfq-pdf.service';
import { RfqService } from './services/rfq.service';
import { StockLocationService } from './services/stock-location.service';
import { SupplierProfileService } from './services/supplier-profile.service';

@Module({
  imports: [
    PartiesModule,
    CommercialModule,
    TenantModule,
    TypeOrmModule.forFeature([
      InventoryItem,
      InventoryCategory,
      StockLocation,
      StockBalance,
      StockLot,
      SerializedAsset,
      StockIssue,
      StockIssueLine,
      StockCount,
      StockCountLine,
      StockMovement,
      StockMovementLine,
      PurchaseRequest,
      PurchaseRequestLine,
      PurchaseRequestLineAward,
      SupplierQuote,
      SupplierQuoteLine,
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
    StockMovementQueryService,
    StockIssueService,
    CycleCountService,
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
    ReplenishmentService,
    SupplierProfileService,
    InventoryMovementPortAdapter,
    CommercialProductReferencePortAdapter,
    SupplierPartyPortAdapter,
    TenantContactPortAdapter,
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
    {
      provide: TenantContactPort,
      useExisting: TenantContactPortAdapter,
    },
  ],
  exports: [
    InventoryItemService,
    InventoryCategoryService,
    StockLocationService,
    CustomerSiteLocationResolver,
    StockLedgerService,
    StockIssueService,
    CycleCountService,
    StockBalanceService,
    SerializedAssetService,
    PurchasingPolicyService,
    PurchasingQueryService,
    PurchasingService,
    GoodsReceiptService,
    CounterPurchaseService,
    AssetLifecycleService,
    InventoryDashboardService,
    ReplenishmentService,
    SupplierProfileService,
    InventoryMovementPortAdapter,
    CommercialProductReferencePortAdapter,
    SupplierPartyPortAdapter,
    TenantContactPortAdapter,
    INVENTORY_MOVEMENT_PORT,
    CommercialProductReferencePort,
    SupplierPartyPort,
    TenantContactPort,
  ],
})
export class InventoryModule {}
