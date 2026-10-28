import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiExtension,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
  getSchemaPath,
  type ApiResponseOptions,
} from '@nestjs/swagger';
import { z } from 'zod';
import {
  AccessPermissionKey,
  CertifyProvisioningBodySchema,
  ReleaseProvisioningBodySchema,
  RegularizeProvisioningBodySchema,
  ReserveProvisioningBodySchema,
  UserRole,
  type CertifyProvisioningBody,
  type ReleaseProvisioningBody,
  type RegularizeProvisioningBody,
  type ReserveProvisioningBody,
} from '@iwana/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { Permissions } from '../access-control/decorators/permissions.decorator';
import { AuditOmitResponseFields } from '../audit/decorators/audit-omit-response-fields.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { TenantAwareThrottlerGuard } from '../tasks/guards/tenant-aware-throttler.guard';
import { NetworkTenantGuard } from './guards/network-tenant.guard';
import { ServiceProvisioningService } from './service-provisioning.service';
import {
  NetworkErrorResponseDto,
  NestBadRequestResponseDto,
  ProvisioningInboxListResponseDto,
  ProvisioningMetaResponseDto,
  ProvisioningOrderContextResponseDto,
  ReserveProvisioningBodyDto,
  RegularizeProvisioningBodyDto,
  CertifyProvisioningBodyDto,
  ReleaseProvisioningBodyDto,
  ServiceProvisioningResponseDto,
  TechnicianProvisioningViewResponseDto,
  UnauthorizedResponseDto,
} from './dto/network-interfaces.dto';

const PROVISIONING_AUDIT_OMITTED_RESPONSE_FIELDS = [
  'cidr',
  'displayLabel',
  'ip',
  'name',
  'regularizationReason',
  'releaseReason',
  'routerInstruction',
  'subscriberId',
] as const;

function apiErrorResponse(status: number, description: string, codes: string[]) {
  const codedErrorSchema = {
    allOf: [
      { $ref: getSchemaPath(NetworkErrorResponseDto) },
      {
        type: 'object',
        required: ['code'],
        properties: { code: { type: 'string', enum: codes } },
      },
    ],
  };
  return ApiResponse({
    status,
    description,
    schema:
      status === 400
        ? { oneOf: [codedErrorSchema, { $ref: getSchemaPath(NestBadRequestResponseDto) }] }
        : codedErrorSchema,
    'x-error-codes': codes,
  } as unknown as ApiResponseOptions);
}

function badRequestResponse(description: string) {
  return ApiResponse({
    status: 400,
    description,
    schema: { $ref: getSchemaPath(NestBadRequestResponseDto) },
  });
}

function forbiddenResponse() {
  return apiErrorResponse(403, 'La acción no está autorizada.', ['FORBIDDEN']);
}

