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
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@iwana/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PickerSearchResponseDto } from '../../common/pagination';
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
  InventoryPickerSearchQueryDto,
  InventoryPickerSearchQuerySchema,
  ListLoansQueryDto,
  ListLoansQuerySchema,
  ListSerializedAssetsQueryDto,
  ListSerializedAssetsQuerySchema,
  SerializedAssetPickerSearchQueryDto,
  SerializedAssetPickerSearchQuerySchema,
  GetSerializedAssetDetailQueryDto,
  GetSerializedAssetDetailQuerySchema,
  ListUsefulLifeAlertsQueryDto,
  ListUsefulLifeAlertsQuerySchema,
  ListStockBalancesQueryDto,
  ListStockBalancesQuerySchema,
  ListStockIssuesQueryDto,
  ListStockIssuesQuerySchema,
  ListStockLocationsQueryDto,
  ListStockLocationsQuerySchema,
  StockLocationPickerSearchQueryDto,
  StockLocationPickerSearchQuerySchema,
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
  ListWriteOffsQueryDto,
  ListWriteOffsQuerySchema,
  InventoryListMetaDto,
  ApproveWriteOffDto,
  ApproveWriteOffSchema,
  RejectWriteOffDto,
  RejectWriteOffSchema,
} from './dto';
import { SerializedAssetDetailResponseDto } from './dto/serialized-asset-detail-response.dto';
import { InventoryDashboardService } from './services/inventory-dashboard.service';
import { AssetLoanService } from './services/asset-loan.service';
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
import { WriteOffService } from './services/write-off.service';

