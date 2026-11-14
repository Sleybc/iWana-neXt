import {
  Body,
  Controller,
  Headers,
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
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  AccessPermissionKey,
  BILLING_COURTESY_APPLICATIONS,
  BILLING_COURTESY_REASONS,
  BILLING_COURTESY_STATUSES,
  BILLING_COURTESY_TARGETS,
  BILLING_COURTESY_VOID_REASONS,
  GrantCourtesyCommandSchema,
  UserRole,
  VoidCourtesyCommandSchema,
} from '@iwana/shared';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { Permissions } from '../../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { BillingCourtesiesService } from './billing-courtesies.service';

const MONEY = { type: 'string', pattern: '^\\d{1,12}(\\.\\d{1,2})?$' };
const NULLABLE_UUID = { type: 'string', format: 'uuid', nullable: true };

export const COURTESY_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'documentId',
    'subscriberId',
    'application',
    'target',
    'sourceLineId',
    'lineId',
    'amount',
    'reasonCode',
    'note',
    'status',
    'voidReasonCode',
    'voidNote',
    'voidedAt',
    'voidedBy',
    'createdBy',
    'createdAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    documentId: { type: 'string', format: 'uuid' },
    subscriberId: { type: 'string', format: 'uuid' },
    application: {
      type: 'string',
      enum: [...BILLING_COURTESY_APPLICATIONS],
      description:
        'LINEA_EN_BORRADOR: línea negativa «Cortesía» del borrador. AJUSTE_SOBRE_EMITIDO: abono ' +
        'no monetario que baja el saldo; no es pago ni nota crédito y no cambia la base gravable.',
    },
    target: { type: 'string', enum: [...BILLING_COURTESY_TARGETS] },
    sourceLineId: NULLABLE_UUID,
    lineId: {
      ...NULLABLE_UUID,
      description:
        'Línea negativa del borrador; null en un ajuste sobre emitido y al anular la cortesía ' +
        'de un borrador (la línea se retira).',
    },
    amount: MONEY,
    reasonCode: { type: 'string', enum: [...BILLING_COURTESY_REASONS] },
    note: { type: 'string', nullable: true, maxLength: 500 },
    status: { type: 'string', enum: [...BILLING_COURTESY_STATUSES] },
    voidReasonCode: { type: 'string', enum: [...BILLING_COURTESY_VOID_REASONS], nullable: true },
    voidNote: { type: 'string', nullable: true, maxLength: 500 },
    voidedAt: { type: 'string', format: 'date-time', nullable: true },
    voidedBy: NULLABLE_UUID,
    createdBy: { type: 'string', format: 'uuid' },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

const DATA_COURTESY = {
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: { data: COURTESY_RESPONSE_SCHEMA },
};

type AuthenticatedRequest = { user?: JwtPayload };
function actorId(request: AuthenticatedRequest): string {
  const id = request.user?.sub;
  if (!id)
    throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'La sesión no es válida.' });
  return id;
}

/** Cortesías sobre cobros (spec MOD14 2026-11-12 D4, D5, R4-R6). */
@ApiTags('billing')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('billing')
export class BillingCourtesiesController {
  constructor(private readonly courtesies: BillingCourtesiesService) {}

  @Post('documents/:id/courtesies')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  @Permissions(AccessPermissionKey.BILLING_COURTESIES_MANAGE)
  @ApiOperation({
    summary: 'Otorgar una cortesía sobre una factura',
    description:
      'Sobre un BORRADOR agrega la línea negativa «Cortesía» (por valor o regalando una línea). ' +
      'Sobre un EMITIDO o IMPORTADO registra un ajuste no monetario que baja el saldo pendiente ' +
      'sin superarlo. Un ANULADO no admite cortesías. Queda auditada con su motivo.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', maxLength: 80 },
    description:
      'Reintentar con la misma clave y el mismo cuerpo devuelve la misma cortesía; con otro ' +
      'cuerpo responde 409 IDEMPOTENCY_KEY_REUSED.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['target', 'reasonCode'],
      properties: {
        target: { type: 'string', enum: [...BILLING_COURTESY_TARGETS] },
        amount: {
          oneOf: [{ type: 'number', minimum: 0.01 }, MONEY],
          description: 'Valor con IVA incluido; obligatorio con target VALOR.',
        },
        lineId: {
          type: 'string',
          format: 'uuid',
          description: 'Línea a regalar; obligatoria con target LINEA.',
        },
        reasonCode: { type: 'string', enum: [...BILLING_COURTESY_REASONS] },
        note: {
          type: 'string',
          minLength: 1,
          maxLength: 500,
          description: 'Obligatoria con el motivo OTRO.',
        },
      },
    },
  })
  @ApiCreatedResponse({ description: 'Cortesía registrada.', schema: DATA_COURTESY })
  @ApiBadRequestResponse({ description: 'La solicitud no es válida.' })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({ description: 'El rol o permiso no permite esta acción.' })
  @ApiNotFoundResponse({ description: 'No se encontró la factura.' })
  @ApiConflictResponse({
    description:
      'Documento anulado, línea no elegible o ya regalada, titular anonimizado, la cortesía ' +
      'supera el saldo (BILLING_COURTESY_EXCEEDS_BALANCE) o clave de idempotencia usada con ' +
      'otro contenido (IDEMPOTENCY_KEY_REUSED).',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'Falta la cabecera Idempotency-Key, o cortesía por valor en un borrador con conceptos ' +
      'de IVA distinto.',
  })
  async grant(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('Idempotency-Key') idempotencyKey: string | undefined,
  ) {
    const input = new ZodValidationPipe(GrantCourtesyCommandSchema).transform(body);
    return { data: await this.courtesies.grant(id, input, actorId(request), idempotencyKey) };
  }

  @Post('courtesies/:id/void')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  @Permissions(AccessPermissionKey.BILLING_COURTESIES_MANAGE)
  @ApiOperation({
    summary: 'Anular una cortesía',
    description:
      'Devuelve el saldo del documento (ajuste sobre emitido) o retira la línea del borrador. ' +
      'No aplica a la línea de un borrador ya emitido ni a un documento anulado.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', maxLength: 80 },
    description:
      'Reintentar con la misma clave y el mismo cuerpo devuelve la misma cortesía; con otro ' +
      'cuerpo responde 409 IDEMPOTENCY_KEY_REUSED.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['reasonCode'],
      properties: {
        reasonCode: { type: 'string', enum: [...BILLING_COURTESY_VOID_REASONS] },
        note: { type: 'string', minLength: 1, maxLength: 500 },
      },
    },
  })
  @ApiOkResponse({ description: 'Cortesía anulada.', schema: DATA_COURTESY })
  @ApiBadRequestResponse({ description: 'La solicitud no es válida.' })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({ description: 'El rol o permiso no permite esta acción.' })
  @ApiNotFoundResponse({ description: 'No se encontró la cortesía.' })
  @ApiConflictResponse({
    description:
      'Ya anulada, documento anulado, línea dentro de un documento emitido o clave de ' +
      'idempotencia usada con otro contenido (IDEMPOTENCY_KEY_REUSED).',
  })
  @ApiUnprocessableEntityResponse({ description: 'Falta la cabecera Idempotency-Key.' })
  async void(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('Idempotency-Key') idempotencyKey: string | undefined,
  ) {
    const input = new ZodValidationPipe(VoidCourtesyCommandSchema).transform(body);
    return { data: await this.courtesies.void(id, input, actorId(request), idempotencyKey) };
  }
}
