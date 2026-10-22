import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { Permissions } from '../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../access-control/guards/permissions.guard';
import { NetworkTenantGuard } from './guards/network-tenant.guard';
import {
  ActorRefResponseDto,
  CreateIpv4NetworkDto,
  CreateRouterDto,
  Ipv4NetworkResponseDto,
  NetworkCatalogListQueryDto,
  NetworkOccupancyResponseDto,
  NetworkSettingsResponseDto,
  PatchNetworkSettingsDto,
  PlanProfileResponseDto,
  PutPlanProfileDto,
  RouterResponseDto,
  RouterStatusDto,
  UpdateIpv4NetworkDto,
  UpdateRouterDto,
} from './dto/network-catalog.dto';
import { NetworkCatalogService } from './network-catalog.service';

const LIST_META_SCHEMA = {
  type: 'object',
  properties: {
    nextCursor: { type: 'string', nullable: true },
    total: { type: 'integer' },
    totalIsEstimate: { type: 'boolean' },
    page: { type: 'integer', nullable: true },
    limit: { type: 'integer' },
    totalPages: { type: 'integer', nullable: true },
    hasMore: { type: 'boolean' },
    mode: { type: 'string', enum: ['page', 'cursor'] },
    capabilities: {
      type: 'object',
      properties: {
        randomAccess: { type: 'boolean' },
        sortableFields: { type: 'array', items: { type: 'string' } },
      },
      required: ['randomAccess', 'sortableFields'],
    },
    sort: {
      type: 'object',
      nullable: true,
      properties: {
        by: { type: 'string' },
        dir: { type: 'string', enum: ['asc', 'desc'] },
      },
      required: ['by', 'dir'],
    },
  },
  required: [
    'nextCursor',
    'total',
    'totalIsEstimate',
    'page',
    'limit',
    'totalPages',
    'hasMore',
    'mode',
    'capabilities',
    'sort',
  ],
};

function listResponseSchema(model: Function) {
  return {
    type: 'object',
    properties: {
      data: { type: 'array', items: { $ref: getSchemaPath(model) } },
      meta: LIST_META_SCHEMA,
    },
    required: ['data', 'meta'],
  };
}

@ApiTags('network')
@ApiBearerAuth('access-token')
@ApiExtraModels(
  ActorRefResponseDto,
  Ipv4NetworkResponseDto,
  NetworkOccupancyResponseDto,
  RouterResponseDto,
)
@UseGuards(JwtAuthGuard, NetworkTenantGuard, RolesGuard, PermissionsGuard)
@Controller('network')
export class NetworkCatalogController {
  constructor(private readonly networkCatalogService: NetworkCatalogService) {}

