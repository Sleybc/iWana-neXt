import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@iwana/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  CreateInventoryItemDto,
  CreateInventoryItemSchema,
  CreateInventoryCategoryDto,
  CreateInventoryCategorySchema,
  CreateStockIssueDto,
  CreateStockIssueSchema,
  DispatchStockIssueDto,
  DispatchStockIssueSchema,
  CancelStockIssueDto,
  CancelStockIssueSchema,
  CreateCounterPurchaseDto,
  CreateCounterPurchaseSchema,
  CreateStockAdjustmentDto,
  CreateStockAdjustmentSchema,
  CreateStockCountDto,
  CreateStockCountSchema,
  CloseStockCountDto,
  CloseStockCountSchema,
  CreateStockLocationDto,
  CreateStockLocationSchema,
  ListStockCountsQueryDto,
  ListStockCountsQuerySchema,
  UpdateStockCountDto,
  UpdateStockCountSchema,
  ExecutionOrderMovementDto,
  ExecutionOrderMovementSchema,
  InternalConsumptionDto,
  InternalConsumptionSchema,
  ListCatalogOptionsQueryDto,
  ListCatalogOptionsQuerySchema,
  ListInventoryCategoriesQueryDto,
  ListInventoryCategoriesQuerySchema,
  SuggestInventoryCategoryPrefixQueryDto,
  SuggestInventoryCategoryPrefixQuerySchema,
  SuggestInventoryCategoryPrefixResponseDto,
  ListInventoryItemsQueryDto,
  ListInventoryItemsQuerySchema,
  ListSerializedAssetsQueryDto,
  ListSerializedAssetsQuerySchema,
  ListStockBalancesQueryDto,
  ListStockBalancesQuerySchema,
  ListStockIssuesQueryDto,
  ListStockIssuesQuerySchema,
  ListStockLocationsQueryDto,
  ListStockLocationsQuerySchema,
  ListStockMovementsQueryDto,
  ListStockMovementsQuerySchema,
  ReturnAssetDto,
  ReturnAssetSchema,
  SaleMovementDto,
  SaleMovementSchema,
  TransferStockDto,
  TransferStockSchema,
  UpdateInventoryItemDto,
  UpdateInventoryItemSchema,
  UpdateInventoryCategoryDto,
  UpdateInventoryCategorySchema,
  UpdateStockIssueDto,
  UpdateStockIssueSchema,
  UpdateStockLocationDto,
  UpdateStockLocationSchema,
  WriteOffAssetDto,
  WriteOffAssetSchema,
} from './dto';
import { InventoryDashboardService } from './services/inventory-dashboard.service';
import { InventoryCategoryService } from './services/inventory-category.service';
import { InventoryItemService } from './services/inventory-item.service';
import { ReplenishmentService } from './services/replenishment.service';
import { SerializedAssetService } from './services/serialized-asset.service';
import { StockBalanceService } from './services/stock-balance.service';
import { StockLedgerService } from './services/stock-ledger.service';
import { StockMovementQueryService } from './services/stock-movement-query.service';
import { StockLocationService } from './services/stock-location.service';
import { StockIssueService } from './services/stock-issue.service';
import { CounterPurchaseService } from './services/counter-purchase.service';
import { CycleCountService } from './services/cycle-count.service';

