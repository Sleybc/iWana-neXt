import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import {
  AccessPermissionKey,
  BILLING_EMAIL_KINDS,
  BILLING_EMAIL_REASON_CODES,
  BILLING_EMAIL_STATUSES,
  BillingStatementLedgerQuerySchema,
  UserRole,
  type BillingStatementLedgerQuery,
} from '@iwana/shared';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { Permissions } from '../../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import type { PaymentReadAccess } from '../payments/billing-payments.service';
import { BillingEmailsService } from './billing-emails.service';

type AuthenticatedRequest = { user?: JwtPayload };

function actorId(request: AuthenticatedRequest): string {
  const id = request.user?.sub;
  if (!id)
    throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'La sesión no es válida.' });
  return id;
}

const CIVIL_DATE_SCHEMA: SchemaObject = {
  type: 'string',
  format: 'date',
  pattern: '^\\d{4}-\\d{2}-\\d{2}$',
};

/** Espejo OpenAPI de `BillingEmailLogEntrySchema` (packages/shared billing-emails.contract.ts). */
export const EMAIL_LOG_ENTRY_SCHEMA: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'subscriberId',
    'kind',
    'documentId',
    'paymentId',
    'periodFrom',
    'periodTo',
    'recipientMasked',
    'subject',
    'status',
    'reasonCode',
    'resend',
    'requestedBy',
    'createdAt',
    'processedAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    subscriberId: { type: 'string', format: 'uuid' },
    kind: { type: 'string', enum: [...BILLING_EMAIL_KINDS] },
    documentId: { type: 'string', format: 'uuid', nullable: true },
    paymentId: { type: 'string', format: 'uuid', nullable: true },
    periodFrom: { ...CIVIL_DATE_SCHEMA, nullable: true },
    periodTo: { ...CIVIL_DATE_SCHEMA, nullable: true },
    recipientMasked: {
      type: 'string',
      maxLength: 120,
      nullable: true,
      description: 'Destinatario enmascarado (p. ej. j***@d***.co); nulo en un rechazo.',
    },
    subject: { type: 'string', maxLength: 200 },
    status: { type: 'string', enum: [...BILLING_EMAIL_STATUSES] },
    reasonCode: { type: 'string', enum: [...BILLING_EMAIL_REASON_CODES], nullable: true },
    resend: { type: 'boolean' },
    requestedBy: { type: 'string', format: 'uuid' },
    createdAt: { type: 'string', format: 'date-time' },
    processedAt: { type: 'string', format: 'date-time', nullable: true },
  },
};

const EMAIL_ENTRY_RESPONSE_SCHEMA: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: { data: EMAIL_LOG_ENTRY_SCHEMA },
};

export const EMAIL_LOG_RESPONSE_SCHEMA: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: {
    data: {
      type: 'object',
      additionalProperties: false,
      required: ['subscriberId', 'entries'],
      properties: {
        subscriberId: { type: 'string', format: 'uuid' },
        entries: { type: 'array', maxItems: 200, items: EMAIL_LOG_ENTRY_SCHEMA },
      },
    },
  },
};

const STATEMENT_SEND_REQUEST_SCHEMA: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  properties: {
    from: CIVIL_DATE_SCHEMA,
    to: { ...CIVIL_DATE_SCHEMA, description: 'Sin `to`, el libro llega hasta el día del envío.' },
  },
};

const SEND_DESCRIPTION =
  'Se envía al correo registrado del titular, nunca a uno libre. Con el titular anonimizado o con datos bloqueados la fila queda RECHAZADO / TITULAR_RESTRINGIDO; sin correo, RECHAZADO / SIN_CORREO; en ambos casos no se envía nada. Si ya hay un envío EN_COLA para el mismo destino se devuelve ese (idempotente). Reenviar crea otra fila con resend=true.';

/** Mismos roles que las rutas de pagos vecinas. */
const SEND_ROLES = [
  UserRole.ADMIN,
  UserRole.ACCOUNTANT,
  UserRole.SUPPORT,
  UserRole.SALES,
  UserRole.AUDITOR,
] as const;
/** Mismos roles que las rutas BILLING_INVOICES_MANAGE de documentos. */
const INVOICE_SEND_ROLES = [UserRole.ADMIN, UserRole.ACCOUNTANT] as const;

/**
 * Envíos por correo de Facturación y su registro (spec MOD05↔MOD14 2026-11-13 D5, D9, D10, D11,
 * R4, CA-4, CA-6). Las solicitudes responden 202: el envío lo hace la cola `billing-email-send`.
 */
@ApiTags('billing')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('billing')
export class BillingEmailsController {
  constructor(
    private readonly emails: BillingEmailsService,
    private readonly effectivePermissionsService: EffectivePermissionsService,
  ) {}