@ApiTags('inventory')
@ApiExtraModels(InventoryListMetaDto, PickerSearchResponseDto)
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
    private readonly assetLoanService: AssetLoanService,
    private readonly writeOffService: WriteOffService,
  ) {}

  @Get('items')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({
    summary: 'Listar items del inventario',
    description:
      'ADR-064/065: limit default 20, max 100; cursor o page (excluyentes). ' +
      'Filtros Ola 6: `belowMinimum` (+ `stockLocationId` opcional) para overview «solo bajo mínimo». ' +
      '`total` = tamaño del conjunto filtrado. Orden: createdAt DESC, id DESC.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista paginada `{ data, meta }` (ListMeta: mode page|cursor)',
  })
  listItems(
    @Query(new ZodValidationPipe(ListInventoryItemsQuerySchema)) query: ListInventoryItemsQueryDto,
  ) {
    return this.inventoryItemService.list(ListInventoryItemsQuerySchema.parse(query));
  }

  @Get('items/search')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({
    summary: 'Buscar ítems de inventario para picker (typeahead)',
    description:
      'Lookup E-4: `q` sobre nombre/SKU/marca/modelo. Máx. 20. `{ data: { id, label, sublabel }[], total }`.',
  })
  @ApiResponse({ status: 200, type: PickerSearchResponseDto })
  searchItems(
    @Query(new ZodValidationPipe(InventoryPickerSearchQuerySchema))
    query: InventoryPickerSearchQueryDto,
  ) {
    return this.inventoryItemService.searchForPicker(InventoryPickerSearchQuerySchema.parse(query));
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
  @ApiOperation({
    summary: 'Listar categorias de inventario',
    description:
      'Paginación cursor (ADR-064): `limit` default 20, max 100; `cursor` = meta.nextCursor previo. ' +
      '`total` = conjunto filtrado. Orden: sortOrder ASC, name ASC, id ASC. Filtros: search, status.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista paginada `{ data, meta: { nextCursor, total } }`',
  })
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
  @ApiOperation({
    summary: 'Listar ubicaciones de stock',
    description:
      'ADR-064: limit default 20, max 100; meta.nextCursor + meta.total. Orden: createdAt DESC, id DESC. ' +
      'Filtros Ola 6 (matriz): search, custody=mobile, statusGroup=inactive_group, withStock.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista paginada `{ data, meta: { nextCursor, total } }`',
  })
  listLocations(
    @Query(new ZodValidationPipe(ListStockLocationsQuerySchema)) query: ListStockLocationsQueryDto,
  ) {
    return this.stockLocationService.list(ListStockLocationsQuerySchema.parse(query));
  }

  @Get('locations/search')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({
    summary: 'Buscar ubicaciones de stock para picker (typeahead)',
    description:
      'Lookup E-4: `q` sobre nombre/código. Máx. 20. `{ data: { id, label, sublabel }[], total }`.',
  })
  @ApiResponse({ status: 200, type: PickerSearchResponseDto })
  searchLocations(
    @Query(new ZodValidationPipe(StockLocationPickerSearchQuerySchema))
    query: StockLocationPickerSearchQueryDto,
  ) {
    return this.stockLocationService.searchForPicker(
      StockLocationPickerSearchQuerySchema.parse(query),
    );
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
  @ApiOperation({
    summary: 'Listar activos serializados',
    description:
      'ADR-064/065: limit default 20, max 100; cursor o page (excluyentes). ' +
      'Orden: updatedAt DESC, id DESC. Desbloquea lista de activos diferida Ola 5.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista paginada `{ data, meta }` (ListMeta: mode page|cursor)',
  })
  listAssets(
    @Query(new ZodValidationPipe(ListSerializedAssetsQuerySchema))
    query: ListSerializedAssetsQueryDto,
  ) {
    return this.serializedAssetService.list(ListSerializedAssetsQuerySchema.parse(query));
  }

  @Get('assets/search')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({
    summary: 'Buscar activos serializados para picker (typeahead)',
    description: 'Lookup E-4: `q` sobre serial/asset tag/MAC/SKU. Máx. 20. `{ data, total }`.',
  })
  @ApiResponse({ status: 200, type: PickerSearchResponseDto })
  searchAssets(
    @Query(new ZodValidationPipe(SerializedAssetPickerSearchQuerySchema))
    query: SerializedAssetPickerSearchQueryDto,
  ) {
    return this.serializedAssetService.searchForPicker(
      SerializedAssetPickerSearchQuerySchema.parse(query),
    );
  }

  @Get('assets/useful-life-alerts')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({
    summary: 'Listar alertas de vida útil de activos',
    description:
      'Devuelve activos con vida útil por vencer o vencida. Predicado, COUNT y paginación en SQL; excluye WRITTEN_OFF, LOST y SOLD. Cálculo on-read sin tabla materializada.',
  })
  listUsefulLifeAlerts(
    @Query(new ZodValidationPipe(ListUsefulLifeAlertsQuerySchema))
    query: ListUsefulLifeAlertsQueryDto,
  ) {
    return this.serializedAssetService.listUsefulLifeAlerts(
      ListUsefulLifeAlertsQuerySchema.parse(query),
    );
  }

  @Get('assets/:id')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({
    summary: 'Obtener ficha 360 de activo serializado',
    description:
      'Devuelve el activo con secciones compuestas: ítem, ubicación, origen de compra, vida útil, ciclo de vida, movimientos y comodatos.',
  })
  @ApiOkResponse({ type: SerializedAssetDetailResponseDto })
  getAsset(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(GetSerializedAssetDetailQuerySchema))
    query: GetSerializedAssetDetailQueryDto,
  ) {
    return this.serializedAssetService.getById(
      id,
      GetSerializedAssetDetailQuerySchema.parse(query),
    );
  }

  @Get('loans')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({
    summary: 'Listar comodatos de activos',
    description:
      'Lista comodatos abiertos o cerrados con filtros por suscriptor, contrato y activo serializado.',
  })
  listLoans(@Query(new ZodValidationPipe(ListLoansQuerySchema)) query: ListLoansQueryDto) {
    return this.assetLoanService.list(ListLoansQuerySchema.parse(query));
  }

  @Get('balances')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({
    summary: 'Consultar balances de stock',
    description:
      'ADR-064: limit default 20, max 100; meta.nextCursor + meta.total. Orden: updatedAt DESC, id DESC.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista paginada `{ data, meta: { nextCursor, total } }`',
  })
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
  @ApiOperation({
    summary: 'Listar salidas (StockIssue)',
    description:
      'ADR-064/065: limit default 20, max 100; cursor o page (excluyentes). ' +
      'Filtros Ola 6: type, status, search (bodegas/refs). Orden: createdAt DESC, id DESC.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista paginada `{ data, meta }` (ListMeta: mode page|cursor)',
  })
  listIssues(
    @Query(new ZodValidationPipe(ListStockIssuesQuerySchema)) query: ListStockIssuesQueryDto,
  ) {
    return this.stockIssueService.list(ListStockIssuesQuerySchema.parse(query));
  }

  @Post('issues')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({
    summary: 'Crear salida (StockIssue)',
    description:
      'Reserva la cantidad solicitada por línea. Responde 400 si no hay disponible suficiente (existencia − comprometido).',
  })
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
  @ApiOperation({
    summary: 'Actualizar salida (StockIssue)',
    description:
      'Si cambian líneas, ajusta reservas. Responde 400 al aumentar por encima del disponible.',
  })
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
  @ApiOperation({
    summary: 'Despachar salida (StockIssue)',
    description:
      'Libera la reserva propia y descuenta existencia en la misma transacción. Idempotente por stockMovementId.',
  })
  dispatchIssue(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(DispatchStockIssueSchema)) body: DispatchStockIssueDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.stockIssueService.dispatch(id, DispatchStockIssueSchema.parse(body), actor);
  }

  @Post('transfers')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({
    summary: 'Transferir stock entre ubicaciones',
    description:
      'Valida contra disponible (existencia − comprometido). No puede consumir stock reservado por otra salida.',
  })
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
  @ApiOperation({ summary: 'Solicitar baja de inventario o activo (pendiente de aprobación)' })
  createWriteOffRequest(
    @Body(new ZodValidationPipe(WriteOffAssetSchema)) body: WriteOffAssetDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.writeOffService.createRequest(WriteOffAssetSchema.parse(body), actor);
  }

  @Get('write-offs')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Listar solicitudes y documentos de baja' })
  listWriteOffs(
    @Query(new ZodValidationPipe(ListWriteOffsQuerySchema)) query: ListWriteOffsQueryDto,
  ) {
    return this.writeOffService.list(ListWriteOffsQuerySchema.parse(query));
  }

  @Get('write-offs/:id')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Obtener detalle de solicitud o documento de baja' })
  getWriteOff(@Param('id', ParseUUIDPipe) id: string) {
    return this.writeOffService.getById(id);
  }

  @Post('write-offs/:id/approve')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Aprobar solicitud de baja y aplicar al ledger',
    description:
      'Exclusivo de ADMIN (ADR-060 / D-H6-1). El aprobador debe ser distinto del solicitante.',
  })
  approveWriteOff(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ApproveWriteOffSchema)) body: ApproveWriteOffDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    void body;
    return this.writeOffService.approve(id, actor);
  }

  @Post('write-offs/:id/reject')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Rechazar solicitud de baja',
    description:
      'Exclusivo de ADMIN (ADR-060 / D-H6-1). El rechazante debe ser distinto del solicitante.',
  })
  rejectWriteOff(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(RejectWriteOffSchema)) body: RejectWriteOffDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.writeOffService.reject(id, RejectWriteOffSchema.parse(body), actor);
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
  @ApiOperation({
    summary: 'Listar conteos físicos de inventario',
    description:
      'ADR-064/065: limit default 20, max 100; cursor o page (excluyentes). Orden: createdAt DESC, id DESC. ' +
      'Filtro Ola 6: `status` en servidor (no filtrar en cliente sobre buffer paginado).',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista paginada `{ data, meta }` (ListMeta: mode page|cursor)',
  })
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
