import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { IPartyReadPort } from '../../parties/ports/party-read.port';
import { IPartyWritePort } from '../../parties/ports/party-write.port';
import { CommercialCatalogReadPort } from '../../commercial/ports/commercial-catalog-read.port';

jest.mock('../../tenant/tenant.module', () => ({
  TenantModule: class TenantModule {},
}));

import { InventoryModule } from '../inventory.module';
import { InventoryController } from '../inventory.controller';
import { SupplierPartyPort, SupplierPartyPortAdapter } from '../ports/supplier-party.port';
import { TenantContactPort } from '../ports/tenant-contact.port';
import { TenantContactPortAdapter } from '../ports/tenant-contact.adapter';
import { PurchasingController } from '../purchasing.controller';
import { TenantService } from '../../tenant/tenant.service';
import {
  CommercialProductReferencePort,
  CommercialProductReferencePortAdapter,
} from '../ports/commercial-product-reference.port';
import {
  INVENTORY_MOVEMENT_PORT,
  InventoryMovementPortAdapter,
} from '../ports/inventory-movement.port';
import { AssetLifecycleService } from '../services/asset-lifecycle.service';
import { GoodsReceiptService } from '../services/goods-receipt.service';
import { CounterPurchaseService } from '../services/counter-purchase.service';
import { RfqPdfService } from '../services/rfq-pdf.service';
import { RfqService } from '../services/rfq.service';
import { InventoryDashboardService } from '../services/inventory-dashboard.service';
import { ReplenishmentService } from '../services/replenishment.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InventoryCategoryService } from '../services/inventory-category.service';
import { InventoryItemService } from '../services/inventory-item.service';
import { PurchasingPolicyService } from '../services/purchasing-policy.service';
import { PurchasingQueryService } from '../services/purchasing-query.service';
import { PurchasingService } from '../services/purchasing.service';
import { SupplierProfileService } from '../services/supplier-profile.service';
import { SerializedAssetService } from '../services/serialized-asset.service';
import { StockBalanceService } from '../services/stock-balance.service';
import { StockIssueService } from '../services/stock-issue.service';
import { StockLedgerService } from '../services/stock-ledger.service';
import { StockMovementQueryService } from '../services/stock-movement-query.service';
import { StockLocationService } from '../services/stock-location.service';

describe('InventoryModule', () => {
  it('should compile the inventory module', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [InventoryController, PurchasingController],
      providers: [
        InventoryModule,
        {
          provide: getDataSourceToken(),
          useValue: {
            getRepository: jest.fn(),
            createEntityManager: jest.fn(),
          },
        },
        InventoryItemService,
        InventoryCategoryService,
        StockLocationService,
        StockLedgerService,
        StockMovementQueryService,
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
        SupplierProfileService,
        AssetLifecycleService,
        InventoryDashboardService,
        ReplenishmentService,
        InventoryMovementPortAdapter,
        CommercialProductReferencePortAdapter,
        SupplierPartyPortAdapter,
        TenantContactPortAdapter,
        {
          provide: IPartyReadPort,
          useValue: {
            getById: jest.fn(),
            findByDocument: jest.fn(),
            listRoles: jest.fn(),
            listContacts: jest.fn(),
          },
        },
        {
          provide: IPartyWritePort,
          useValue: { ensurePartyWithRole: jest.fn() },
        },
        {
          provide: CommercialCatalogReadPort,
          useValue: {
            getActiveProducts: jest.fn().mockResolvedValue([]),
            resolveProductReference: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: CommercialProductReferencePort,
          useExisting: CommercialProductReferencePortAdapter,
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
        {
          provide: INVENTORY_MOVEMENT_PORT,
          useExisting: InventoryMovementPortAdapter,
        },
        {
          provide: SupplierPartyPort,
          useExisting: SupplierPartyPortAdapter,
        },
        {
          provide: TenantService,
          useValue: { findOne: jest.fn() },
        },
        {
          provide: TenantContactPort,
          useExisting: TenantContactPortAdapter,
        },
      ],
    }).compile();

    expect(moduleRef).toBeDefined();
    expect(moduleRef.get(InventoryModule)).toBeInstanceOf(InventoryModule);
  });
});
