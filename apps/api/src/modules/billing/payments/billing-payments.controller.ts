import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Optional,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiExtraModels,
  getSchemaPath,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import type { Response } from 'express';
import {
  AccessPermissionKey,
  BILLING_ALLOCATION_UNLINK_REASONS,
  BILLING_WITHHOLDING_MAX_LINES,
  BILLING_WITHHOLDING_TAX_CODES,
  UserRole,
} from '@iwana/shared';
import { z } from 'zod';
import { ListMetaDto } from '../../../common/pagination';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { Permissions } from '../../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { BillingPaymentsService, type PaymentReadAccess } from './billing-payments.service';
import { BillingReceiptsService } from './billing-receipts.service';

type AuthenticatedRequest = { user?: JwtPayload };

function actorId(request: AuthenticatedRequest): string {
  const id = request.user?.sub;
  if (!id)
    throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'La sesión no es válida.' });
  return id;
}

const PaymentListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

/** Retención del pago (spec MOD14 2026-11-13 R6, R8). */
const WITHHOLDING_RESPONSE_SCHEMA: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'paymentId',
    'documentId',
    'taxCode',
    'base',
    'rate',
    'amount',
    'certificateNumber',
    'voidedAt',
    'createdBy',
    'createdAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    paymentId: { type: 'string', format: 'uuid' },
    documentId: { type: 'string', format: 'uuid' },
    taxCode: { type: 'string', enum: [...BILLING_WITHHOLDING_TAX_CODES] },
    base: { type: 'string' },
    rate: { type: 'string', pattern: '^\\d{1,3}\\.\\d{4}$' },
    amount: { type: 'string' },
    certificateNumber: { type: 'string', nullable: true },
    voidedAt: { type: 'string', format: 'date-time', nullable: true },
    createdBy: { type: 'string', format: 'uuid' },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

const WITHHOLDING_REQUEST_SCHEMA: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['taxCode', 'base', 'rate', 'amount', 'certificateNumber'],
  properties: {
    taxCode: { type: 'string', enum: [...BILLING_WITHHOLDING_TAX_CODES] },
    base: {
      oneOf: [
        { type: 'number', minimum: 0.01 },
        { type: 'string', pattern: '^\\d{1,12}(\\.\\d{1,2})?$' },
      ],
    },
    rate: {
      description: 'Porcentaje (4 = 4 %), mayor que 0 y hasta 100, con cuatro decimales máximo.',
      oneOf: [
        { type: 'number', minimum: 0.0001, maximum: 100 },
        { type: 'string', pattern: '^\\d{1,3}(\\.\\d{1,4})?$' },
      ],
    },
    amount: {
      description: 'Valor retenido; no supera la base y difiere de base × tarifa en 1 peso máximo.',
      oneOf: [
        { type: 'number', minimum: 0.01 },
        { type: 'string', pattern: '^\\d{1,12}(\\.\\d{1,2})?$' },
      ],
    },
    certificateNumber: { type: 'string', minLength: 1, maxLength: 60 },
    documentId: {
      type: 'string',
      format: 'uuid',
      description:
        'Documento al que se atribuye; si se omite, el primero que el pago salda con espacio suficiente.',
    },
  },
};

/** Aplicación del pago a un documento; `reversalReasonCode` solo en una desasociación manual. */
const ALLOCATION_RESPONSE_SCHEMA: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'tenantId', 'paymentId', 'documentId', 'amount', 'createdBy', 'createdAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    tenantId: { type: 'string', format: 'uuid' },
    paymentId: { type: 'string', format: 'uuid' },
    documentId: { type: 'string', format: 'uuid' },
    amount: { type: 'string' },
    reversedAt: { type: 'string', format: 'date-time', nullable: true },
    reversedBy: { type: 'string', format: 'uuid', nullable: true },
    reversalReasonCode: {
      type: 'string',
      enum: [...BILLING_ALLOCATION_UNLINK_REASONS],
      nullable: true,
    },
    createdBy: { type: 'string', format: 'uuid', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

const UNLINK_ALLOCATION_REQUEST_SCHEMA: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['reasonCode'],
  properties: {
    reasonCode: { type: 'string', enum: [...BILLING_ALLOCATION_UNLINK_REASONS] },
  },
};

