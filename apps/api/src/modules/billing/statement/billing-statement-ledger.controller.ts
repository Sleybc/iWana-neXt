import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import type { Response } from 'express';
import {
  AccessPermissionKey,
  BILLING_PAYMENT_METHODS,
  BILLING_STATEMENT_LEDGER_ROW_KINDS,
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
import {
  BillingStatementLedgerService,
  type LedgerReadAccess,
} from './billing-statement-ledger.service';

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
const MONEY_SCHEMA: SchemaObject = { type: 'string', pattern: '^\\d{1,12}(\\.\\d{1,2})?$' };
const SIGNED_MONEY_SCHEMA: SchemaObject = {
  type: 'string',
  pattern: '^-?\\d{1,12}(\\.\\d{1,2})?$',
  description: 'Cargos − abonos; negativo es saldo a favor del titular.',
};

/** Espejo OpenAPI de `BillingStatementLedgerSchema` (packages/shared billing-accounts.contract.ts). */
export const STATEMENT_LEDGER_RESPONSE_SCHEMA: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: {
    data: {
      type: 'object',
      additionalProperties: false,
      required: [
        'subscriberId',
        'from',
        'to',
        'openingBalance',
        'closingBalance',
        'buyerProtected',
        'rows',
      ],
      properties: {
        subscriberId: { type: 'string', format: 'uuid' },
        from: { ...CIVIL_DATE_SCHEMA, nullable: true },
        to: CIVIL_DATE_SCHEMA,
        openingBalance: SIGNED_MONEY_SCHEMA,
        closingBalance: {
          ...SIGNED_MONEY_SCHEMA,
          description: 'Sin filtro es totalPending − creditBalance del estado de cuenta.',
        },
        buyerProtected: { type: 'boolean' },
        rows: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'kind',
              'date',
              'reference',
              'debit',
              'credit',
              'balance',
              'documentId',
              'paymentId',
              'dueDate',
            ],
            properties: {
              kind: { type: 'string', enum: [...BILLING_STATEMENT_LEDGER_ROW_KINDS] },
              date: CIVIL_DATE_SCHEMA,
              reference: { type: 'string', nullable: true },
              debit: MONEY_SCHEMA,
              credit: MONEY_SCHEMA,
              balance: SIGNED_MONEY_SCHEMA,
              documentId: { type: 'string', format: 'uuid', nullable: true },
              paymentId: { type: 'string', format: 'uuid', nullable: true },
              dueDate: { ...CIVIL_DATE_SCHEMA, nullable: true },
              late: { type: 'boolean' },
              method: { type: 'string', enum: [...BILLING_PAYMENT_METHODS] },
              receiptNumber: { type: 'integer', minimum: 1, nullable: true },
            },
          },
        },
      },
    },
  },
};

const LEDGER_ROLES = [
  UserRole.ADMIN,
  UserRole.ACCOUNTANT,
  UserRole.SUPPORT,
  UserRole.SALES,
  UserRole.AUDITOR,
] as const;

/**
 * Libro del estado de cuenta y su PDF (spec MOD05↔MOD14 2026-11-13 D4, D7, CA-2). Extiende de
 * forma aditiva `GET billing/subscribers/:subscriberId/statement`.
 */
@ApiTags('billing')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('billing')
export class BillingStatementLedgerController {
  constructor(
    private readonly ledgers: BillingStatementLedgerService,
    private readonly effectivePermissionsService: EffectivePermissionsService,
  ) {}

  @Get('subscribers/:subscriberId/statement/ledger')
  @Roles(...LEDGER_ROLES)
  @Permissions(AccessPermissionKey.BILLING_INVOICES_READ)
  @ApiOperation({
    summary: 'Consultar el libro del estado de cuenta con saldo corrido',
    description:
      'Filas cronológicas (documentos, cortesías, pagos, retenciones y anulaciones) con su efecto en el saldo. Con `from`, la primera fila es el saldo anterior.',
  })
  @ApiParam({ name: 'subscriberId', format: 'uuid' })
  @ApiQuery({ name: 'from', required: false, schema: CIVIL_DATE_SCHEMA })
  @ApiQuery({
    name: 'to',
    required: false,
    schema: CIVIL_DATE_SCHEMA,
    description: 'Por defecto, hoy en la zona del tenant.',
  })
  @ApiOkResponse({
    description: 'Libro del estado de cuenta.',
    schema: STATEMENT_LEDGER_RESPONSE_SCHEMA,
  })
  @ApiBadRequestResponse({ description: 'Fechas no válidas o `from` posterior a `to`.' })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({
    description: 'El rol o permiso no permite consultar el estado de cuenta.',
  })
  @ApiNotFoundResponse({ description: 'No se encontró el suscriptor.' })
  @ApiResponse({
    status: 503,
    description: 'No fue posible verificar o auditar el acceso a datos protegidos.',
  })
  async ledger(
    @Param('subscriberId', new ParseUUIDPipe()) subscriberId: string,
    @Query(new ZodValidationPipe(BillingStatementLedgerQuerySchema))
    query: BillingStatementLedgerQuery,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = actorId(request);
    return {
      data: await this.ledgers.ledger(subscriberId, query, actor, await this.readAccess(actor)),
    };
  }

  @Get('subscribers/:subscriberId/statement/ledger/pdf')
  @Roles(...LEDGER_ROLES)
  @Permissions(AccessPermissionKey.BILLING_INVOICES_READ)
  @ApiOperation({ summary: 'Descargar el PDF del libro del estado de cuenta' })
  @ApiParam({ name: 'subscriberId', format: 'uuid' })
  @ApiQuery({ name: 'from', required: false, schema: CIVIL_DATE_SCHEMA })
  @ApiQuery({ name: 'to', required: false, schema: CIVIL_DATE_SCHEMA })
  @ApiProduces('application/pdf')
  @ApiOkResponse({
    description: 'Estado de cuenta en PDF.',
    content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } },
  })
  @ApiBadRequestResponse({ description: 'Fechas no válidas o `from` posterior a `to`.' })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({
    description: 'El rol o permiso no permite consultar el estado de cuenta.',
  })
  @ApiNotFoundResponse({ description: 'No se encontró el suscriptor.' })
  @ApiResponse({
    status: 503,
    description: 'No fue posible verificar o auditar el acceso a datos protegidos.',
  })
  async ledgerPdf(
    @Param('subscriberId', new ParseUUIDPipe()) subscriberId: string,
    @Query(new ZodValidationPipe(BillingStatementLedgerQuerySchema))
    query: BillingStatementLedgerQuery,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    const actor = actorId(request);
    const pdf = await this.ledgers.ledgerPdf(
      subscriberId,
      query,
      actor,
      await this.readAccess(actor),
    );
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Disposition', `attachment; filename="${pdf.filename}"`);
    response.send(pdf.content);
  }

  /** Mismo criterio que el estado de cuenta: PRIVACY_READ o CRM_BLOCKED_DATA_READ. */
  private async readAccess(actor: string): Promise<LedgerReadAccess> {
    const permissions = new Set<string>(
      await this.effectivePermissionsService.getEffectivePermissionsForUser(actor),
    );
    const grantedBy = permissions.has(AccessPermissionKey.PRIVACY_READ)
      ? 'PRIVACY_READ'
      : permissions.has(AccessPermissionKey.CRM_BLOCKED_DATA_READ)
        ? 'CRM_BLOCKED_DATA_READ'
        : undefined;
    return { canSeeBlocked: grantedBy !== undefined, ...(grantedBy ? { grantedBy } : {}) };
  }
}