const InboxQuerySchema = z
  .object({
    queue: z.enum(['IN_EXECUTION', 'FAILED', 'CLOSED_UNPROVISIONED']),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
type InboxQuery = z.infer<typeof InboxQuerySchema>;

@ApiTags('network-provisioning')
@ApiBearerAuth('access-token')
@ApiExtraModels(
  NetworkErrorResponseDto,
  NestBadRequestResponseDto,
  ProvisioningMetaResponseDto,
  ProvisioningInboxListResponseDto,
  ProvisioningOrderContextResponseDto,
  ReserveProvisioningBodyDto,
  RegularizeProvisioningBodyDto,
  CertifyProvisioningBodyDto,
  ReleaseProvisioningBodyDto,
  ServiceProvisioningResponseDto,
  TechnicianProvisioningViewResponseDto,
  UnauthorizedResponseDto,
)
@ApiResponse({
  status: 401,
  description: 'Se requiere autenticación válida y un contexto de empresa autenticado.',
  schema: { $ref: getSchemaPath(UnauthorizedResponseDto) },
})
@Controller('network/provisioning')
@UseGuards(JwtAuthGuard, NetworkTenantGuard, TenantAwareThrottlerGuard, RolesGuard)
export class NetworkProvisioningController {
  constructor(private readonly serviceProvisioningService: ServiceProvisioningService) {}

  @Get('meta')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_PROVISIONING_READ)
  @ApiOperation({
    operationId: 'Mod13ProvisioningMeta',
    summary: 'Consultar el estado de pausa de aprovisionamiento',
    description:
      'Devuelve únicamente reservationsPaused. El control server-side sigue siendo autoritativo para reserva, replay y regularización.',
  })
  @ApiExtension('x-required-roles', { anyOf: [UserRole.ADMIN, UserRole.NOC] })
  @ApiExtension('x-required-permissions', {
    allOf: [AccessPermissionKey.NETWORK_PROVISIONING_READ],
  })
  @ApiOkResponse({
    description: 'Metadato mínimo de aprovisionamiento.',
    type: ProvisioningMetaResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'La sesión o el contexto de empresa no son válidos.',
    schema: { $ref: getSchemaPath(UnauthorizedResponseDto) },
  })
  @forbiddenResponse()
  getProvisioningMeta(@CurrentUser() actor: JwtPayload) {
    return this.serviceProvisioningService.getProvisioningMeta(actor);
  }

  @Post('reserve')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_PROVISIONING_EXECUTE)
  @ApiOperation({ summary: 'Reservar una dirección IP para una instalación' })
  @ApiExtension('x-required-roles', { anyOf: [UserRole.ADMIN, UserRole.NOC] })
  @ApiExtension('x-required-permissions', {
    allOf: [AccessPermissionKey.NETWORK_PROVISIONING_EXECUTE],
  })
  @ApiBody({ type: ReserveProvisioningBodyDto })
  @ApiCreatedResponse({
    description: 'Aprovisionamiento reservado con instrucción de router.',
    type: ServiceProvisioningResponseDto,
  })
  @apiErrorResponse(400, 'Error de validación de la solicitud.', ['VALIDATION_ERROR'])
  @forbiddenResponse()
  @apiErrorResponse(404, 'La referencia no está disponible para esta operación.', [
    'RESOURCE_NOT_FOUND',
  ])
  @apiErrorResponse(409, 'Conflicto de dominio durante la reserva.', [
    'RESERVATIONS_PAUSED',
    'NETWORK_POOL_EXHAUSTED',
    'IP_OUTSIDE_RANGE',
    'IP_IS_GATEWAY',
    'IP_EXCLUDED',
    'IP_PROTECTED_BY_INFRASTRUCTURE',
    'IP_IN_USE',
    'CONTROL_METHOD_NOT_SUPPORTED',
  ])
  @apiErrorResponse(422, 'La orden o la red no son elegibles para aprovisionamiento.', [
    'PROVISIONING_ORDER_NOT_ELIGIBLE',
    'PROVISIONING_TECHNICIAN_REQUIRED',
    'CONTRACT_NOT_OF_SUBSCRIBER',
    'NETWORK_NOT_IN_ROUTER',
  ])
  @AuditOmitResponseFields(...PROVISIONING_AUDIT_OMITTED_RESPONSE_FIELDS)
  reserve(
    @Body(new ZodValidationPipe(ReserveProvisioningBodySchema)) body: ReserveProvisioningBody,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.serviceProvisioningService.reserve(body, actor);
  }

  @Post('regularize')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_PROVISIONING_REGULARIZE)
  @ApiOperation({ summary: 'Regularizar el aprovisionamiento de una instalación ejecutada' })
  @ApiExtension('x-required-roles', { anyOf: [UserRole.ADMIN, UserRole.NOC] })
  @ApiExtension('x-required-permissions', {
    allOf: [AccessPermissionKey.NETWORK_PROVISIONING_REGULARIZE],
  })
  @ApiBody({ type: RegularizeProvisioningBodyDto })
  @ApiCreatedResponse({
    description: 'Servicio regularizado y activado.',
    type: ServiceProvisioningResponseDto,
  })
  @apiErrorResponse(400, 'Error de validación de la solicitud.', ['VALIDATION_ERROR'])
  @apiErrorResponse(403, 'El actor no puede regularizar esta orden.', [
    'FORBIDDEN',
    'PROVISIONING_CERTIFIER_IS_EXECUTOR',
  ])
  @apiErrorResponse(404, 'La referencia no está disponible para esta operación.', [
    'RESOURCE_NOT_FOUND',
  ])
  @apiErrorResponse(409, 'Conflicto de dominio durante la regularización.', [
    'RESERVATIONS_PAUSED',
    'PROVISIONING_ALREADY_ACTIVE',
    'PROVISIONING_STATE_INVALID',
    'IP_PROTECTED_BY_INFRASTRUCTURE',
    'CONTROL_METHOD_NOT_SUPPORTED',
    'IP_IN_USE',
  ])
  @apiErrorResponse(422, 'La orden o la red cerrada no son elegibles.', [
    'PROVISIONING_ORDER_NOT_ELIGIBLE',
    'PROVISIONING_TECHNICIAN_REQUIRED',
    'CONTRACT_NOT_OF_SUBSCRIBER',
    'NETWORK_NOT_IN_ROUTER',
  ])
  @AuditOmitResponseFields(...PROVISIONING_AUDIT_OMITTED_RESPONSE_FIELDS)
  regularize(
    @Body(new ZodValidationPipe(RegularizeProvisioningBodySchema)) body: RegularizeProvisioningBody,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.serviceProvisioningService.regularize(body, actor);
  }

  @Post(':id/certify')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_PROVISIONING_CERTIFY)
  @ApiOperation({ summary: 'Certificar el aprovisionamiento con evidencia' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiExtension('x-required-roles', { anyOf: [UserRole.ADMIN, UserRole.NOC] })
  @ApiExtension('x-required-permissions', {
    allOf: [AccessPermissionKey.NETWORK_PROVISIONING_CERTIFY],
  })
  @ApiBody({ type: CertifyProvisioningBodyDto })
  @ApiOkResponse({
    description: 'Aprovisionamiento certificado.',
    type: ServiceProvisioningResponseDto,
  })
  @apiErrorResponse(400, 'Error de validación de la solicitud.', ['VALIDATION_ERROR'])
  @apiErrorResponse(403, 'El actor no está autorizado para certificar esta orden.', [
    'FORBIDDEN',
    'PROVISIONING_CERTIFIER_IS_EXECUTOR',
  ])
  @apiErrorResponse(404, 'La referencia no está disponible para esta operación.', [
    'RESOURCE_NOT_FOUND',
  ])
  @apiErrorResponse(409, 'El estado o la versión cambió antes de certificar.', [
    'VERSION_CONFLICT',
    'PROVISIONING_STATE_INVALID',
  ])
  @apiErrorResponse(422, 'La orden o la evidencia no son elegibles.', [
    'PROVISIONING_ORDER_NOT_ELIGIBLE',
    'PROVISIONING_TECHNICIAN_REQUIRED',
    'PROVISIONING_EVIDENCE_REQUIRED',
  ])
  @AuditOmitResponseFields(...PROVISIONING_AUDIT_OMITTED_RESPONSE_FIELDS)
  certify(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(CertifyProvisioningBodySchema)) body: CertifyProvisioningBody,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.serviceProvisioningService.certify(id, body, actor);
  }

  @Post(':id/release')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_PROVISIONING_EXECUTE)
  @ApiOperation({ summary: 'Liberar una reserva o certificación' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiExtension('x-required-roles', { anyOf: [UserRole.ADMIN, UserRole.NOC] })
  @ApiExtension('x-required-permissions', {
    allOf: [AccessPermissionKey.NETWORK_PROVISIONING_EXECUTE],
  })
  @ApiBody({ type: ReleaseProvisioningBodyDto })
  @ApiOkResponse({
    description: 'Aprovisionamiento liberado.',
    type: ServiceProvisioningResponseDto,
  })
  @apiErrorResponse(400, 'Error de validación de la solicitud.', ['VALIDATION_ERROR'])
  @apiErrorResponse(403, 'Liberar una certificación requiere permiso de certificar.', ['FORBIDDEN'])
  @apiErrorResponse(404, 'La referencia no está disponible para esta operación.', [
    'RESOURCE_NOT_FOUND',
  ])
  @apiErrorResponse(409, 'El estado o la versión cambió antes de liberar.', [
    'VERSION_CONFLICT',
    'PROVISIONING_STATE_INVALID',
  ])
  @apiErrorResponse(422, 'La orden o la red no son elegibles para liberación.', [
    'PROVISIONING_ORDER_NOT_ELIGIBLE',
    'NETWORK_NOT_IN_ROUTER',
  ])
  @AuditOmitResponseFields(...PROVISIONING_AUDIT_OMITTED_RESPONSE_FIELDS)
  release(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ReleaseProvisioningBodySchema)) body: ReleaseProvisioningBody,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.serviceProvisioningService.release(id, body, actor);
  }

  @Get('inbox')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_PROVISIONING_READ)
  @ApiOperation({ summary: 'Listar la bandeja de aprovisionamiento' })
  @ApiExtension('x-required-roles', { anyOf: [UserRole.ADMIN, UserRole.NOC] })
  @ApiExtension('x-required-permissions', {
    allOf: [AccessPermissionKey.NETWORK_PROVISIONING_READ],
  })
  @ApiQuery({
    name: 'queue',
    required: true,
    enum: ['IN_EXECUTION', 'FAILED', 'CLOSED_UNPROVISIONED'],
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number, maximum: 100 })
  @ApiOkResponse({
    description: 'Página de órdenes para la cola seleccionada.',
    type: ProvisioningInboxListResponseDto,
  })
  @apiErrorResponse(400, 'Error de validación de la consulta.', ['VALIDATION_ERROR'])
  @forbiddenResponse()
  listInbox(
    @Query(new ZodValidationPipe(InboxQuerySchema)) query: InboxQuery,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.serviceProvisioningService.listInbox(query, actor);
  }

  @Get('subscribers/:subscriberId')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_PROVISIONING_READ)
  @ApiOperation({ summary: 'Consultar servicios aprovisionados de un suscriptor' })
  @ApiParam({ name: 'subscriberId', format: 'uuid' })
  @ApiExtension('x-required-roles', { anyOf: [UserRole.ADMIN, UserRole.NOC] })
  @ApiExtension('x-required-permissions', {
    allOf: [AccessPermissionKey.NETWORK_PROVISIONING_READ],
  })
  @ApiOkResponse({
    description: 'Servicios ordenados del más reciente al más antiguo.',
    type: ServiceProvisioningResponseDto,
    isArray: true,
  })
  @badRequestResponse('El identificador de suscriptor no es válido.')
  @forbiddenResponse()
  listSubscriberProvisionings(
    @Param('subscriberId', ParseUUIDPipe) subscriberId: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.serviceProvisioningService.listSubscriberProvisionings(subscriberId, actor);
  }

  @Get('orders/:executionOrderId/context')
  @ApiOperation({ summary: 'Consultar el contexto de aprovisionamiento de una orden' })
  @ApiParam({ name: 'executionOrderId', format: 'uuid' })
  @ApiExtension('x-required-permissions', {
    anyOf: [
      AccessPermissionKey.NETWORK_PROVISIONING_READ,
      AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
    ],
  })
  @ApiOkResponse({
    description: 'Proyección NOC o proyección reducida del técnico asignado.',
    schema: {
      oneOf: [
        { $ref: getSchemaPath(ProvisioningOrderContextResponseDto) },
        { $ref: getSchemaPath(TechnicianProvisioningViewResponseDto) },
      ],
    },
  })
  @badRequestResponse('El identificador de orden no es válido.')
  @forbiddenResponse()
  @ApiResponse({
    status: 404,
    description: 'La orden no existe o no está disponible para este ámbito.',
    schema: {
      allOf: [
        { $ref: getSchemaPath(NetworkErrorResponseDto) },
        {
          type: 'object',
          required: ['code'],
          properties: { code: { type: 'string', enum: ['RESOURCE_NOT_FOUND'] } },
        },
      ],
    },
    'x-error-codes': ['RESOURCE_NOT_FOUND'],
  } as unknown as ApiResponseOptions)
  @ApiResponse({
    status: 409,
    description: 'La pausa activa impide reemitir instrucciones para el aprovisionamiento.',
    schema: {
      allOf: [
        { $ref: getSchemaPath(NetworkErrorResponseDto) },
        {
          type: 'object',
          required: ['code'],
          properties: { code: { type: 'string', enum: ['RESERVATIONS_PAUSED'] } },
        },
      ],
    },
    'x-error-codes': ['RESERVATIONS_PAUSED'],
    'x-error-conditions': {
      RESERVATIONS_PAUSED:
        'La pausa está activa y el contexto completo volvería a emitir instrucciones para una asignación no liberada; la proyección reducida del técnico no las emite.',
    },
  } as unknown as ApiResponseOptions)
  getOrderContext(
    @Param('executionOrderId', ParseUUIDPipe) executionOrderId: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.serviceProvisioningService.getOrderContext(executionOrderId, actor);
  }
}