const PAYMENT_RESPONSE_SCHEMA: SchemaObject = {
  type: 'object',
  required: ['data'],
  properties: {
    data: {
      type: 'object',
      required: [
        'id',
        'tenantId',
        'subscriberId',
        'method',
        'amount',
        'paidAt',
        'idempotencyKey',
        'status',
        'createdBy',
        'createdAt',
      ],
      properties: {
        id: { type: 'string', format: 'uuid' },
        tenantId: { type: 'string', format: 'uuid' },
        subscriberId: { type: 'string', format: 'uuid' },
        subscriberDisplayName: { type: 'string', nullable: true },
        subscriberProtected: { type: 'boolean' },
        method: {
          type: 'string',
          enum: ['EFECTIVO', 'TRANSFERENCIA', 'CONSIGNACION', 'DATAFONO', 'OTRO'],
        },
        amount: { type: 'string' },
        paidAt: { type: 'string', format: 'date' },
        reference: { type: 'string', nullable: true },
        note: { type: 'string', nullable: true },
        idempotencyKey: { type: 'string' },
        status: { type: 'string', enum: ['REGISTRADO', 'ANULADO'] },
        voidReasonCode: {
          type: 'string',
          enum: ['ERROR_DE_REGISTRO', 'PAGO_RECHAZADO', 'DUPLICADO'],
          nullable: true,
        },
        voidNote: { type: 'string', nullable: true },
        voidedAt: { type: 'string', format: 'date-time', nullable: true },
        voidedBy: { type: 'string', format: 'uuid', nullable: true },
        allocatedAmount: { type: 'string' },
        unallocatedAmount: { type: 'string' },
        allocations: { type: 'array', items: ALLOCATION_RESPONSE_SCHEMA },
        withholdingAmount: { type: 'string' },
        withholdings: { type: 'array', items: WITHHOLDING_RESPONSE_SCHEMA },
        receiptNumber: {
          type: 'integer',
          minimum: 1,
          nullable: true,
          description:
            'Consecutivo del recibo por tenant; inmutable, se conserva al anular. Nulo en un pago importado.',
        },
        imported: { type: 'boolean', description: 'El pago proviene de una importación.' },
        externalId: {
          type: 'string',
          nullable: true,
          description: 'Referencia del sistema de origen de un pago importado (uisp:...).',
        },
      },
    },
  },
};

const REGISTER_PAYMENT_REQUEST_SCHEMA: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['subscriberId', 'method', 'amount', 'paidAt'],
  properties: {
    subscriberId: { type: 'string', format: 'uuid' },
    method: {
      type: 'string',
      enum: ['EFECTIVO', 'TRANSFERENCIA', 'CONSIGNACION', 'DATAFONO', 'OTRO'],
    },
    amount: {
      oneOf: [
        { type: 'number', minimum: 0.01 },
        { type: 'string', pattern: '^\\d{1,12}(\\.\\d{1,2})?$' },
      ],
    },
    paidAt: { type: 'string', format: 'date' },
    reference: { type: 'string', maxLength: 80 },
    note: { type: 'string', maxLength: 500 },
    allocations: { type: 'array', items: { type: 'object', required: ['documentId', 'amount'] } },
    withholdings: {
      type: 'array',
      maxItems: BILLING_WITHHOLDING_MAX_LINES,
      description:
        'Retenciones del cliente: solo titulares agentes de retención (O-23 en el RUT). amount + retenciones se aplica contra el saldo.',
      items: WITHHOLDING_REQUEST_SCHEMA,
    },
  },
};

