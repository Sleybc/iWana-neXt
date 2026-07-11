import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { IPartyReadPort } from '../../parties/ports/party-read.port';
import { InventoryModule } from '../inventory.module';
import { InventoryController } from '../inventory.controller';
import { SupplierPartyPort, SupplierPartyPortAdapter } from '../ports/supplier-party.port';
import { PurchasingController } from '../purchasing.controller';
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
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InventoryCategoryService } from '../services/inventory-category.service';
import { InventoryItemService } from '../services/inventory-item.service';
import { PurchasingPolicyService } from '../services/purchasing-policy.service';
import { PurchasingQueryService } from '../services/purchasing-query.service';
import { PurchasingService } from '../services/purchasing.service';
import { SerializedAssetService } from '../services/serialized-asset.service';
import { StockBalanceService } from '../services/stock-balance.service';
import { StockIssueService } from '../services/stock-issue.service';
import { StockLedgerService } from '../services/stock-ledger.service';
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
        InventoryMovementPortAdapter,
        SupplierPartyPortAdapter,
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
      ],
    }).compile();

    expect(moduleRef).toBeDefined();
    expect(moduleRef.get(InventoryModule)).toBeInstanceOf(InventoryModule);
  });
});