  @Get('routers')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_CATALOG_READ)
  @ApiOperation({ summary: 'Listar routers de la empresa' })
  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'INACTIVE'] })
  @ApiQuery({ name: 'q', required: false, maxLength: 120 })
  @ApiQuery({ name: 'page', required: false, type: Number, minimum: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiOkResponse({ schema: listResponseSchema(RouterResponseDto) })
  @ApiResponse({ status: 401, description: 'La sesión o el contexto de empresa no son válidos.' })
  @ApiResponse({ status: 403, description: 'No tienes acceso al catálogo de red.' })
  listRouters(@Query() query: NetworkCatalogListQueryDto) {
    return this.networkCatalogService.listRouters(query);
  }

  @Post('routers')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_CATALOG_MANAGE)
  @ApiOperation({ summary: 'Crear un router' })
  @ApiCreatedResponse({ type: RouterResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Los datos enviados no cumplen con las reglas de validación.',
  })
  @ApiResponse({
    status: 403,
    description: 'No tienes permiso para administrar el catálogo de red.',
  })
  @ApiResponse({ status: 409, description: 'Ya existe un router con el mismo nombre.' })
  createRouter(@Body() body: CreateRouterDto, @CurrentUser() actor: JwtPayload) {
    return this.networkCatalogService.createRouter(body, actor.sub);
  }

  @Patch('routers/:id')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_CATALOG_MANAGE)
  @ApiOperation({ summary: 'Actualizar un router' })
  @ApiOkResponse({ type: RouterResponseDto })
  @ApiResponse({ status: 409, description: 'La versión cambió o un método no está soportado.' })
  updateRouter(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateRouterDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.networkCatalogService.updateRouter(id, body, actor.sub);
  }

  @Post('routers/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_CATALOG_MANAGE)
  @ApiOperation({ summary: 'Desactivar un router' })
  @ApiOkResponse({ type: RouterResponseDto })
  setRouterInactive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RouterStatusDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.networkCatalogService.setRouterStatus(id, body.version, 'INACTIVE', actor.sub);
  }

  @Post('routers/:id/activate')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_CATALOG_MANAGE)
  @ApiOperation({ summary: 'Activar un router' })
  @ApiOkResponse({ type: RouterResponseDto })
  setRouterActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RouterStatusDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.networkCatalogService.setRouterStatus(id, body.version, 'ACTIVE', actor.sub);
  }

  @Get('ipv4-networks')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_CATALOG_READ)
  @ApiOperation({ summary: 'Listar redes IPv4 de la empresa' })
  @ApiQuery({ name: 'routerId', required: false, format: 'uuid' })
  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'INACTIVE'] })
  @ApiQuery({ name: 'page', required: false, type: Number, minimum: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiOkResponse({ schema: listResponseSchema(Ipv4NetworkResponseDto) })
  listIpv4Networks(@Query() query: NetworkCatalogListQueryDto) {
    return this.networkCatalogService.listIpv4Networks(query);
  }

  @Post('ipv4-networks')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_CATALOG_MANAGE)
  @ApiOperation({ summary: 'Crear una red IPv4' })
  @ApiCreatedResponse({ type: Ipv4NetworkResponseDto })
  @ApiResponse({ status: 409, description: 'La red se solapa o el método no está soportado.' })
  createIpv4Network(@Body() body: CreateIpv4NetworkDto, @CurrentUser() actor: JwtPayload) {
    return this.networkCatalogService.createIpv4Network(body, actor.sub);
  }

  @Patch('ipv4-networks/:id')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_CATALOG_MANAGE)
  @ApiOperation({ summary: 'Actualizar una red IPv4' })
  @ApiOkResponse({ type: Ipv4NetworkResponseDto })
  @ApiResponse({
    status: 409,
    description: 'La versión cambió o el rango afectaría una IP asignada.',
  })
  updateIpv4Network(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateIpv4NetworkDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.networkCatalogService.updateIpv4Network(id, body, actor.sub);
  }

  @Post('ipv4-networks/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_CATALOG_MANAGE)
  @ApiOperation({ summary: 'Desactivar una red IPv4' })
  @ApiOkResponse({ type: Ipv4NetworkResponseDto })
  setIpv4NetworkInactive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RouterStatusDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.networkCatalogService.setIpv4NetworkStatus(id, body.version, 'INACTIVE', actor.sub);
  }

  @Post('ipv4-networks/:id/activate')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_CATALOG_MANAGE)
  @ApiOperation({ summary: 'Activar una red IPv4' })
  @ApiOkResponse({ type: Ipv4NetworkResponseDto })
  setIpv4NetworkActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RouterStatusDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.networkCatalogService.setIpv4NetworkStatus(id, body.version, 'ACTIVE', actor.sub);
  }

  @Get('plan-profiles')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_CATALOG_READ)
  @ApiOperation({ summary: 'Listar perfiles de control de planes' })
  @ApiOkResponse({ type: PlanProfileResponseDto, isArray: true })
  listPlanProfiles() {
    return this.networkCatalogService.listPlanProfiles();
  }

  @Put('plan-profiles/:planId')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_CATALOG_MANAGE)
  @ApiOperation({ summary: 'Guardar el perfil de control de un plan' })
  @ApiOkResponse({ type: PlanProfileResponseDto })
  putPlanProfile(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() body: PutPlanProfileDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.networkCatalogService.putPlanProfile(planId, body.pcqAddressList, actor.sub);
  }

  @Get('settings')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_CATALOG_READ)
  @ApiOperation({ summary: 'Consultar el ajuste de cierre de instalaciones' })
  @ApiOkResponse({ type: NetworkSettingsResponseDto })
  getNetworkSettings() {
    return this.networkCatalogService.getNetworkSettings();
  }

  @Patch('settings')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_CATALOG_MANAGE)
  @ApiOperation({ summary: 'Actualizar el ajuste de cierre de instalaciones' })
  @ApiOkResponse({ type: NetworkSettingsResponseDto })
  updateNetworkSettings(@Body() body: PatchNetworkSettingsDto, @CurrentUser() actor: JwtPayload) {
    return this.networkCatalogService.updateNetworkSettings(
      body.enforceProvisioningOnInstallClose,
      actor.sub,
    );
  }
}
