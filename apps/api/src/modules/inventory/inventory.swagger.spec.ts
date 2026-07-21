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
import { StockMovementQueryService } from './services/stock-movement-query.service';
import { StockLocationService } from './services/stock-location.service';
import { InventoryController } from './inventory.controller';
import { ReplenishmentService } from './services/replenishment.service';
import { CycleCountService } from './services/cycle-count.service';
import { AssetLoanService } from './services/asset-loan.service';

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
        { provide: StockMovementQueryService, useValue: {} },
        { provide: StockIssueService, useValue: {} },
        { provide: CounterPurchaseService, useValue: {} },
        { provide: InventoryDashboardService, useValue: {} },
        { provide: ReplenishmentService, useValue: {} },
        { provide: CycleCountService, useValue: {} },
        { provide: AssetLoanService, useValue: {} },
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

  it('documenta kardex y ajustes de inventario', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Swagger Inventory Test').setVersion('1.0').build(),
    );

    const listMovements = document.paths['/inventory/movements']?.get;
    const getMovement = document.paths['/inventory/movements/{id}']?.get;
    const createAdjustment = document.paths['/inventory/adjustments']?.post;

    expect(listMovements?.summary).toBe('Consultar kardex de movimientos de stock');
    expect(getMovement?.summary).toBe('Obtener detalle de movimiento de stock');
    expect(createAdjustment?.summary).toBe('Registrar ajuste manual de inventario');
    expect(
      getRequestSchema(createAdjustment as unknown as Record<string, unknown>, 'application/json'),
    ).toBeDefined();
  });

  it('documenta sugerencias de reposición', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Swagger Inventory Test').setVersion('1.0').build(),
    );

    const suggestions = document.paths['/inventory/replenishment/suggestions']?.get;

    expect(suggestions).toBeDefined();
    expect(suggestions?.summary).toBe('Consultar sugerencias de reposición de inventario');
  });

  it('documenta conteos físicos de inventario', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Swagger Inventory Test').setVersion('1.0').build(),
    );

    expect(document.paths['/inventory/counts']?.get?.summary).toBe(
      'Listar conteos físicos de inventario',
    );
    expect(document.paths['/inventory/counts']?.post?.summary).toBe(
      'Crear conteo físico de inventario',
    );
    expect(document.paths['/inventory/counts/{id}']?.get?.summary).toBe(
      'Obtener detalle de conteo físico',
    );
    expect(document.paths['/inventory/counts/{id}']?.patch?.summary).toBe(
      'Capturar cantidades de un conteo físico',
    );
    expect(document.paths['/inventory/counts/{id}/close']?.post?.summary).toBe(
      'Cerrar conteo físico y aplicar ajuste de inventario',
    );
    expect(document.paths['/inventory/counts/{id}/cancel']?.post?.summary).toBe(
      'Cancelar conteo físico sin efecto en stock',
    );
  });

  it('documenta ficha 360 de activo y filtro serializedAssetId en kardex', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Swagger Inventory Test').setVersion('1.0').build(),
    );

    const getAsset = document.paths['/inventory/assets/{id}']?.get;
    const listMovements = document.paths['/inventory/movements']?.get;
    const getAssetResponse = getAsset?.responses?.['200'] as
      | { content?: Record<string, { schema?: unknown }> }
      | undefined;

    expect(getAsset?.summary).toBe('Obtener ficha 360 de activo serializado');
    expect(getAsset?.parameters?.length).toBeGreaterThan(0);
    expect(getAssetResponse?.content?.['application/json']?.schema).toBeDefined();
    expect(listMovements?.parameters?.length).toBeGreaterThan(0);
  });

  it('documenta listado de comodatos', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Swagger Inventory Test').setVersion('1.0').build(),
    );

    const listLoans = document.paths['/inventory/loans']?.get;

    expect(listLoans?.summary).toBe('Listar comodatos de activos');
    expect(listLoans?.parameters?.length).toBeGreaterThan(0);
  });
});
