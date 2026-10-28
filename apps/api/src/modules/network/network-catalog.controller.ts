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
  ApiBody,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiExtension,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  type ApiResponseOptions,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import {
  CreateRouterBodySchema,
  CreateRouterInterfaceBodySchema,
  CreateRouterInterfaceIpv4AddressBodySchema,
  CorrectRouterInterfaceIpv4AddressBodySchema,
  UpdateRouterInterfaceBodySchema,
  UpdateRouterInterfaceIpv4AddressBodySchema,
  AssistedCreateIpv4NetworkBodySchema,
  UpdateIpv4NetworkBodySchema,
  UpdateRouterBodySchema,
  type CreateRouterBody,
  type CreateRouterInterfaceBody,
  type CreateRouterInterfaceIpv4AddressBody,
  type CorrectRouterInterfaceIpv4AddressBody,
  type UpdateRouterInterfaceBody,
  type UpdateRouterInterfaceIpv4AddressBody,
  type AssistedCreateIpv4NetworkBody,
  type UpdateIpv4NetworkBody,
  type UpdateRouterBody,
} from '@iwana/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { Permissions } from '../access-control/decorators/permissions.decorator';
import { AuditOmitResponseFields } from '../audit/decorators/audit-omit-response-fields.decorator';
import { NetworkTenantGuard } from './guards/network-tenant.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  ActorRefResponseDto,
  CreateRouterInterfaceConversionResponseDto,
  CreateIpv4NetworkDto,
  CreateRouterDto,
  Ipv4NetworkExtendedResponseDto,
  Ipv4NetworkResponseDto,
  NetworkCatalogListQueryDto,
  Ipv4NetworkCatalogListQueryDto,
  NetworkOccupancyResponseDto,
  NetworkSettingsResponseDto,
  PatchNetworkSettingsDto,
  PlanProfileResponseDto,
  PutPlanProfileDto,
  RouterResponseDto,
  RouterListResponseDto,
  RouterDtoResponseDto,
  RouterStatusDto,
} from './dto/network-catalog.dto';
import { NetworkCatalogService } from './network-catalog.service';
import { NetworkInterfaceCatalogService } from './network-interface-catalog.service';
import {
  AssistedCreateIpv4NetworkBodyDto,
  CatalogMetaResponseDto,
  CommercialNodeSummaryResponseDto,
  ConvertLegacyLanBodyDto,
  CorrectRouterInterfaceIpv4AddressBodyDto,
  CorrectRouterInterfaceIpv4AddressResponseDto,
  CreateRouterInterfaceBaseBodyDto,
  CreateRouterInterfaceIpv4AddressBodyDto,
  IpPrefixSourceDto,
  InterfaceAddressSourceDto,
  ManualCidrSourceDto,
  NetworkErrorResponseDto,
  NestBadRequestResponseDto,
  OrganizationSiteSummaryResponseDto,
  ProvisioningMetaResponseDto,
  ReservationAvailabilityResponseDto,
  RouterDetailResponseDto,
  RouterInterfaceIpv4AddressResponseDto,
  RouterInterfaceResponseDto,
  RouterInterfaceRefResponseDto,
  RouterSiteOptionResponseDto,
  RouterSiteOptionsQueryDto,
  UnauthorizedResponseDto,
  UpdateIpv4NetworkBodyDto,
  UpdateRouterBodyDto,
  UpdateRouterInterfaceBodyDto,
  UpdateRouterInterfaceIpv4AddressBodyDto,
} from './dto/network-interfaces.dto';

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