const PAYMENT_LIST_RESPONSE_SCHEMA: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['data', 'meta'],
  properties: {
    data: { type: 'array', items: PAYMENT_RESPONSE_SCHEMA.properties?.['data'] as SchemaObject },
    meta: { $ref: getSchemaPath(ListMetaDto) },
  },
};

const ALLOCATE_CREDIT_REQUEST_SCHEMA: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['subscriberId', 'allocations'],
  properties: {
    subscriberId: { type: 'string', format: 'uuid' },
    allocations: {
      type: 'array',
      minItems: 1,
      items: { type: 'object', required: ['paymentId', 'documentId', 'amount'] },
    },
  },
};

@ApiTags('billing')
@ApiExtraModels(ListMetaDto)
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('billing')
export class BillingPaymentsController {
  constructor(
    private readonly billingPayments: BillingPaymentsService,
    private readonly effectivePermissionsService: EffectivePermissionsService,
    @Optional() private readonly receipts?: BillingReceiptsService,
  ) {}

  @Post('payments')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SUPPORT, UserRole.SALES, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.BILLING_PAYMENTS_REGISTER)
  @ApiOperation({ summary: 'Registrar un pago del suscriptor' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, schema: { type: 'string', maxLength: 80 } })
  @ApiBody({ schema: REGISTER_PAYMENT_REQUEST_SCHEMA })
  @ApiCreatedResponse({
    description: 'Pago registrado o repetición idempotente.',
    schema: PAYMENT_RESPONSE_SCHEMA,
  })
  @ApiBadRequestResponse({ description: 'Falta la cabecera Idempotency-Key.' })
  @ApiConflictResponse({ description: 'Titular anonimizado o clave idempotente reutilizada.' })
  @ApiUnprocessableEntityResponse({
    description:
      'El pago, sus asignaciones o sus retenciones no son válidos (BILLING_WITHHOLDING_NOT_ALLOWED, BILLING_WITHHOLDING_NOT_ATTRIBUTABLE, BILLING_WITHHOLDING_DUPLICATE, BILLING_WITHHOLDING_BASE_EXCEEDS_SUBTOTAL, BILLING_WITHHOLDING_RATE_ABOVE_CEILING).',
  })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({ description: 'El rol o permiso no permite registrar pagos.' })
  async register(
    @Body() body: unknown,
    @Headers('Idempotency-Key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!key || !key.trim())
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Falta el identificador de la operación. Recarga la página e intenta de nuevo.',
      });
    const actor = actorId(request);
    const { permissions, readAccess } = await this.readAccess(actor);
    return {
      data: await this.billingPayments.registerPayment(body, key, actor, {
        readAccess,
        // H-1 (c): superar el tope de tarifa equivale a condonar; exige el permiso de cortesías.
        canExceedWithholdingRate: permissions.has(AccessPermissionKey.BILLING_COURTESIES_MANAGE),
      }),
    };
  }

  /**
   * H-2: lectura de datos bloqueados del titular, igual que el listado y el estado de cuenta.
   * Un lector sin PRIVACY_READ ni CRM_BLOCKED_DATA_READ recibe el texto libre redactado.
   */
  private async readAccess(
    actor: string,
  ): Promise<{ permissions: Set<string>; readAccess: PaymentReadAccess }> {
    const permissions = new Set<string>(
      await this.effectivePermissionsService.getEffectivePermissionsForUser(actor),
    );
    const grantedBy = permissions.has(AccessPermissionKey.PRIVACY_READ)
      ? 'PRIVACY_READ'
      : permissions.has(AccessPermissionKey.CRM_BLOCKED_DATA_READ)
        ? 'CRM_BLOCKED_DATA_READ'
        : undefined;
    return {
      permissions,
      readAccess: {
        actorId: actor,
        canSeeBlocked: grantedBy !== undefined,
        ...(grantedBy ? { grantedBy } : {}),
      },
    };
  }

  @Get('payments')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SUPPORT, UserRole.SALES, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.BILLING_PAYMENTS_READ)
  @ApiOperation({ summary: 'Consultar pagos registrados' })
  @ApiQuery({ name: 'page', required: false, schema: { type: 'integer', minimum: 1 } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  })
  @ApiOkResponse({
    description: 'Pagos paginados del tenant.',
    schema: PAYMENT_LIST_RESPONSE_SCHEMA,
  })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({ description: 'El rol o permiso no permite consultar pagos.' })
  @ApiBadRequestResponse({ description: 'La paginación no es válida.' })
  @ApiResponse({
    status: 503,
    description: 'No fue posible auditar el acceso a datos protegidos.',
  })
  async list(
    @Query(new ZodValidationPipe(PaymentListQuerySchema))
    query: z.infer<typeof PaymentListQuerySchema>,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = actorId(request);
    const permissions = new Set(
      await this.effectivePermissionsService.getEffectivePermissionsForUser(actor),
    );
    const grantedBy = permissions.has(AccessPermissionKey.PRIVACY_READ)
      ? 'PRIVACY_READ'
      : permissions.has(AccessPermissionKey.CRM_BLOCKED_DATA_READ)
        ? 'CRM_BLOCKED_DATA_READ'
        : undefined;
    return this.billingPayments.listPayments(query, {
      actorId: actor,
      canSeeBlocked: grantedBy !== undefined,
      ...(grantedBy ? { grantedBy } : {}),
    });
  }

  @Get('payments/:id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SUPPORT, UserRole.SALES, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.BILLING_PAYMENTS_READ)
  @ApiOperation({ summary: 'Consultar un pago' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ description: 'Detalle del pago.', schema: PAYMENT_RESPONSE_SCHEMA })
  @ApiNotFoundResponse({ description: 'No se encontró el pago.' })
  @ApiResponse({
    status: 503,
    description: 'No fue posible verificar o auditar el acceso a datos protegidos.',
  })
  async get(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: AuthenticatedRequest) {
    const { readAccess } = await this.readAccess(actorId(request));
    return { data: await this.billingPayments.getPayment(id, readAccess) };
  }

  @Post('payments/:id/allocations')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SUPPORT, UserRole.SALES, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.BILLING_PAYMENTS_REGISTER)
  @ApiOperation({ summary: 'Aplicar saldo a favor del pago a documentos emitidos' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ schema: ALLOCATE_CREDIT_REQUEST_SCHEMA })
  @ApiOkResponse({ description: 'Aplicaciones guardadas.', schema: PAYMENT_RESPONSE_SCHEMA })
  @ApiConflictResponse({ description: 'El titular está anonimizado o el pago está anulado.' })
  @ApiUnprocessableEntityResponse({ description: 'La asignación supera el saldo disponible.' })
  async allocate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = actorId(request);
    const { readAccess } = await this.readAccess(actor);
    return { data: await this.billingPayments.allocateCredit(id, body, actor, readAccess) };
  }

  @Post('payments/:id/void')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SUPPORT, UserRole.SALES, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.BILLING_PAYMENTS_REGISTER)
  @ApiOperation({ summary: 'Anular un pago registrado' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ description: 'Pago anulado.', schema: PAYMENT_RESPONSE_SCHEMA })
  @ApiConflictResponse({ description: 'El pago ya está anulado.' })
  async void(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = actorId(request);
    const { readAccess } = await this.readAccess(actor);
    return { data: await this.billingPayments.voidPayment(id, body, actor, readAccess) };
  }

  @Post('payments/:id/allocations/:allocationId/unlink')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SUPPORT, UserRole.SALES, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.BILLING_PAYMENTS_REGISTER)
  @ApiOperation({
    summary: 'Desasociar un pago de un documento sin anularlo',
    description:
      'El valor de la aplicación vuelve al saldo a favor del pago y puede aplicarse de nuevo con POST payments/{id}/allocations. Auditado.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'allocationId', format: 'uuid' })
  @ApiBody({ schema: UNLINK_ALLOCATION_REQUEST_SCHEMA })
  @ApiOkResponse({ description: 'Aplicación desasociada.', schema: PAYMENT_RESPONSE_SCHEMA })
  @ApiNotFoundResponse({
    description: 'BILLING_PAYMENT_NOT_FOUND o BILLING_ALLOCATION_NOT_FOUND (no vigente).',
  })
  @ApiConflictResponse({
    description:
      'BILLING_PAYMENT_VOIDED, PRIVACY_TITULAR_ANONYMIZED o BILLING_ALLOCATION_NOT_UNLINKABLE (documento anulado o importado).',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'VALIDATION_ERROR o BILLING_ALLOCATION_HAS_WITHHOLDING (retención vigente sobre el documento: anular el pago).',
  })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({ description: 'El rol o permiso no permite desasociar pagos.' })
  async unlink(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('allocationId', new ParseUUIDPipe()) allocationId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = actorId(request);
    const { readAccess } = await this.readAccess(actor);
    return {
      data: await this.billingPayments.unlinkAllocation(id, allocationId, body, actor, readAccess),
    };
  }

  @Get('payments/:id/receipt/pdf')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SUPPORT, UserRole.SALES, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.BILLING_PAYMENTS_READ)
  @ApiOperation({
    summary: 'Descargar el recibo del pago en PDF',
    description:
      'Recibo numerado con facturas cubiertas, retenciones vigentes y saldo a favor; marca ANULADO si el pago se anuló. Un pago importado no tiene recibo.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiProduces('application/pdf')
  @ApiOkResponse({
    description: 'Recibo de pago PDF (attachment; filename="recibo-<n>.pdf").',
    content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } },
  })
  @ApiNotFoundResponse({ description: 'BILLING_PAYMENT_NOT_FOUND (incluye titular anonimizado).' })
  @ApiConflictResponse({ description: 'BILLING_RECEIPT_NOT_AVAILABLE (pago importado).' })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({ description: 'El rol o permiso no permite consultar pagos.' })
  @ApiResponse({
    status: 503,
    description: 'No fue posible verificar o auditar el acceso a datos protegidos.',
  })
  async receiptPdf(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    if (!this.receipts) {
      throw new ServiceUnavailableException({
        code: 'BILLING_RECEIPT_UNAVAILABLE',
        message: 'El recibo no está disponible.',
      });
    }
    const { readAccess } = await this.readAccess(actorId(request));
    const receipt = await this.receipts.receiptPdf(id, readAccess);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Disposition', `attachment; filename="${receipt.filename}"`);
    response.send(receipt.content);
  }

  @Get('subscribers/:subscriberId/statement')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SUPPORT, UserRole.SALES, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.BILLING_INVOICES_READ)
  @ApiOperation({ summary: 'Consultar el estado de cuenta consolidado del suscriptor' })
  @ApiParam({ name: 'subscriberId', format: 'uuid' })
  @ApiResponse({
    status: 503,
    description: 'No fue posible verificar o auditar el acceso a datos protegidos.',
  })
  @ApiNotFoundResponse({ description: 'No se encontró el suscriptor.' })
  async statement(
    @Param('subscriberId', new ParseUUIDPipe()) subscriberId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = actorId(request);
    const permissions = new Set(
      await this.effectivePermissionsService.getEffectivePermissionsForUser(actor),
    );
    const grantedBy = permissions.has(AccessPermissionKey.PRIVACY_READ)
      ? 'PRIVACY_READ'
      : permissions.has(AccessPermissionKey.CRM_BLOCKED_DATA_READ)
        ? 'CRM_BLOCKED_DATA_READ'
        : undefined;
    return {
      data: await this.billingPayments.statementForSubscriber(subscriberId, actor, {
        canSeeBlocked: grantedBy !== undefined,
        ...(grantedBy ? { grantedBy } : {}),
      }),
    };
  }
}
