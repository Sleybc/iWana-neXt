import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { CounterPurchaseService } from './services/counter-purchase.service';
import { InventoryCategoryService } from './services/inventory-category.service';
import { InventoryDashboardService } from './services/inventory-dashboard.service';
import { InventoryItemService } from './services/inventory-item.service';
import { SerializedAssetService } from './services/serialized-asset.service';
import { StockBalanceService } from './services/stock-balance.service';
import { StockIssueService } from './services/stock-issue.service';
import { StockLedgerService } from './services/stock-ledger.service';
import { StockLocationService } from './services/stock-location.service';
import { InventoryController } from './inventory.controller';

function getRequestSchema(
  operation: Record<string, unknown> | undefined,
  mimeType: string,
): Record<string, unknown> | undefined {
  const requestBody = operation?.requestBody as Record<string, unknown> | undefined;
  const content = requestBody?.content as Record<string, unknown> | undefined;
  const typedBody = content?.[mimeType] as Record<string, unknown> | undefined;

  return typedBody?.schema as Record<string, unknown> | undefined;
}

describe('InventoryController Swagger', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [InventoryController],
      providers: [
        { provide: InventoryItemService, useValue: {} },
        { provide: InventoryCategoryService, useValue: {} },
        { provide: StockLocationService, useValue: {} },
        { provide: SerializedAssetService, useValue: {} },
        { provide: StockBalanceService, useValue: {} },
        { provide: StockLedgerService, useValue: {} },
        { provide: StockIssueService, useValue: {} },
        { provide: CounterPurchaseService, useValue: {} },
        { provide: InventoryDashboardService, useValue: {} },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('documenta compra de mostrador en inventario', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Swagger Inventory Test').setVersion('1.0').build(),
    );

    const counterPurchase = document.paths['/inventory/counter-purchases']?.post;

    expect(counterPurchase).toBeDefined();
    expect(counterPurchase?.summary).toBe('Registrar ingreso directo por compra de mostrador');
    expect(
      getRequestSchema(counterPurchase as unknown as Record<string, unknown>, 'application/json'),
    ).toBeDefined();
  });
});
