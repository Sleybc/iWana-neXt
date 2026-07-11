import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
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
  CreateRfqDto,
  CreateRfqSchema,
  CreateSupplierDto,
  CreateSupplierSchema,
  DeclineInvitationDto,
  DeclineInvitationSchema,
  InviteSuppliersDto,
  InviteSuppliersSchema,
  ListPurchaseOrdersQueryDto,
  ListPurchaseOrdersQuerySchema,
  ListPurchaseRequestsQueryDto,
  ListPurchaseRequestsQuerySchema,
  ListSuppliersQueryDto,
  ListSuppliersQuerySchema,
  LookupSupplierDocumentQueryDto,
  LookupSupplierDocumentSchema,
  ReceivePurchaseOrderDto,
  ReceivePurchaseOrderSchema,
  SearchSuppliersQueryDto,
  SearchSuppliersQuerySchema,
  SetSupplierStatusDto,
  SetSupplierStatusSchema,
  UpdateSupplierDto,
  UpdateSupplierSchema,
} from './dto';
import { GoodsReceiptService } from './services/goods-receipt.service';
import { PurchasingQueryService } from './services/purchasing-query.service';
import { PurchasingService } from './services/purchasing.service';
import { RfqPdfService } from './services/rfq-pdf.service';
import { RfqService } from './services/rfq.service';
import { SupplierProfileService } from './services/supplier-profile.service';

@ApiTags('purchasing')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('purchasing')
export class PurchasingController {
  constructor(
    private readonly purchasingService: PurchasingService,
    private readonly purchasingQueryService: PurchasingQueryService,
    private readonly goodsReceiptService: GoodsReceiptService,
    private readonly rfqService: RfqService,
    private readonly rfqPdfService: RfqPdfService,
    private readonly supplierProfileService: SupplierProfileService,
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

  @Post('requests/:id/rfq')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Crear solicitud de cotización (RFQ) desde una solicitud de compra' })
  createRfq(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(CreateRfqSchema)) body: CreateRfqDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.rfqService.createFromRequest(id, CreateRfqSchema.parse(body), actor);
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

  @Post('suppliers')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Dar de alta un proveedor con perfil comercial' })
  createSupplier(
    @Body(new ZodValidationPipe(CreateSupplierSchema)) body: CreateSupplierDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.supplierProfileService.create(CreateSupplierSchema.parse(body), actor);
  }

  @Get('suppliers')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Listar proveedores con perfil comercial' })
  listSuppliers(
    @Query(new ZodValidationPipe(ListSuppliersQuerySchema)) query: ListSuppliersQueryDto,
  ) {
    return this.supplierProfileService.list(ListSuppliersQuerySchema.parse(query));
  }

  @Get('suppliers/lookup')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Buscar tercero por documento para reutilizar su identidad en el alta' })
  lookupSupplierByDocument(
    @Query(new ZodValidationPipe(LookupSupplierDocumentSchema))
    query: LookupSupplierDocumentQueryDto,
  ) {
    const parsed = LookupSupplierDocumentSchema.parse(query);
    return this.supplierProfileService.lookupByDocument(parsed.documentType, parsed.documentNumber);
  }

  @Get('suppliers/:partyRefId')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Obtener detalle de proveedor con perfil comercial' })
  getSupplier(@Param('partyRefId', ParseUUIDPipe) partyRefId: string) {
    return this.supplierProfileService.get(partyRefId);
  }

  @Patch('suppliers/:partyRefId')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Actualizar datos comerciales del proveedor' })
  updateSupplier(
    @Param('partyRefId', ParseUUIDPipe) partyRefId: string,
    @Body(new ZodValidationPipe(UpdateSupplierSchema)) body: UpdateSupplierDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.supplierProfileService.update(partyRefId, UpdateSupplierSchema.parse(body), actor);
  }

  @Post('suppliers/:partyRefId/status')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Cambiar estado del perfil comercial del proveedor' })
  setSupplierStatus(
    @Param('partyRefId', ParseUUIDPipe) partyRefId: string,
    @Body(new ZodValidationPipe(SetSupplierStatusSchema)) body: SetSupplierStatusDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.supplierProfileService.setStatus(
      partyRefId,
      SetSupplierStatusSchema.parse(body),
      actor,
    );
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

  @Post('rfqs/:rfqId/invitations')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Invitar proveedores a una solicitud de cotización' })
  inviteSuppliers(
    @Param('rfqId', ParseUUIDPipe) rfqId: string,
    @Body(new ZodValidationPipe(InviteSuppliersSchema)) body: InviteSuppliersDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.rfqService.invite(rfqId, InviteSuppliersSchema.parse(body), actor);
  }

  @Post('rfqs/:rfqId/send')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Enviar solicitud de cotización a proveedores invitados' })
  sendRfq(@Param('rfqId', ParseUUIDPipe) rfqId: string, @CurrentUser() actor: JwtPayload) {
    return this.rfqService.send(rfqId, actor);
  }

  @Post('rfqs/:rfqId/invitations/:invId/decline')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Registrar declinación de una invitación de cotización' })
  declineInvitation(
    @Param('rfqId', ParseUUIDPipe) rfqId: string,
    @Param('invId', ParseUUIDPipe) invId: string,
    @Body(new ZodValidationPipe(DeclineInvitationSchema)) body: DeclineInvitationDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.rfqService.decline(rfqId, invId, DeclineInvitationSchema.parse(body), actor);
  }

  @Post('rfqs/:rfqId/close')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Cerrar ronda de cotización' })
  closeRfq(@Param('rfqId', ParseUUIDPipe) rfqId: string, @CurrentUser() actor: JwtPayload) {
    return this.rfqService.close(rfqId, actor);
  }

  @Get('rfqs/:rfqId')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Obtener detalle de solicitud de cotización' })
  getRfq(@Param('rfqId', ParseUUIDPipe) rfqId: string) {
    return this.rfqService.getById(rfqId);
  }

  @Get('rfqs/:rfqId/pdf')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Descargar solicitud de cotización en PDF' })
  async downloadRfqPdf(
    @Param('rfqId', ParseUUIDPipe) rfqId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.rfqPdfService.renderOrThrow(rfqId);
    response.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(buffer);
  }
}