const IPV4_AUDIT_OMITTED_RESPONSE_FIELDS = [
  'address',
  'addressWithPrefix',
  'assignableFrom',
  'assignableTo',
  'cidr',
  'excludedIps',
  'gateway',
  'host',
  'hostAddress',
  'interfaceAddress',
  'interfaceName',
  'ip',
  'ipAddress',
  'ipv4',
  'ipv4Address',
  'lanInterface',
  'managementHost',
  'name',
  'notes',
  'releasedHost',
  'routerName',
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

function unauthorizedResponse(description: string) {
  return ApiResponse({
    status: 401,
    description,
    schema: { $ref: getSchemaPath(UnauthorizedResponseDto) },
  });
}

function badRequestResponse(description: string) {
  return ApiResponse({
    status: 400,
    description,
    schema: { $ref: getSchemaPath(NestBadRequestResponseDto) },
  });
}

@ApiTags('network')
@ApiBearerAuth('access-token')
@ApiExtraModels(
  ActorRefResponseDto,
  Ipv4NetworkResponseDto,
  Ipv4NetworkExtendedResponseDto,
  NetworkOccupancyResponseDto,
  ReservationAvailabilityResponseDto,
  RouterResponseDto,
  RouterDtoResponseDto,
  RouterDetailResponseDto,
  RouterSiteOptionResponseDto,
  OrganizationSiteSummaryResponseDto,
  CommercialNodeSummaryResponseDto,
  CatalogMetaResponseDto,
  UnauthorizedResponseDto,
  ProvisioningMetaResponseDto,
  NetworkErrorResponseDto,
  NestBadRequestResponseDto,
  RouterListResponseDto,
  RouterInterfaceRefResponseDto,
  RouterInterfaceResponseDto,
  RouterInterfaceIpv4AddressResponseDto,
  CreateRouterInterfaceConversionResponseDto,
  CorrectRouterInterfaceIpv4AddressResponseDto,
  CreateRouterInterfaceBaseBodyDto,
  ConvertLegacyLanBodyDto,
  UpdateRouterInterfaceBodyDto,
  CreateRouterInterfaceIpv4AddressBodyDto,
  UpdateRouterInterfaceIpv4AddressBodyDto,
  CorrectRouterInterfaceIpv4AddressBodyDto,
  AssistedCreateIpv4NetworkBodyDto,
  ManualCidrSourceDto,
  IpPrefixSourceDto,
  InterfaceAddressSourceDto,
  UpdateIpv4NetworkBodyDto,
  UpdateRouterBodyDto,
)
@ApiResponse({
  status: 401,
  description: 'Se requiere autenticación válida y un contexto de empresa autenticado.',
  schema: { $ref: getSchemaPath(UnauthorizedResponseDto) },
})
@UseGuards(JwtAuthGuard, NetworkTenantGuard, RolesGuard)
@Controller('network')
export class NetworkCatalogController {
  constructor(
    private readonly networkCatalogService: NetworkCatalogService,
    private readonly networkInterfaceCatalogService: NetworkInterfaceCatalogService,
  ) {}

  @Get('router-site-options')
  @ApiTags('NetworkCatalogController')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_CATALOG_MANAGE)
  @ApiOperation({
    operationId: 'Mod13RouterSiteOptions',
    summary: 'Listar sedes disponibles para asociar routers',
    description:
      'Requiere network.catalog.manage. Filtra por el scope efectivo antes de contar y paginar; devuelve sedes autorizadas activas e inactivas. No exige organization.sites.read ni acepta búsqueda global. Una lista vacía es válida para un actor autorizado.',
  })
  @ApiExtension('x-required-roles', { anyOf: [UserRole.ADMIN, UserRole.NOC] })
  @ApiExtension('x-required-permissions', {
    allOf: [AccessPermissionKey.NETWORK_CATALOG_MANAGE],
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: 'integer',
    minimum: 1,
    default: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: 'integer',
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @ApiOkResponse({
    description: 'Sedes dentro del alcance autorizado.',
    schema: listResponseSchema(RouterSiteOptionResponseDto),
  })
  @badRequestResponse('El formato o la validación del contrato no son válidos.')
  @unauthorizedResponse('La sesión o el contexto de empresa no son válidos.')
  @apiErrorResponse(403, 'La acción no está autorizada.', ['FORBIDDEN'])
  listRouterSiteOptions(
    @Query() query: RouterSiteOptionsQueryDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.networkCatalogService.listRouterSiteOptions(query, actor.sub);
  }

  @Get('catalog-meta')
  @ApiTags('NetworkCatalogController')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_CATALOG_READ)
  @ApiOperation({
    operationId: 'Mod13CatalogMeta',
    summary: 'Consultar el estado de protección IPAM',
    description:
      'Devuelve únicamente ipProtection. PENDING bloquea las escrituras de IP local; el flag pasa a ACTIVE solo después de CA-R12. La protección de reservas y ocupación permanece activa.',
  })
  @ApiExtension('x-required-roles', { anyOf: [UserRole.ADMIN, UserRole.NOC] })
  @ApiExtension('x-required-permissions', {
    allOf: [AccessPermissionKey.NETWORK_CATALOG_READ],
  })
  @ApiOkResponse({ description: 'Metadato mínimo del catálogo.', type: CatalogMetaResponseDto })
  @unauthorizedResponse('La sesión o el contexto de empresa no son válidos.')
  @apiErrorResponse(403, 'La acción no está autorizada.', ['FORBIDDEN'])
  getCatalogMeta(@CurrentUser() actor: JwtPayload) {
    return this.networkCatalogService.getCatalogMeta(actor.sub);
  }

  @Get('routers')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_CATALOG_READ)
  @ApiOperation({ summary: 'Listar routers de la empresa' })
  @ApiExtension('x-required-roles', { anyOf: [UserRole.ADMIN, UserRole.NOC] })
  @ApiExtension('x-required-permissions', {
    allOf: [AccessPermissionKey.NETWORK_CATALOG_READ],
  })
  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'INACTIVE'] })
  @ApiQuery({ name: 'q', required: false, maxLength: 120 })
  @ApiQuery({ name: 'page', required: false, type: 'integer', minimum: 1, default: 1 })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: 'integer',
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @ApiOkResponse({ schema: listResponseSchema(RouterListResponseDto) })
  @ApiResponse({
    status: 400,
    description: 'El formato o la validación del contrato no son válidos.',
    schema: { $ref: getSchemaPath(NestBadRequestResponseDto) },
  })
  @apiErrorResponse(403, 'No tienes acceso al catálogo de red.', ['FORBIDDEN'])
  listRouters(@Query() query: NetworkCatalogListQueryDto, @CurrentUser() actor: JwtPayload) {
    return this.networkCatalogService.listRouters(query, actor.sub);
  }

  @Get('routers/:id')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_CATALOG_READ)
  @ApiOperation({
    operationId: 'Mod13GetRouterDetail',
    summary: 'Consultar el detalle autorizado de un router',
    description:
      'Resuelve primero el router tenant-local y autoriza network.catalog.read sobre su sede. Solo después consulta las proyecciones allowlisted de sede y nodo comercial. Referencias fuera de alcance conservan 404 uniforme.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiExtension('x-required-roles', { anyOf: [UserRole.ADMIN, UserRole.NOC] })
  @ApiExtension('x-required-permissions', {
    allOf: [AccessPermissionKey.NETWORK_CATALOG_READ],
  })
  @ApiOkResponse({ type: RouterDetailResponseDto })
  @ApiResponse({
    status: 400,
    description: 'El identificador de router no es válido.',
    schema: { $ref: getSchemaPath(NestBadRequestResponseDto) },
  })
  @unauthorizedResponse('La sesión o el contexto de empresa no son válidos.')
  @apiErrorResponse(403, 'La acción no está autorizada.', ['FORBIDDEN'])
  @apiErrorResponse(404, 'La referencia no está disponible para esta operación.', [
    'RESOURCE_NOT_FOUND',
  ])
  getRouterDetail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: JwtPayload) {
    return this.networkCatalogService.getRouterDetail(id, actor.sub);
  }

  @Get('routers/:id/interfaces')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_CATALOG_READ)
  @ApiOperation({
    operationId: 'Mod13ListRouterInterfaces',
    summary: 'Listar interfaces de un router',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiExtension('x-required-roles', { anyOf: [UserRole.ADMIN, UserRole.NOC] })
  @ApiExtension('x-required-permissions', { allOf: [AccessPermissionKey.NETWORK_CATALOG_READ] })
  @ApiQuery({ name: 'page', required: false, type: 'integer', minimum: 1, default: 1 })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: 'integer',
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @ApiOkResponse({ schema: listResponseSchema(RouterInterfaceResponseDto) })
  @badRequestResponse('El formato o la validación del contrato no son válidos.')
  @unauthorizedResponse('La sesión o el contexto de empresa no son válidos.')
  @apiErrorResponse(403, 'La acción no está autorizada.', ['FORBIDDEN'])
  @apiErrorResponse(404, 'El router o la referencia no están disponibles.', ['RESOURCE_NOT_FOUND'])
  listRouterInterfaces(
    @Param('id', ParseUUIDPipe) routerId: string,
    @Query() query: RouterSiteOptionsQueryDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.networkInterfaceCatalogService.listRouterInterfaces(
      routerId,
      query.page,
      query.limit,
      actor.sub,
    );
  }

  @Post('routers/:id/interfaces')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_CATALOG_MANAGE)
  @ApiOperation({
    operationId: 'Mod13CreateRouterInterface',
    summary: 'Registrar una interfaz o convertir el LAN legado',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiExtension('x-required-roles', { anyOf: [UserRole.ADMIN, UserRole.NOC] })
  @ApiExtension('x-required-permissions', { allOf: [AccessPermissionKey.NETWORK_CATALOG_MANAGE] })
  @ApiBody({
    schema: {
      oneOf: [
        { $ref: getSchemaPath(CreateRouterInterfaceBaseBodyDto) },
        {
          allOf: [
            { $ref: getSchemaPath(ConvertLegacyLanBodyDto) },
            {
              type: 'object',
              properties: { convertLegacyLan: { type: 'boolean', enum: [true] } },
            },
          ],
        },
      ],
    },
  })
  @ApiCreatedResponse({
    schema: {
      oneOf: [
        { $ref: getSchemaPath(RouterInterfaceResponseDto) },
        { $ref: getSchemaPath(CreateRouterInterfaceConversionResponseDto) },
      ],
    },
  })
  @apiErrorResponse(400, 'El formato o la validación del contrato no son válidos.', [
    'VALIDATION_ERROR',
    'ADDRESS_NOT_USABLE',
  ])
  @unauthorizedResponse('La sesión o el contexto de empresa no son válidos.')
  @apiErrorResponse(403, 'La acción no está autorizada.', ['FORBIDDEN'])
  @apiErrorResponse(404, 'El router no está disponible.', ['RESOURCE_NOT_FOUND'])
  @apiErrorResponse(409, 'La interfaz o conversión no está disponible.', [
    'CATALOG_REFERENCE_INACTIVE',
    'INTERFACE_NAME_IN_USE',
    'LEGACY_LAN_NOT_AVAILABLE',
    'LEGACY_LAN_ALREADY_CONVERTED',
    'VERSION_CONFLICT',
    'IP_IN_USE',
    'IP_PROTECTION_PENDING',
    'INTERFACE_ADDRESS_DUPLICATED',
  ])
  @AuditOmitResponseFields(...IPV4_AUDIT_OMITTED_RESPONSE_FIELDS)
  createRouterInterface(
    @Param('id', ParseUUIDPipe) routerId: string,
    @Body(new ZodValidationPipe(CreateRouterInterfaceBodySchema)) body: CreateRouterInterfaceBody,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.networkInterfaceCatalogService.createRouterInterface(routerId, body, actor.sub);
  }

  @Patch('routers/:id/interfaces/:interfaceId')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_CATALOG_MANAGE)
  @ApiOperation({ operationId: 'Mod13UpdateRouterInterface', summary: 'Actualizar una interfaz' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'interfaceId', format: 'uuid' })
  @ApiExtension('x-required-roles', { anyOf: [UserRole.ADMIN, UserRole.NOC] })
  @ApiExtension('x-required-permissions', { allOf: [AccessPermissionKey.NETWORK_CATALOG_MANAGE] })
  @ApiBody({ type: UpdateRouterInterfaceBodyDto })
  @ApiOkResponse({ type: RouterInterfaceResponseDto })
  @apiErrorResponse(400, 'El formato o la validación del contrato no son válidos.', [
    'VALIDATION_ERROR',
  ])
  @unauthorizedResponse('La sesión o el contexto de empresa no son válidos.')
  @apiErrorResponse(403, 'La acción no está autorizada.', ['FORBIDDEN'])
  @apiErrorResponse(404, 'La referencia no está disponible.', ['RESOURCE_NOT_FOUND'])
  @apiErrorResponse(409, 'La versión o el nombre de la interfaz entran en conflicto.', [
    'VERSION_CONFLICT',
    'INTERFACE_NAME_IN_USE',
  ])
  @AuditOmitResponseFields(...IPV4_AUDIT_OMITTED_RESPONSE_FIELDS)
  updateRouterInterface(
    @Param('id', ParseUUIDPipe) routerId: string,
    @Param('interfaceId', ParseUUIDPipe) interfaceId: string,
    @Body(new ZodValidationPipe(UpdateRouterInterfaceBodySchema)) body: UpdateRouterInterfaceBody,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.networkInterfaceCatalogService.updateRouterInterface(
      routerId,
      interfaceId,
      body,
      actor.sub,
    );
  }

  @Post('routers/:id/interfaces/:interfaceId/activate')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_CATALOG_MANAGE)
  @ApiOperation({ operationId: 'Mod13ActivateRouterInterface', summary: 'Activar una interfaz' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'interfaceId', format: 'uuid' })
  @ApiExtension('x-required-roles', { anyOf: [UserRole.ADMIN, UserRole.NOC] })
  @ApiExtension('x-required-permissions', { allOf: [AccessPermissionKey.NETWORK_CATALOG_MANAGE] })
  @ApiOkResponse({ type: RouterInterfaceResponseDto })
  @badRequestResponse('El identificador o la versión de la interfaz no son válidos.')
  @unauthorizedResponse('La sesión o el contexto de empresa no son válidos.')
  @apiErrorResponse(403, 'La acción no está autorizada.', ['FORBIDDEN'])
  @apiErrorResponse(404, 'La referencia no está disponible.', ['RESOURCE_NOT_FOUND'])
  @apiErrorResponse(409, 'La versión cambió desde la consulta.', ['VERSION_CONFLICT'])
  @AuditOmitResponseFields(...IPV4_AUDIT_OMITTED_RESPONSE_FIELDS)
  activateRouterInterface(
    @Param('id', ParseUUIDPipe) routerId: string,
    @Param('interfaceId', ParseUUIDPipe) interfaceId: string,
    @Body() body: RouterStatusDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.networkInterfaceCatalogService.setRouterInterfaceStatus(
      routerId,
      interfaceId,
      body.version,
      'ACTIVE',
      actor.sub,
    );
  }

  @Post('routers/:id/interfaces/:interfaceId/deactivate')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_CATALOG_MANAGE)
  @ApiOperation({
    operationId: 'Mod13DeactivateRouterInterface',
    summary: 'Desactivar una interfaz',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'interfaceId', format: 'uuid' })
  @ApiExtension('x-required-roles', { anyOf: [UserRole.ADMIN, UserRole.NOC] })
  @ApiExtension('x-required-permissions', { allOf: [AccessPermissionKey.NETWORK_CATALOG_MANAGE] })
  @ApiOkResponse({ type: RouterInterfaceResponseDto })
  @badRequestResponse('El identificador o la versión de la interfaz no son válidos.')
  @unauthorizedResponse('La sesión o el contexto de empresa no son válidos.')
  @apiErrorResponse(403, 'La acción no está autorizada.', ['FORBIDDEN'])
  @apiErrorResponse(404, 'La referencia no está disponible.', ['RESOURCE_NOT_FOUND'])
  @apiErrorResponse(409, 'La versión cambió desde la consulta.', ['VERSION_CONFLICT'])
  @AuditOmitResponseFields(...IPV4_AUDIT_OMITTED_RESPONSE_FIELDS)
  deactivateRouterInterface(
    @Param('id', ParseUUIDPipe) routerId: string,
    @Param('interfaceId', ParseUUIDPipe) interfaceId: string,
    @Body() body: RouterStatusDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.networkInterfaceCatalogService.setRouterInterfaceStatus(
      routerId,
      interfaceId,
      body.version,
      'INACTIVE',
      actor.sub,
    );
  }

  @Get('routers/:id/interfaces/:interfaceId/ipv4-addresses')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_CATALOG_READ)
  @ApiOperation({
    operationId: 'Mod13ListInterfaceIpv4Addresses',
    summary: 'Listar direcciones IPv4 locales',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'interfaceId', format: 'uuid' })
  @ApiExtension('x-required-roles', { anyOf: [UserRole.ADMIN, UserRole.NOC] })
  @ApiExtension('x-required-permissions', { allOf: [AccessPermissionKey.NETWORK_CATALOG_READ] })
  @ApiQuery({ name: 'page', required: false, type: 'integer', minimum: 1, default: 1 })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: 'integer',
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @ApiOkResponse({ schema: listResponseSchema(RouterInterfaceIpv4AddressResponseDto) })
  @badRequestResponse('El formato o la validación del contrato no son válidos.')
  @unauthorizedResponse('La sesión o el contexto de empresa no son válidos.')
  @apiErrorResponse(403, 'La acción no está autorizada.', ['FORBIDDEN'])
  @apiErrorResponse(404, 'La referencia no está disponible.', ['RESOURCE_NOT_FOUND'])
  listInterfaceIpv4Addresses(
    @Param('id', ParseUUIDPipe) routerId: string,
    @Param('interfaceId', ParseUUIDPipe) interfaceId: string,
    @Query() query: RouterSiteOptionsQueryDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.networkInterfaceCatalogService.listInterfaceIpv4Addresses(
      routerId,
      interfaceId,
      query.page,
      query.limit,
      actor.sub,
    );
  }

  @Post('routers/:id/interfaces/:interfaceId/ipv4-addresses')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_CATALOG_MANAGE)
  @ApiOperation({
    operationId: 'Mod13CreateInterfaceIpv4Address',
    summary: 'Registrar una dirección IPv4 local',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'interfaceId', format: 'uuid' })
  @ApiExtension('x-required-roles', { anyOf: [UserRole.ADMIN, UserRole.NOC] })
  @ApiExtension('x-required-permissions', { allOf: [AccessPermissionKey.NETWORK_CATALOG_MANAGE] })
  @ApiBody({ type: CreateRouterInterfaceIpv4AddressBodyDto })
  @ApiCreatedResponse({ type: RouterInterfaceIpv4AddressResponseDto })
  @apiErrorResponse(400, 'La dirección no es válida o no se puede asignar.', [
    'VALIDATION_ERROR',
    'ADDRESS_NOT_USABLE',
  ])
  @unauthorizedResponse('La sesión o el contexto de empresa no son válidos.')
  @apiErrorResponse(403, 'La acción no está autorizada.', ['FORBIDDEN'])
  @apiErrorResponse(404, 'La referencia no está disponible.', ['RESOURCE_NOT_FOUND'])
  @apiErrorResponse(409, 'La captura de dirección aún no está habilitada o existe conflicto.', [
    'IP_PROTECTION_PENDING',
    'INTERFACE_NOT_AVAILABLE',
    'IP_IN_USE',
    'INTERFACE_ADDRESS_DUPLICATED',
  ])
  @AuditOmitResponseFields(...IPV4_AUDIT_OMITTED_RESPONSE_FIELDS)
  createInterfaceIpv4Address(
    @Param('id', ParseUUIDPipe) routerId: string,
    @Param('interfaceId', ParseUUIDPipe) interfaceId: string,
    @Body(new ZodValidationPipe(CreateRouterInterfaceIpv4AddressBodySchema))
    body: CreateRouterInterfaceIpv4AddressBody,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.networkInterfaceCatalogService.createInterfaceIpv4Address(
      routerId,
      interfaceId,
      body,
      actor.sub,
    );
  }

  @Patch('routers/:id/interfaces/:interfaceId/ipv4-addresses/:addressId')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_CATALOG_MANAGE)
  @ApiOperation({
    operationId: 'Mod13UpdateInterfaceIpv4Address',
    summary: 'Actualizar notas de una dirección local',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'interfaceId', format: 'uuid' })
  @ApiParam({ name: 'addressId', format: 'uuid' })
  @ApiExtension('x-required-roles', { anyOf: [UserRole.ADMIN, UserRole.NOC] })
  @ApiExtension('x-required-permissions', { allOf: [AccessPermissionKey.NETWORK_CATALOG_MANAGE] })
  @ApiBody({ type: UpdateRouterInterfaceIpv4AddressBodyDto })
  @ApiOkResponse({ type: RouterInterfaceIpv4AddressResponseDto })
  @apiErrorResponse(400, 'El formato o la validación del contrato no son válidos.', [
    'VALIDATION_ERROR',
  ])
  @unauthorizedResponse('La sesión o el contexto de empresa no son válidos.')
  @apiErrorResponse(403, 'La acción no está autorizada.', ['FORBIDDEN'])
  @apiErrorResponse(404, 'La referencia no está disponible.', ['RESOURCE_NOT_FOUND'])
  @apiErrorResponse(409, 'La versión cambió desde la consulta.', ['VERSION_CONFLICT'])
  @AuditOmitResponseFields(...IPV4_AUDIT_OMITTED_RESPONSE_FIELDS)
  updateInterfaceIpv4Address(
    @Param('id', ParseUUIDPipe) routerId: string,
    @Param('interfaceId', ParseUUIDPipe) interfaceId: string,
    @Param('addressId', ParseUUIDPipe) addressId: string,
    @Body(new ZodValidationPipe(UpdateRouterInterfaceIpv4AddressBodySchema))
    body: UpdateRouterInterfaceIpv4AddressBody,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.networkInterfaceCatalogService.updateInterfaceIpv4Address(
      routerId,
      interfaceId,
      addressId,
      body,
      actor.sub,
    );
  }

  @Post('routers/:id/interfaces/:interfaceId/ipv4-addresses/:addressId/correct')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_CATALOG_MANAGE)
  @ApiOperation({
    operationId: 'Mod13CorrectInterfaceIpv4Address',
    summary: 'Corregir una dirección IPv4 local',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'interfaceId', format: 'uuid' })
  @ApiParam({ name: 'addressId', format: 'uuid' })
  @ApiExtension('x-required-roles', { anyOf: [UserRole.ADMIN, UserRole.NOC] })
  @ApiExtension('x-required-permissions', { allOf: [AccessPermissionKey.NETWORK_CATALOG_MANAGE] })
  @ApiBody({ type: CorrectRouterInterfaceIpv4AddressBodyDto })
  @ApiOkResponse({ type: CorrectRouterInterfaceIpv4AddressResponseDto })
  @unauthorizedResponse('La sesión o el contexto de empresa no son válidos.')
  @apiErrorResponse(403, 'La acción no está autorizada.', ['FORBIDDEN'])
  @apiErrorResponse(404, 'La referencia no está disponible.', ['RESOURCE_NOT_FOUND'])
  @apiErrorResponse(409, 'La captura está pendiente o la dirección está protegida.', [
    'IP_PROTECTION_PENDING',
    'VERSION_CONFLICT',
    'INTERFACE_NOT_AVAILABLE',
    'IP_IN_USE',
    'INTERFACE_ADDRESS_IS_GATEWAY',
    'INTERFACE_ADDRESS_DUPLICATED',
  ])
  @apiErrorResponse(400, 'La dirección propuesta no es utilizable o requiere confirmación.', [
    'VALIDATION_ERROR',
    'ADDRESS_NOT_USABLE',
    'ADDRESS_RELEASE_CONFIRMATION_REQUIRED',
  ])
  @AuditOmitResponseFields(...IPV4_AUDIT_OMITTED_RESPONSE_FIELDS)
  correctInterfaceIpv4Address(
    @Param('id', ParseUUIDPipe) routerId: string,
    @Param('interfaceId', ParseUUIDPipe) interfaceId: string,
    @Param('addressId', ParseUUIDPipe) addressId: string,
    @Body(new ZodValidationPipe(CorrectRouterInterfaceIpv4AddressBodySchema))
    body: CorrectRouterInterfaceIpv4AddressBody,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.networkInterfaceCatalogService.correctInterfaceIpv4Address(
      routerId,
      interfaceId,
      addressId,
      body,
      actor.sub,
    );
  }

  @Post('routers')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_CATALOG_MANAGE)
  @ApiOperation({ summary: 'Crear un router' })
  @ApiExtension('x-required-roles', { anyOf: [UserRole.ADMIN, UserRole.NOC] })
  @ApiExtension('x-required-permissions', {
    allOf: [AccessPermissionKey.NETWORK_CATALOG_MANAGE],
  })
  @ApiCreatedResponse({ type: RouterResponseDto })
  @apiErrorResponse(400, 'Los datos enviados no cumplen con las reglas de validación.', [
    'VALIDATION_ERROR',
  ])
  @unauthorizedResponse('Se requiere autenticación válida y un contexto de empresa autenticado.')
  @apiErrorResponse(403, 'No tienes permiso para administrar el catálogo de red.', ['FORBIDDEN'])
  @apiErrorResponse(404, 'La referencia no está disponible para esta operación.', [
    'RESOURCE_NOT_FOUND',
  ])
  @apiErrorResponse(409, 'Ya existe un router o una referencia está inactiva.', [
    'ROUTER_NAME_IN_USE',
    'SITE_OR_NODE_INACTIVE',
  ])
  @AuditOmitResponseFields(...IPV4_AUDIT_OMITTED_RESPONSE_FIELDS)
  @ApiBody({ type: CreateRouterDto })
  createRouter(
    @Body(new ZodValidationPipe(CreateRouterBodySchema)) body: CreateRouterBody,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.networkCatalogService.createRouter(body, actor.sub);
  }

  @Patch('routers/:id')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_CATALOG_MANAGE)
  @ApiOperation({ summary: 'Actualizar un router' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiExtension('x-required-roles', { anyOf: [UserRole.ADMIN, UserRole.NOC] })
  @ApiExtension('x-required-permissions', {
    allOf: [AccessPermissionKey.NETWORK_CATALOG_MANAGE],
  })
  @ApiBody({ type: UpdateRouterBodyDto })
  @ApiOkResponse({ type: RouterDtoResponseDto })
  @apiErrorResponse(400, 'Error de validación específico de esta operación.', ['VALIDATION_ERROR'])
  @unauthorizedResponse('Se requiere autenticación válida y un contexto de empresa autenticado.')
  @apiErrorResponse(403, 'El rol o permiso no autoriza esta operación.', ['FORBIDDEN'])
  @apiErrorResponse(404, 'La referencia no está disponible para esta operación.', [
    'RESOURCE_NOT_FOUND',
  ])
  @apiErrorResponse(409, 'La versión cambió o un método no está soportado.', [
    'VERSION_CONFLICT',
    'ROUTER_NAME_IN_USE',
    'CONTROL_METHOD_IN_USE',
    'SITE_OR_NODE_INACTIVE',
  ])
  @AuditOmitResponseFields(...IPV4_AUDIT_OMITTED_RESPONSE_FIELDS)
  updateRouter(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateRouterBodySchema)) body: UpdateRouterBody,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.networkCatalogService.updateRouter(id, body, actor.sub);
  }

  @Post('routers/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_CATALOG_MANAGE)
  @ApiOperation({ summary: 'Desactivar un router' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiExtension('x-required-roles', { anyOf: [UserRole.ADMIN, UserRole.NOC] })
  @ApiExtension('x-required-permissions', {
    allOf: [AccessPermissionKey.NETWORK_CATALOG_MANAGE],
  })
  @ApiOkResponse({ type: RouterResponseDto })
  @ApiResponse({
    status: 400,
    description: 'El identificador o la versión del router no son válidos.',
    schema: { $ref: getSchemaPath(NestBadRequestResponseDto) },
  })
  @apiErrorResponse(403, 'El rol o permiso no autoriza esta operación.', ['FORBIDDEN'])
  @apiErrorResponse(404, 'La referencia no está disponible para esta operación.', [
    'RESOURCE_NOT_FOUND',
  ])
  @apiErrorResponse(409, 'La versión del router cambió.', ['VERSION_CONFLICT'])
  @AuditOmitResponseFields(...IPV4_AUDIT_OMITTED_RESPONSE_FIELDS)
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
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiExtension('x-required-roles', { anyOf: [UserRole.ADMIN, UserRole.NOC] })
  @ApiExtension('x-required-permissions', {
    allOf: [AccessPermissionKey.NETWORK_CATALOG_MANAGE],
  })
  @ApiOkResponse({ type: RouterResponseDto })
  @ApiResponse({
    status: 400,
    description: 'El identificador o la versión del router no son válidos.',
    schema: { $ref: getSchemaPath(NestBadRequestResponseDto) },
  })
  @apiErrorResponse(403, 'El rol o permiso no autoriza esta operación.', ['FORBIDDEN'])
  @apiErrorResponse(404, 'La referencia no está disponible para esta operación.', [
    'RESOURCE_NOT_FOUND',
  ])
  @apiErrorResponse(409, 'La versión del router cambió.', ['VERSION_CONFLICT'])
  @AuditOmitResponseFields(...IPV4_AUDIT_OMITTED_RESPONSE_FIELDS)
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
  @ApiExtension('x-required-roles', { anyOf: [UserRole.ADMIN, UserRole.NOC] })
  @ApiExtension('x-required-permissions', {
    allOf: [AccessPermissionKey.NETWORK_CATALOG_READ],
  })
  @ApiQuery({ name: 'routerId', required: false, format: 'uuid' })
  @ApiQuery({ name: 'interfaceId', required: false, format: 'uuid' })
  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'INACTIVE'] })
  @ApiQuery({ name: 'q', required: false, maxLength: 120 })
  @ApiQuery({ name: 'page', required: false, type: 'integer', minimum: 1, default: 1 })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: 'integer',
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @ApiOkResponse({ schema: listResponseSchema(Ipv4NetworkExtendedResponseDto) })
  @ApiResponse({
    status: 400,
    description: 'El formato o la validación del contrato no son válidos.',
    schema: { $ref: getSchemaPath(NestBadRequestResponseDto) },
  })
  @apiErrorResponse(403, 'El rol o permiso no autoriza esta operación.', ['FORBIDDEN'])
  listIpv4Networks(
    @Query() query: Ipv4NetworkCatalogListQueryDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.networkCatalogService.listIpv4Networks(query, actor.sub);
  }

  @Post('ipv4-networks')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_CATALOG_MANAGE)
  @ApiOperation({ summary: 'Crear una red IPv4' })
  @ApiExtension('x-required-roles', { anyOf: [UserRole.ADMIN, UserRole.NOC] })
  @ApiExtension('x-required-permissions', {
    allOf: [AccessPermissionKey.NETWORK_CATALOG_MANAGE],
  })
  @ApiCreatedResponse({ type: Ipv4NetworkExtendedResponseDto })
  @apiErrorResponse(400, 'Los datos de red no cumplen las reglas de validación.', [
    'VALIDATION_ERROR',
    'EXCLUDED_IP_OUTSIDE_BLOCK',
  ])
  @apiErrorResponse(403, 'El rol o permiso no autoriza esta operación.', ['FORBIDDEN'])
  @apiErrorResponse(404, 'La referencia no está disponible para esta operación.', [
    'RESOURCE_NOT_FOUND',
  ])
  @apiErrorResponse(409, 'La red se solapa o el método no está soportado.', [
    'NETWORK_OVERLAP',
    'CONTROL_METHOD_NOT_SUPPORTED',
  ])
  @AuditOmitResponseFields(...IPV4_AUDIT_OMITTED_RESPONSE_FIELDS)
  createIpv4Network(@Body() body: CreateIpv4NetworkDto, @CurrentUser() actor: JwtPayload) {
    return this.networkCatalogService.createIpv4Network(body, actor.sub);
  }

  @Post('routers/:id/ipv4-networks')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_CATALOG_MANAGE)
  @ApiOperation({
    operationId: 'Mod13CreateIpv4NetworkAssisted',
    summary: 'Crear una red IPv4 asistida',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiExtension('x-required-roles', { anyOf: [UserRole.ADMIN, UserRole.NOC] })
  @ApiExtension('x-required-permissions', { allOf: [AccessPermissionKey.NETWORK_CATALOG_MANAGE] })
  @ApiExtension('x-conditional-permissions', {
    when: "body.source.mode == 'INTERFACE_ADDRESS'",
    allOf: [AccessPermissionKey.NETWORK_CATALOG_READ],
    reason:
      'Leer y validar la dirección candidata elegida; network.catalog.manage sigue siendo obligatorio.',
  })
  @ApiBody({ type: AssistedCreateIpv4NetworkBodyDto })
  @ApiCreatedResponse({ type: Ipv4NetworkExtendedResponseDto })
  @unauthorizedResponse('La sesión o el contexto de empresa no son válidos.')
  @apiErrorResponse(403, 'La acción no está autorizada.', ['FORBIDDEN'])
  @apiErrorResponse(404, 'El router o recurso no están disponibles.', ['RESOURCE_NOT_FOUND'])
  @apiErrorResponse(400, 'El formato o la validación del contrato no son válidos.', [
    'VALIDATION_ERROR',
    'NETWORK_PREFIX_NOT_ASSIGNABLE',
    'NETWORK_CONFIRMATION_MISMATCH',
    'EXCLUDED_IP_OUTSIDE_BLOCK',
  ])
  @apiErrorResponse(409, 'El estado actual impide completar la operación.', [
    'VERSION_CONFLICT',
    'CATALOG_REFERENCE_INACTIVE',
    'SITE_OR_NODE_INACTIVE',
    'INTERFACE_NOT_AVAILABLE',
    'CONTROL_METHOD_NOT_SUPPORTED',
    'NETWORK_OVERLAP',
  ])
  @AuditOmitResponseFields(...IPV4_AUDIT_OMITTED_RESPONSE_FIELDS)
  createAssistedIpv4Network(
    @Param('id', ParseUUIDPipe) routerId: string,
    @Body(new ZodValidationPipe(AssistedCreateIpv4NetworkBodySchema))
    body: AssistedCreateIpv4NetworkBody,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.networkCatalogService.createAssistedIpv4Network(routerId, body, actor.sub);
  }

  @Patch('ipv4-networks/:id')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_CATALOG_MANAGE)
  @ApiOperation({ summary: 'Actualizar una red IPv4' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiExtension('x-required-roles', { anyOf: [UserRole.ADMIN, UserRole.NOC] })
  @ApiExtension('x-required-permissions', {
    allOf: [AccessPermissionKey.NETWORK_CATALOG_MANAGE],
  })
  @ApiBody({ type: UpdateIpv4NetworkBodyDto })
  @ApiOkResponse({ type: Ipv4NetworkExtendedResponseDto })
  @apiErrorResponse(400, 'El rango o las exclusiones no cumplen las reglas de validación.', [
    'VALIDATION_ERROR',
    'EXCLUDED_IP_OUTSIDE_BLOCK',
  ])
  @apiErrorResponse(403, 'El rol o permiso no autoriza esta operación.', ['FORBIDDEN'])
  @apiErrorResponse(404, 'La referencia no está disponible para esta operación.', [
    'RESOURCE_NOT_FOUND',
  ])
  @apiErrorResponse(409, 'La versión o el rango de la red entra en conflicto.', [
    'VERSION_CONFLICT',
    'IP_IN_USE',
    'EXCLUDED_IP_IN_USE',
    'INTERFACE_NOT_AVAILABLE',
  ])
  @AuditOmitResponseFields(...IPV4_AUDIT_OMITTED_RESPONSE_FIELDS)
  updateIpv4Network(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateIpv4NetworkBodySchema)) body: UpdateIpv4NetworkBody,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.networkCatalogService.updateIpv4Network(id, body, actor.sub);
  }

  @Post('ipv4-networks/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_CATALOG_MANAGE)
  @ApiOperation({ summary: 'Desactivar una red IPv4' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiExtension('x-required-roles', { anyOf: [UserRole.ADMIN, UserRole.NOC] })
  @ApiExtension('x-required-permissions', {
    allOf: [AccessPermissionKey.NETWORK_CATALOG_MANAGE],
  })
  @ApiOkResponse({ type: Ipv4NetworkExtendedResponseDto })
  @badRequestResponse('El identificador o la versión de la red no son válidos.')
  @apiErrorResponse(403, 'El rol o permiso no autoriza esta operación.', ['FORBIDDEN'])
  @apiErrorResponse(404, 'La referencia no está disponible para esta operación.', [
    'RESOURCE_NOT_FOUND',
  ])
  @apiErrorResponse(409, 'La versión de la red cambió.', ['VERSION_CONFLICT'])
  @AuditOmitResponseFields(...IPV4_AUDIT_OMITTED_RESPONSE_FIELDS)
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
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiExtension('x-required-roles', { anyOf: [UserRole.ADMIN, UserRole.NOC] })
  @ApiExtension('x-required-permissions', {
    allOf: [AccessPermissionKey.NETWORK_CATALOG_MANAGE],
  })
  @ApiOkResponse({ type: Ipv4NetworkExtendedResponseDto })
  @badRequestResponse('El identificador o la versión de la red no son válidos.')
  @apiErrorResponse(403, 'El rol o permiso no autoriza esta operación.', ['FORBIDDEN'])
  @apiErrorResponse(404, 'La referencia no está disponible para esta operación.', [
    'RESOURCE_NOT_FOUND',
  ])
  @apiErrorResponse(409, 'La versión de la red cambió.', ['VERSION_CONFLICT'])
  @AuditOmitResponseFields(...IPV4_AUDIT_OMITTED_RESPONSE_FIELDS)
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
  @ApiExtension('x-required-roles', { anyOf: [UserRole.ADMIN, UserRole.NOC] })
  @ApiExtension('x-required-permissions', {
    allOf: [AccessPermissionKey.NETWORK_CATALOG_READ],
  })
  @ApiOkResponse({ type: PlanProfileResponseDto, isArray: true })
  @apiErrorResponse(403, 'El rol o permiso no autoriza esta operación.', ['FORBIDDEN'])
  listPlanProfiles(@CurrentUser() actor: JwtPayload) {
    return this.networkCatalogService.listPlanProfiles(actor.sub);
  }

  @Put('plan-profiles/:planId')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_CATALOG_MANAGE)
  @ApiOperation({ summary: 'Guardar el perfil de control de un plan' })
  @ApiParam({ name: 'planId', format: 'uuid' })
  @ApiExtension('x-required-roles', { anyOf: [UserRole.ADMIN, UserRole.NOC] })
  @ApiExtension('x-required-permissions', {
    allOf: [AccessPermissionKey.NETWORK_CATALOG_MANAGE],
  })
  @ApiOkResponse({ type: PlanProfileResponseDto })
  @ApiResponse({
    status: 400,
    description: 'El identificador de plan o el perfil no son válidos.',
    schema: { $ref: getSchemaPath(NestBadRequestResponseDto) },
  })
  @apiErrorResponse(403, 'El rol o permiso no autoriza esta operación.', ['FORBIDDEN'])
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
  @ApiExtension('x-required-roles', { anyOf: [UserRole.ADMIN, UserRole.NOC] })
  @ApiExtension('x-required-permissions', {
    allOf: [AccessPermissionKey.NETWORK_CATALOG_READ],
  })
  @ApiOkResponse({ type: NetworkSettingsResponseDto })
  @apiErrorResponse(403, 'El rol o permiso no autoriza esta operación.', ['FORBIDDEN'])
  getNetworkSettings(@CurrentUser() actor: JwtPayload) {
    return this.networkCatalogService.getNetworkSettings(actor.sub);
  }

  @Patch('settings')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.NETWORK_CATALOG_MANAGE)
  @ApiOperation({ summary: 'Actualizar el ajuste de cierre de instalaciones' })
  @ApiExtension('x-required-roles', { anyOf: [UserRole.ADMIN, UserRole.NOC] })
  @ApiExtension('x-required-permissions', {
    allOf: [AccessPermissionKey.NETWORK_CATALOG_MANAGE],
  })
  @ApiOkResponse({ type: NetworkSettingsResponseDto })
  @ApiResponse({
    status: 400,
    description: 'El ajuste enviado no es válido.',
    schema: { $ref: getSchemaPath(NestBadRequestResponseDto) },
  })
  @apiErrorResponse(403, 'El rol o permiso no autoriza esta operación.', ['FORBIDDEN'])
  updateNetworkSettings(@Body() body: PatchNetworkSettingsDto, @CurrentUser() actor: JwtPayload) {
    return this.networkCatalogService.updateNetworkSettings(
      body.enforceProvisioningOnInstallClose,
      actor.sub,
    );
  }
}
