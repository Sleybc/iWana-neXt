import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { StockIssue, StockIssueLine, StockIssueLineSerial } from '@iwana/db';
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
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import {
  CommercialProductReferencePort,
  CommercialProductReferencePortAdapter,
} from '../ports/commercial-product-reference.port';
import { TaxCatalogReadPort } from '../../taxation/ports/tax-catalog-read.port';
import {
  INVENTORY_MOVEMENT_PORT,
  InventoryMovementPortAdapter,
} from '../ports/inventory-movement.port';
import { AssetLifecycleService } from '../services/asset-lifecycle.service';
import { AssetLoanService } from '../services/asset-loan.service';
import { GoodsReceiptService } from '../services/goods-receipt.service';
import { CounterPurchaseService } from '../services/counter-purchase.service';
import { RfqPdfService } from '../services/rfq-pdf.service';
import { PurchaseOrderPdfService } from '../services/purchase-order-pdf.service';
import { RfqService } from '../services/rfq.service';
import { InventoryDashboardService } from '../services/inventory-dashboard.service';
import { ReplenishmentService } from '../services/replenishment.service';
import { CycleCountService } from '../services/cycle-count.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InventoryCategoryService } from '../services/inventory-category.service';
import { InventoryItemService } from '../services/inventory-item.service';
import { PurchasingPolicyService } from '../services/purchasing-policy.service';
import { PurchasingQueryService } from '../services/purchasing-query.service';
import { PurchasingService } from '../services/purchasing.service';
import { SupplierProfileService } from '../services/supplier-profile.service';
import { SerializedAssetService } from '../services/serialized-asset.service';
import { StockBalanceService } from '../services/stock-balance.service';
import { ExecutorCustodyService } from '../services/executor-custody.service';
import { StockIssueService } from '../services/stock-issue.service';
import { StockIssuePickingService } from '../services/stock-issue-picking.service';
import { SerializedGroupValidator } from '../services/serialized-group.validator';
import { StockLedgerService } from '../services/stock-ledger.service';
import { InventoryCostingService } from '../services/inventory-costing.service';
import { StockMovementQueryService } from '../services/stock-movement-query.service';
import { StockLocationService } from '../services/stock-location.service';
import { WriteOffService } from '../services/write-off.service';
import { InventoryDomainEventPublisher } from '../services/inventory-domain-event-publisher.service';
import { InventoryDomainEventsListener } from '../listeners/inventory-domain-events.listener';

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
        InventoryCostingService,
        StockMovementQueryService,
        StockIssueService,
        StockIssuePickingService,
        SerializedGroupValidator,
        StockBalanceService,
        ExecutorCustodyService,
        SerializedAssetService,
        PurchasingPolicyService,
        PurchasingQueryService,
        PurchasingService,
        GoodsReceiptService,
        CounterPurchaseService,
        RfqService,
        RfqPdfService,
        PurchaseOrderPdfService,
        SupplierProfileService,
        AssetLifecycleService,
        AssetLoanService,
        WriteOffService,
        InventoryDashboardService,
        ReplenishmentService,
        CycleCountService,
        InventoryDomainEventPublisher,
        InventoryDomainEventsListener,
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
        {
          provide: TaxCatalogReadPort,
          useValue: {
            listByContext: jest.fn().mockResolvedValue([]),
            findActiveByCode: jest.fn(),
            resolveSystemPreset: jest.fn(),
            findById: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    expect(moduleRef).toBeDefined();
    expect(moduleRef.get(InventoryModule)).toBeInstanceOf(InventoryModule);
  });

  describe('registro de repositorios de salidas (MOD12 S2.1 · B0)', () => {
    /**
     * Sin `StockIssueLineSerial` en el `forFeature`, cualquier flujo que toque
     * la tabla hija muere con `RepositoryNotFoundError` aunque la entidad y la
     * migración existan. Este test lo deja comprometido a nivel del módulo
     * real, sin levantar conexión: inspecciona los providers que
     * `TypeOrmModule.forFeature` registra en los metadatos del módulo.
     */
    it('expone el repositorio de la hija StockIssueLineSerial en el forFeature', () => {
      const imports = Reflect.getMetadata('imports', InventoryModule) as unknown;

      expect(Array.isArray(imports)).toBe(true);
      const providers = (imports as Array<{ providers?: Array<{ provide?: unknown }> }>).flatMap(
        (entry) => entry?.providers ?? [],
      );
      const provides = providers.map((provider) => provider?.provide);

      expect(provides).toContain(getRepositoryToken(StockIssueLineSerial));
      // La cabecera y la línea siguen registradas (red de seguridad del cambio).
      expect(provides).toContain(getRepositoryToken(StockIssue));
      expect(provides).toContain(getRepositoryToken(StockIssueLine));
    });
  });
});
