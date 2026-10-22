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
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
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
import { PermissionsGuard } from '../access-control/guards/permissions.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { TenantAwareThrottlerGuard } from '../tasks/guards/tenant-aware-throttler.guard';
import { NetworkTenantGuard } from './guards/network-tenant.guard';
import { ServiceProvisioningService } from './service-provisioning.service';

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
@Controller('network/provisioning')
@UseGuards(
  JwtAuthGuard,
  NetworkTenantGuard,
  TenantAwareThrottlerGuard,
  RolesGuard,
  PermissionsGuard,
)
export class NetworkProvisioningController {
  constructor(private readonly serviceProvisioningService: ServiceProvisioningService) {}

  @Post('reserve')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_PROVISIONING_EXECUTE)
  @ApiOperation({ summary: 'Reservar una dirección IP para una instalación' })
  @ApiCreatedResponse({ description: 'Aprovisionamiento reservado con instrucción de router.' })
  @ApiResponse({ status: 422, description: 'La orden no es elegible o no tiene técnico asignado.' })
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
  @ApiCreatedResponse({ description: 'Servicio regularizado y activado.' })
  @ApiResponse({ status: 403, description: 'El actor no puede regularizar esta orden.' })
  @ApiResponse({ status: 409, description: 'La orden ya tiene un servicio activo.' })
  @ApiResponse({ status: 422, description: 'La orden cerrada no es elegible o no tiene técnico.' })
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
  @ApiOkResponse({ description: 'Aprovisionamiento certificado.' })
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
  @ApiOkResponse({ description: 'Aprovisionamiento liberado.' })
  @ApiResponse({
    status: 403,
    description: 'Liberar una certificación requiere permiso de certificar.',
  })
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
  @ApiQuery({
    name: 'queue',
    required: true,
    enum: ['IN_EXECUTION', 'FAILED', 'CLOSED_UNPROVISIONED'],
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number, maximum: 100 })
  @ApiOkResponse({ description: 'Página de órdenes para la cola seleccionada.' })
  listInbox(@Query(new ZodValidationPipe(InboxQuerySchema)) query: InboxQuery) {
    return this.serviceProvisioningService.listInbox(query);
  }

  @Get('subscribers/:subscriberId')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_PROVISIONING_READ)
  @ApiOperation({ summary: 'Consultar servicios aprovisionados de un suscriptor' })
  @ApiOkResponse({ description: 'Servicios ordenados del más reciente al más antiguo.' })
  listSubscriberProvisionings(@Param('subscriberId', ParseUUIDPipe) subscriberId: string) {
    return this.serviceProvisioningService.listSubscriberProvisionings(subscriberId);
  }

  @Get('orders/:executionOrderId/context')
  @ApiOperation({ summary: 'Consultar el contexto de aprovisionamiento de una orden' })
  @ApiOkResponse({ description: 'Proyección NOC o proyección reducida del técnico asignado.' })
  @ApiResponse({ status: 403, description: 'El actor no tiene permiso para esta orden.' })
  getOrderContext(
    @Param('executionOrderId', ParseUUIDPipe) executionOrderId: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.serviceProvisioningService.getOrderContext(executionOrderId, actor);
  }
}