  @Post('documents/:id/send')
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles(...INVOICE_SEND_ROLES)
  @Permissions(AccessPermissionKey.BILLING_INVOICES_MANAGE)
  @ApiOperation({
    summary: 'Enviar un documento de cobro emitido al titular',
    description: SEND_DESCRIPTION,
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiAcceptedResponse({ description: 'Envío registrado.', schema: EMAIL_ENTRY_RESPONSE_SCHEMA })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({ description: 'El rol o permiso no permite enviar documentos.' })
  @ApiNotFoundResponse({ description: 'No se encontró el documento o el suscriptor.' })
  @ApiConflictResponse({
    description: 'BILLING_DOCUMENT_NOT_ISSUED o BILLING_EMAIL_IMPORTED_NOT_SENDABLE.',
  })
  @ApiResponse({
    status: 503,
    description: 'BILLING_PRIVACY_UNAVAILABLE o BILLING_EMAIL_QUEUE_UNAVAILABLE.',
  })
  async sendDocument(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return { data: await this.emails.requestDocumentEmail(id, actorId(request)) };
  }

  @Post('payments/:id/receipt/send')
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles(...SEND_ROLES)
  @Permissions(AccessPermissionKey.BILLING_PAYMENTS_REGISTER)
  @ApiOperation({
    summary: 'Enviar el recibo de un pago al titular',
    description: SEND_DESCRIPTION,
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiAcceptedResponse({ description: 'Envío registrado.', schema: EMAIL_ENTRY_RESPONSE_SCHEMA })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({ description: 'El rol o permiso no permite enviar recibos.' })
  @ApiNotFoundResponse({ description: 'No se encontró el pago o el suscriptor.' })
  @ApiConflictResponse({ description: 'BILLING_PAYMENT_VOIDED: el pago está anulado.' })
  @ApiResponse({
    status: 503,
    description: 'BILLING_PRIVACY_UNAVAILABLE o BILLING_EMAIL_QUEUE_UNAVAILABLE.',
  })
  async sendReceipt(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = actorId(request);
    const { readAccess } = await this.access(actor);
    return { data: await this.emails.requestReceiptEmail(id, actor, readAccess) };
  }

  @Post('subscribers/:subscriberId/statement/send')
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles(...INVOICE_SEND_ROLES)
  @Permissions(AccessPermissionKey.BILLING_INVOICES_MANAGE)
  @ApiOperation({ summary: 'Enviar el estado de cuenta al titular', description: SEND_DESCRIPTION })
  @ApiParam({ name: 'subscriberId', format: 'uuid' })
  @ApiBody({ required: false, schema: STATEMENT_SEND_REQUEST_SCHEMA })
  @ApiAcceptedResponse({ description: 'Envío registrado.', schema: EMAIL_ENTRY_RESPONSE_SCHEMA })
  @ApiBadRequestResponse({ description: 'Fechas no válidas o `from` posterior a `to`.' })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({ description: 'El rol o permiso no permite enviar el estado de cuenta.' })
  @ApiNotFoundResponse({ description: 'No se encontró el suscriptor.' })
  @ApiResponse({
    status: 503,
    description: 'BILLING_PRIVACY_UNAVAILABLE o BILLING_EMAIL_QUEUE_UNAVAILABLE.',
  })
  async sendStatement(
    @Param('subscriberId', new ParseUUIDPipe()) subscriberId: string,
    @Body(new ZodValidationPipe(BillingStatementLedgerQuerySchema))
    body: BillingStatementLedgerQuery,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.emails.requestStatementEmail(subscriberId, body, actorId(request)),
    };
  }

  @Get('subscribers/:subscriberId/email-log')
  @Roles(...SEND_ROLES)
  @Permissions(AccessPermissionKey.BILLING_INVOICES_READ)
  @ApiOperation({
    summary: 'Consultar el registro de correos de facturación del titular',
    description:
      'Del más reciente al más antiguo (máximo 200). Los recibos solo se listan con billing.payments.read. Sin texto libre.',
  })
  @ApiParam({ name: 'subscriberId', format: 'uuid' })
  @ApiOkResponse({ description: 'Registro de correos.', schema: EMAIL_LOG_RESPONSE_SCHEMA })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({ description: 'El rol o permiso no permite consultar el registro.' })
  @ApiNotFoundResponse({ description: 'No se encontró el suscriptor.' })
  @ApiResponse({
    status: 503,
    description: 'No fue posible verificar o auditar el acceso a datos protegidos.',
  })
  async emailLog(
    @Param('subscriberId', new ParseUUIDPipe()) subscriberId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = actorId(request);
    const { permissions, readAccess } = await this.access(actor);
    return {
      data: await this.emails.emailLog(subscriberId, actor, {
        canReadReceipts: permissions.has(AccessPermissionKey.BILLING_PAYMENTS_READ),
        readAccess,
      }),
    };
  }

  private async access(
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
}