@ApiTags('inventory')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventoryItemService: InventoryItemService,
    private readonly inventoryCategoryService: InventoryCategoryService,
    private readonly stockLocationService: StockLocationService,
    private readonly serializedAssetService: SerializedAssetService,
    private readonly stockBalanceService: StockBalanceService,
    private readonly stockLedgerService: StockLedgerService,
    private readonly stockMovementQueryService: StockMovementQueryService,
    private readonly stockIssueService: StockIssueService,
    private readonly counterPurchaseService: CounterPurchaseService,
    private readonly inventoryDashboardService: InventoryDashboardService,
    private readonly replenishmentService: ReplenishmentService,
    private readonly cycleCountService: CycleCountService,
  ) {}

  @Get('items')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Listar items del inventario' })
  listItems(
    @Query(new ZodValidationPipe(ListInventoryItemsQuerySchema)) query: ListInventoryItemsQueryDto,
  ) {
    return this.inventoryItemService.list(ListInventoryItemsQuerySchema.parse(query));
  }

  @Get('items/catalog/options')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Obtener opciones de catalogo para Compras' })
  listCatalogOptions(
    @Query(new ZodValidationPipe(ListCatalogOptionsQuerySchema)) query: ListCatalogOptionsQueryDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.inventoryItemService.listCatalogOptions(
      ListCatalogOptionsQuerySchema.parse(query),
      actor,
    );
  }

  @Get('items/:id')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Obtener detalle de item del inventario' })
  getItem(@Param('id', ParseUUIDPipe) id: string) {
    return this.inventoryItemService.getById(id);
  }

  @Post('items')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Crear item del inventario' })
  createItem(
    @Body(new ZodValidationPipe(CreateInventoryItemSchema)) body: CreateInventoryItemDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.inventoryItemService.create(CreateInventoryItemSchema.parse(body), actor);
  }

  @Patch('items/:id')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Actualizar item del inventario' })
  updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateInventoryItemSchema)) body: UpdateInventoryItemDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.inventoryItemService.update(id, UpdateInventoryItemSchema.parse(body), actor);
  }

  @Delete('items/:id')
  @HttpCode(204)
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Eliminar item del inventario' })
  deleteItem(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: JwtPayload) {
    return this.inventoryItemService.delete(id, actor);
  }

  @Get('categories')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Listar categorias de inventario' })
  listCategories(
    @Query(new ZodValidationPipe(ListInventoryCategoriesQuerySchema))
    query: ListInventoryCategoriesQueryDto,
  ) {
    return this.inventoryCategoryService.list(ListInventoryCategoriesQuerySchema.parse(query));
  }

  @Get('categories/suggest-prefix')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Sugerir codigo y prefijo de categoria de inventario' })
  suggestCategoryPrefix(
    @Query(new ZodValidationPipe(SuggestInventoryCategoryPrefixQuerySchema))
    query: SuggestInventoryCategoryPrefixQueryDto,
  ): Promise<SuggestInventoryCategoryPrefixResponseDto> {
    return this.inventoryCategoryService.suggestPrefix(
      SuggestInventoryCategoryPrefixQuerySchema.parse(query),
    );
  }

  @Get('categories/:id')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Obtener detalle de categoria de inventario' })
  getCategory(@Param('id', ParseUUIDPipe) id: string) {
    return this.inventoryCategoryService.getById(id);
  }

  @Post('categories')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Crear categoria de inventario' })
  createCategory(
    @Body(new ZodValidationPipe(CreateInventoryCategorySchema)) body: CreateInventoryCategoryDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.inventoryCategoryService.create(CreateInventoryCategorySchema.parse(body), actor);
  }

  @Patch('categories/:id')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Actualizar categoria de inventario' })
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateInventoryCategorySchema)) body: UpdateInventoryCategoryDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.inventoryCategoryService.update(
      id,
      UpdateInventoryCategorySchema.parse(body),
      actor,
    );
  }

  @Get('locations')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Listar ubicaciones de stock' })
  listLocations(
    @Query(new ZodValidationPipe(ListStockLocationsQuerySchema)) query: ListStockLocationsQueryDto,
  ) {
    return this.stockLocationService.list(ListStockLocationsQuerySchema.parse(query));
  }

  @Post('locations')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Crear ubicación de stock' })
  createLocation(
    @Body(new ZodValidationPipe(CreateStockLocationSchema)) body: CreateStockLocationDto,
  ) {
    return this.stockLocationService.create(CreateStockLocationSchema.parse(body));
  }

  @Patch('locations/:id')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Actualizar ubicación de stock' })
  updateLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateStockLocationSchema)) body: UpdateStockLocationDto,
  ) {
    return this.stockLocationService.update(id, UpdateStockLocationSchema.parse(body));
  }

  @Get('assets')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Listar activos serializados' })
  listAssets(
    @Query(new ZodValidationPipe(ListSerializedAssetsQuerySchema))
    query: ListSerializedAssetsQueryDto,
  ) {
    return this.serializedAssetService.list(ListSerializedAssetsQuerySchema.parse(query));
  }

  @Get('assets/:id')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Obtener detalle de activo serializado' })
  getAsset(@Param('id', ParseUUIDPipe) id: string) {
    return this.serializedAssetService.getById(id);
  }

  @Get('balances')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Consultar balances de stock' })
  listBalances(
    @Query(new ZodValidationPipe(ListStockBalancesQuerySchema)) query: ListStockBalancesQueryDto,
  ) {
    return this.stockBalanceService.list(ListStockBalancesQuerySchema.parse(query));
  }

  @Get('movements')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Consultar kardex de movimientos de stock' })
  listMovements(
    @Query(new ZodValidationPipe(ListStockMovementsQuerySchema))
    query: ListStockMovementsQueryDto,
  ) {
    return this.stockMovementQueryService.list(ListStockMovementsQuerySchema.parse(query));
  }

  @Get('movements/:id')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Obtener detalle de movimiento de stock' })
  getMovement(@Param('id', ParseUUIDPipe) id: string) {
    return this.stockMovementQueryService.getById(id);
  }

  @Post('adjustments')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Registrar ajuste manual de inventario' })
  createAdjustment(
    @Body(new ZodValidationPipe(CreateStockAdjustmentSchema)) body: CreateStockAdjustmentDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.stockLedgerService.recordAdjustment(CreateStockAdjustmentSchema.parse(body), actor);
  }

  @Get('issues')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Listar salidas (StockIssue)' })
  listIssues(
    @Query(new ZodValidationPipe(ListStockIssuesQuerySchema)) query: ListStockIssuesQueryDto,
  ) {
    return this.stockIssueService.list(ListStockIssuesQuerySchema.parse(query));
  }

  @Post('issues')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Crear salida (StockIssue)' })
  createIssue(
    @Body(new ZodValidationPipe(CreateStockIssueSchema)) body: CreateStockIssueDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.stockIssueService.create(CreateStockIssueSchema.parse(body), actor);
  }

  @Get('issues/:id')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Obtener detalle de salida (StockIssue)' })
  getIssue(@Param('id', ParseUUIDPipe) id: string) {
    return this.stockIssueService.getById(id);
  }

  @Patch('issues/:id')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Actualizar salida (StockIssue)' })
  updateIssue(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateStockIssueSchema)) body: UpdateStockIssueDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.stockIssueService.update(id, UpdateStockIssueSchema.parse(body), actor);
  }

  @Post('issues/:id/cancel')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Cancelar salida (StockIssue)' })
  cancelIssue(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(CancelStockIssueSchema)) body: CancelStockIssueDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    CancelStockIssueSchema.parse(body);
    return this.stockIssueService.cancel(id, actor);
  }

  @Post('issues/:id/dispatch')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Despachar salida (StockIssue)' })
  dispatchIssue(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(DispatchStockIssueSchema)) body: DispatchStockIssueDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.stockIssueService.dispatch(id, DispatchStockIssueSchema.parse(body), actor);
  }

  @Post('transfers')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Transferir stock entre ubicaciones' })
  transfer(
    @Body(new ZodValidationPipe(TransferStockSchema)) body: TransferStockDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.stockLedgerService.transfer(TransferStockSchema.parse(body), actor);
  }

  @Post('movements/execution-order')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Registrar movimiento desde una OT' })
  movementFromExecutionOrder(
    @Body(new ZodValidationPipe(ExecutionOrderMovementSchema)) body: ExecutionOrderMovementDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.stockLedgerService.recordExecutionOrderMovement(
      ExecutionOrderMovementSchema.parse(body),
      actor,
    );
  }

  @Post('movements/sale')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Registrar salida por venta' })
  sale(
    @Body(new ZodValidationPipe(SaleMovementSchema)) body: SaleMovementDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.stockLedgerService.recordSale(SaleMovementSchema.parse(body), actor);
  }

  @Post('movements/internal-consumption')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Registrar consumo interno' })
  internalConsumption(
    @Body(new ZodValidationPipe(InternalConsumptionSchema)) body: InternalConsumptionDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.stockLedgerService.recordInternalConsumption(
      InternalConsumptionSchema.parse(body),
      actor,
    );
  }

  @Post('returns')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Registrar retorno de inventario o activo' })
  registerReturn(
    @Body(new ZodValidationPipe(ReturnAssetSchema)) body: ReturnAssetDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.stockLedgerService.recordReturn(ReturnAssetSchema.parse(body), actor);
  }

  @Post('write-offs')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Registrar baja de inventario o activo' })
  writeOff(
    @Body(new ZodValidationPipe(WriteOffAssetSchema)) body: WriteOffAssetDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.stockLedgerService.recordWriteOff(WriteOffAssetSchema.parse(body), actor);
  }

  @Post('counter-purchases')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Registrar ingreso directo por compra de mostrador' })
  createCounterPurchase(
    @Body(new ZodValidationPipe(CreateCounterPurchaseSchema)) body: CreateCounterPurchaseDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.counterPurchaseService.record(CreateCounterPurchaseSchema.parse(body), actor);
  }

  @Get('dashboard')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Obtener KPIs del dashboard de inventario' })
  getDashboard() {
    return this.inventoryDashboardService.getSummary();
  }

  @Get('replenishment/suggestions')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Consultar sugerencias de reposición de inventario' })
  listReplenishmentSuggestions() {
    return this.replenishmentService.listSuggestions();
  }

  @Get('counts')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Listar conteos físicos de inventario' })
  listCounts(
    @Query(new ZodValidationPipe(ListStockCountsQuerySchema)) query: ListStockCountsQueryDto,
  ) {
    return this.cycleCountService.list(ListStockCountsQuerySchema.parse(query));
  }

  @Post('counts')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Crear conteo físico de inventario' })
  createCount(
    @Body(new ZodValidationPipe(CreateStockCountSchema)) body: CreateStockCountDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.cycleCountService.create(CreateStockCountSchema.parse(body), actor);
  }

  @Get('counts/:id')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Obtener detalle de conteo físico' })
  getCount(@Param('id', ParseUUIDPipe) id: string) {
    return this.cycleCountService.getById(id);
  }

  @Patch('counts/:id')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Capturar cantidades de un conteo físico' })
  updateCount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateStockCountSchema)) body: UpdateStockCountDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.cycleCountService.update(id, UpdateStockCountSchema.parse(body), actor);
  }

  @Post('counts/:id/close')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Cerrar conteo físico y aplicar ajuste de inventario' })
  closeCount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(CloseStockCountSchema)) body: CloseStockCountDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    CloseStockCountSchema.parse(body);
    return this.cycleCountService.close(id, actor);
  }

  @Post('counts/:id/cancel')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Cancelar conteo físico sin efecto en stock' })
  cancelCount(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: JwtPayload) {
    return this.cycleCountService.cancel(id, actor);
  }
}
