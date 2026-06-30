import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
  AddSupplierQuoteDto,
  AddSupplierQuoteSchema,
  ApprovePurchaseRequestDto,
  ApprovePurchaseRequestSchema,
  CreatePurchaseRequestAwardsDto,
  CreatePurchaseRequestAwardsSchema,
  CreatePurchaseOrderDto,
  CreatePurchaseOrderSchema,
  CreatePurchaseRequestDto,
  CreatePurchaseRequestSchema,
  ListPurchaseOrdersQueryDto,
  ListPurchaseOrdersQuerySchema,
  ListPurchaseRequestsQueryDto,
  ListPurchaseRequestsQuerySchema,
  ReceivePurchaseOrderDto,
  ReceivePurchaseOrderSchema,
  SearchSuppliersQueryDto,
  SearchSuppliersQuerySchema,
} from './dto';
import { GoodsReceiptService } from './services/goods-receipt.service';
import { PurchasingQueryService } from './services/purchasing-query.service';
import { PurchasingService } from './services/purchasing.service';

@ApiTags('purchasing')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('purchasing')
export class PurchasingController {
  constructor(
    private readonly purchasingService: PurchasingService,
    private readonly purchasingQueryService: PurchasingQueryService,
    private readonly goodsReceiptService: GoodsReceiptService,
  ) {}

  @Get('requests')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Listar solicitudes de compra' })
  listRequests(
    @Query(new ZodValidationPipe(ListPurchaseRequestsQuerySchema))
    query: ListPurchaseRequestsQueryDto,
  ) {
    return this.purchasingQueryService.listRequests(ListPurchaseRequestsQuerySchema.parse(query));
  }

  @Get('requests/:id')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Obtener detalle completo de una solicitud de compra' })
  getRequest(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchasingQueryService.getRequestDetail(id);
  }

  @Post('requests')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Crear solicitud de compra' })
  createRequest(
    @Body(new ZodValidationPipe(CreatePurchaseRequestSchema)) body: CreatePurchaseRequestDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.purchasingService.createPurchaseRequest(
      CreatePurchaseRequestSchema.parse(body),
      actor,
    );
  }

  @Post('requests/:id/quotes')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Registrar cotización para una solicitud' })
  addQuote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(AddSupplierQuoteSchema)) body: AddSupplierQuoteDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.purchasingService.addSupplierQuote(id, AddSupplierQuoteSchema.parse(body), actor);
  }

  @Post('requests/:id/approve')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Aprobar solicitud de compra' })
  approveRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ApprovePurchaseRequestSchema)) body: ApprovePurchaseRequestDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.purchasingService.approvePurchaseRequest(
      id,
      ApprovePurchaseRequestSchema.parse(body),
      actor,
    );
  }

  @Post('requests/:id/awards')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Registrar adjudicaciones por línea' })
  createAwards(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(CreatePurchaseRequestAwardsSchema))
    body: CreatePurchaseRequestAwardsDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.purchasingService.createLineAwards(
      id,
      CreatePurchaseRequestAwardsSchema.parse(body),
      actor,
    );
  }

  @Get('orders')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Listar órdenes de compra' })
  listOrders(
    @Query(new ZodValidationPipe(ListPurchaseOrdersQuerySchema)) query: ListPurchaseOrdersQueryDto,
  ) {
    return this.purchasingService.listOrders(ListPurchaseOrdersQuerySchema.parse(query));
  }

  @Get('orders/:id')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Obtener orden de compra con líneas' })
  getOrder(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchasingService.getOrderById(id);
  }

  @Get('providers')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Buscar proveedores disponibles para compras' })
  searchProviders(
    @Query(new ZodValidationPipe(SearchSuppliersQuerySchema)) query: SearchSuppliersQueryDto,
  ) {
    return this.purchasingQueryService.searchSuppliers(SearchSuppliersQuerySchema.parse(query));
  }

  @Get('providers/:partyRefId/summary')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Obtener ficha resumida de proveedor' })
  getProviderSummary(@Param('partyRefId', ParseUUIDPipe) partyRefId: string) {
    return this.purchasingQueryService.getProviderSummary(partyRefId);
  }

  @Post('orders')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Crear orden de compra desde solicitud aprobada' })
  createOrder(
    @Body(new ZodValidationPipe(CreatePurchaseOrderSchema)) body: CreatePurchaseOrderDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.purchasingService.createPurchaseOrderFromRequest(
      CreatePurchaseOrderSchema.parse(body),
      actor,
    );
  }

  @Post('orders/:id/receipts')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Registrar recepción de una orden de compra' })
  receiveOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ReceivePurchaseOrderSchema)) body: ReceivePurchaseOrderDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.goodsReceiptService.receivePurchaseOrder(
      id,
      ReceivePurchaseOrderSchema.parse(body),
      actor,
    );
  }
}
