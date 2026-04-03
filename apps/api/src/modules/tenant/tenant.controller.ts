import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AbacGuard } from '../auth/guards/abac.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AuthService } from '../auth/auth.service';
import { PlatformRole, UserRole } from '@iwana/shared';
import { TenantService } from './tenant.service';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { DashboardSummaryService } from './dashboard-summary.service';
import { CreateTenantDto, TenantResponseDto, UpdateTenantDto } from './dto/tenant.dto';
import { TenantSettingsResponseDto, UpdateTenantSettingsDto } from './dto/tenant-settings.dto';
import {
  DashboardSummaryResponseDto,
  TenantSelfResponseDto,
  TenantSelfSettingsResponseDto,
} from './dto/tenant-self.dto';
import {
  UpdateTenantSelfBrandingDto,
  UpdateTenantSelfProfileDto,
  UpdateTenantSelfSettingsDto,
} from './dto/tenant-self-update.dto';
import {
  CoverageAdminResponseDto,
  CoverageCheckQueryDto,
  CoverageCheckResponseDto,
  CreateCommercialNodeDto,
  CreateCoverageZoneDto,
  UpdateCommercialNodeDto,
  UpdateCoverageZoneDto,
} from './dto/tenant-commercial-coverage.dto';
import {
  CreatePlanCatalogItemDto,
  PlanCatalogItemResponseDto,
  UpdatePlanCatalogItemDto,
} from './dto/tenant-plan-catalog.dto';
import {
  CreateAdditionalProductDto,
  UpdateAdditionalProductDto,
  AdditionalProductResponseDto,
} from './dto/tenant-additional-products.dto';

/**
 * Controlador de gestion de tenants.
 *
 * Expone dos grupos de endpoints:
 *
 * 1. Self-service del tenant autenticado — accesibles para roles internos del tenant
 *    (ADMIN, NOC, ACCOUNTANT, SUPPORT). Prefijo: /tenants/me
 *    Pipeline: JwtAuthGuard → RolesGuard (UserRole)
 *
 * 2. Administración de plataforma — solo SYSTEM_ADMIN e IWANA_SUPPORT.
 *    Pipeline: JwtAuthGuard → RolesGuard (PlatformRole)
 *
 * IMPORTANTE: Los endpoints /me deben declararse ANTES de /:id para que Express
 * no interprete "me" como un UUID parámetro.
 *
 * Prefijo: /api/v1/tenants
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 2, Seccion 4
 * HLD-MOD02-DASHBOARD-EMPRESA-v1.0 §3.2 (contratos self-service)
 */
@Controller('tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('tenants')
@ApiBearerAuth('access-token')
export class TenantController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly provisioningService: TenantProvisioningService,
    private readonly authService: AuthService,
    private readonly dashboardSummaryService: DashboardSummaryService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // SELF-SERVICE DEL TENANT AUTENTICADO
  // Accesibles para roles internos: ADMIN, NOC, ACCOUNTANT, SUPPORT.
  // Declarados antes de /:id para que Express no interprete "me" como UUID.
  // HLD-MOD02-DASHBOARD-EMPRESA-v1.0 §3.2
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * GET /api/v1/tenants/me
   * Retorna los datos base del tenant del usuario autenticado.
   * No requiere privilegios de plataforma — solo JWT válido con tenantId.
   */
  @Get('me')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.ACCOUNTANT, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Obtener datos base del tenant autenticado (self-service)' })
  @ApiResponse({ status: 200, description: 'Datos base del tenant.' })
  @ApiResponse({ status: 404, description: 'Tenant no encontrado.' })
  async getMe(@CurrentUser() user: JwtPayload): Promise<{ data: TenantSelfResponseDto }> {
    const data = await this.tenantService.getTenantSelf(user.tenantId!);
    return { data };
  }

  /**
   * GET /api/v1/tenants/me/settings
   * Retorna la configuración operativa del tenant autenticado (self-service).
   * Accesible para todos los roles internos del tenant.
   */
  @Get('me/settings')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.ACCOUNTANT, UserRole.SUPPORT)
  @ApiOperation({
    summary: 'Obtener configuración operativa del tenant autenticado (self-service)',
  })
  @ApiResponse({ status: 200, description: 'Configuración operativa del tenant.' })
  async getMeSettings(
    @CurrentUser() user: JwtPayload,
  ): Promise<{ data: TenantSelfSettingsResponseDto }> {
    const data = await this.tenantService.getTenantSelfSettings(user.tenantId!);
    return { data };
  }

  /**
   * PATCH /api/v1/tenants/me/profile
   * Actualiza el perfil empresarial self-service del tenant autenticado.
   * Solo ADMIN puede modificar campos tenant-managed del perfil.
   */
  @Patch('me/profile')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Actualizar perfil empresarial del tenant autenticado' })
  @ApiResponse({ status: 200, description: 'Perfil empresarial actualizado.' })
  async patchMeProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateTenantSelfProfileDto,
  ): Promise<{ data: TenantSelfResponseDto }> {
    const data = await this.tenantService.updateTenantSelfProfile(user.tenantId!, dto, user.sub);
    return { data };
  }

  /**
   * PATCH /api/v1/tenants/me/settings
   * Actualiza la configuración operativa del tenant autenticado (self-service).
   * Solo ADMIN puede modificar la configuración de la empresa.
   */
  @Patch('me/settings')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Actualizar configuración operativa del tenant autenticado' })
  @ApiResponse({ status: 200, description: 'Configuración actualizada.' })
  async patchMeSettings(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateTenantSelfSettingsDto,
  ): Promise<{ data: TenantSelfSettingsResponseDto }> {
    const data = await this.tenantService.updateTenantSelfSettings(user.tenantId!, dto, user.sub);
    return { data };
  }

  /**
   * PATCH /api/v1/tenants/me/branding
   * Actualiza el branding self-service del tenant autenticado (logo, sello, preferencia nombre).
   * Solo ADMIN.
   */
  @Patch('me/branding')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Actualizar branding del tenant autenticado' })
  @ApiResponse({ status: 200, description: 'Branding actualizado.' })
  async patchMeBranding(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateTenantSelfBrandingDto,
  ): Promise<{ data: TenantSelfResponseDto }> {
    const data = await this.tenantService.updateTenantSelfBranding(user.tenantId!, dto, user.sub);
    return { data };
  }

  /**
   * GET /api/v1/tenants/me/summary
   * Retorna el summary del dashboard empresarial: datos del tenant, métricas iniciales
   * y alertas de onboarding. Solo para ADMIN — es el rol con visibilidad completa en MVP.
   *
   * HLD-MOD02-DASHBOARD-EMPRESA-v1.0 §5.2 (Matriz de visibilidad: ADMIN ve todo)
   */
  @Get('me/summary')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Obtener summary del dashboard empresarial (solo ADMIN)' })
  @ApiResponse({ status: 200, description: 'Summary del dashboard.' })
  async getMeSummary(
    @CurrentUser() user: JwtPayload,
  ): Promise<{ data: DashboardSummaryResponseDto }> {
    const data = await this.dashboardSummaryService.getSummary(user.tenantId!, user.schemaName!);
    return { data };
  }

  /**
   * GET /api/v1/tenants/me/coverage
   * Retorna la configuración comercial de cobertura del tenant autenticado.
   */
  @Get('me/coverage')
  @UseGuards(JwtAuthGuard, RolesGuard, AbacGuard)
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.ACCOUNTANT, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Obtener cobertura comercial del tenant autenticado' })
  async getMeCoverage(
    @CurrentUser() user: JwtPayload,
  ): Promise<{ data: CoverageAdminResponseDto }> {
    const data = await this.tenantService.getCoverageAdmin(user.tenantId!, user.schemaName!);
    return { data };
  }

  /**
   * GET /api/v1/tenants/me/coverage/check
   * Evalúa factibilidad comercial para una dirección y coordenadas opcionales.
   */
  @Get('me/coverage/check')
  @UseGuards(JwtAuthGuard, RolesGuard, AbacGuard)
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.ACCOUNTANT, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Validar factibilidad comercial del tenant autenticado' })
  async checkMeCoverage(
    @CurrentUser() user: JwtPayload,
    @Query() query: CoverageCheckQueryDto,
  ): Promise<{ data: CoverageCheckResponseDto }> {
    const data = await this.tenantService.checkCoverage(
      user.tenantId!,
      user.schemaName!,
      query.address,
      query.latitude,
      query.longitude,
    );
    return { data };
  }

  @Post('me/coverage/nodes')
  @UseGuards(JwtAuthGuard, RolesGuard, AbacGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear nodo comercial en cobertura del tenant autenticado' })
  async createCoverageNode(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateCommercialNodeDto,
  ): Promise<{ data: CoverageAdminResponseDto }> {
    const data = await this.tenantService.createCommercialNode(
      user.tenantId!,
      user.schemaName!,
      dto,
      user.sub,
    );
    return { data };
  }

  @Patch('me/coverage/nodes/:nodeId')
  @UseGuards(JwtAuthGuard, RolesGuard, AbacGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar nodo comercial del tenant autenticado' })
  async updateCoverageNode(
    @CurrentUser() user: JwtPayload,
    @Param('nodeId', ParseUUIDPipe) nodeId: string,
    @Body() dto: UpdateCommercialNodeDto,
  ): Promise<{ data: CoverageAdminResponseDto }> {
    const data = await this.tenantService.updateCommercialNode(
      user.tenantId!,
      user.schemaName!,
      nodeId,
      dto,
      user.sub,
    );
    return { data };
  }

  @Delete('me/coverage/nodes/:nodeId')
  @UseGuards(JwtAuthGuard, RolesGuard, AbacGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar (soft-delete) nodo comercial del tenant autenticado' })
  async removeCoverageNode(
    @CurrentUser() user: JwtPayload,
    @Param('nodeId', ParseUUIDPipe) nodeId: string,
  ): Promise<{ data: CoverageAdminResponseDto }> {
    const data = await this.tenantService.removeCoverageNode(
      user.tenantId!,
      user.schemaName!,
      nodeId,
      user.sub,
    );
    return { data };
  }

  @Post('me/coverage/zones')
  @UseGuards(JwtAuthGuard, RolesGuard, AbacGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear zona comercial de cobertura del tenant autenticado' })
  async createCoverageZone(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateCoverageZoneDto,
  ): Promise<{ data: CoverageAdminResponseDto }> {
    const data = await this.tenantService.createCoverageZone(
      user.tenantId!,
      user.schemaName!,
      dto,
      user.sub,
    );
    return { data };
  }

  @Patch('me/coverage/zones/:zoneId')
  @UseGuards(JwtAuthGuard, RolesGuard, AbacGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar zona comercial de cobertura del tenant autenticado' })
  async updateCoverageZone(
    @CurrentUser() user: JwtPayload,
    @Param('zoneId', ParseUUIDPipe) zoneId: string,
    @Body() dto: UpdateCoverageZoneDto,
  ): Promise<{ data: CoverageAdminResponseDto }> {
    const data = await this.tenantService.updateCoverageZone(
      user.tenantId!,
      user.schemaName!,
      zoneId,
      dto,
      user.sub,
    );
    return { data };
  }

  @Delete('me/coverage/zones/:zoneId')
  @UseGuards(JwtAuthGuard, RolesGuard, AbacGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar (soft-delete) zona de cobertura del tenant autenticado' })
  async removeCoverageZone(
    @CurrentUser() user: JwtPayload,
    @Param('zoneId', ParseUUIDPipe) zoneId: string,
  ): Promise<{ data: CoverageAdminResponseDto }> {
    const data = await this.tenantService.removeCoverageZone(
      user.tenantId!,
      user.schemaName!,
      zoneId,
      user.sub,
    );
    return { data };
  }

  @Get('me/plans')
  @UseGuards(JwtAuthGuard, RolesGuard, AbacGuard)
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.ACCOUNTANT, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Listar catálogo de planes del tenant autenticado' })
  async getPlans(@CurrentUser() user: JwtPayload): Promise<{ data: PlanCatalogItemResponseDto[] }> {
    const data = await this.tenantService.getPlanCatalog(user.tenantId!, user.schemaName!);
    return { data };
  }

  @Post('me/plans')
  @UseGuards(JwtAuthGuard, RolesGuard, AbacGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear plan en catálogo del tenant autenticado' })
  async createPlan(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePlanCatalogItemDto,
  ): Promise<{ data: PlanCatalogItemResponseDto[] }> {
    const data = await this.tenantService.createPlanCatalogItem(
      user.tenantId!,
      user.schemaName!,
      dto,
      user.sub,
    );
    return { data };
  }

  @Patch('me/plans/:planId')
  @UseGuards(JwtAuthGuard, RolesGuard, AbacGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar plan en catálogo del tenant autenticado' })
  async updatePlan(
    @CurrentUser() user: JwtPayload,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() dto: UpdatePlanCatalogItemDto,
  ): Promise<{ data: PlanCatalogItemResponseDto[] }> {
    const data = await this.tenantService.updatePlanCatalogItem(
      user.tenantId!,
      user.schemaName!,
      planId,
      dto,
      user.sub,
    );
    return { data };
  }

  @Delete('me/plans/:planId')
  @UseGuards(JwtAuthGuard, RolesGuard, AbacGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar (soft-delete) plan del catálogo del tenant autenticado' })
  async removePlan(
    @CurrentUser() user: JwtPayload,
    @Param('planId', ParseUUIDPipe) planId: string,
  ): Promise<{ data: PlanCatalogItemResponseDto[] }> {
    const data = await this.tenantService.removePlanCatalogItem(
      user.tenantId!,
      user.schemaName!,
      planId,
      user.sub,
    );
    return { data };
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // ADDITIONAL PRODUCTS
  // ══════════════════════════════════════════════════════════════════════════════

  @Get('me/additional-products')
  @UseGuards(JwtAuthGuard, RolesGuard, AbacGuard)
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.ACCOUNTANT, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Listar productos adicionales del tenant autenticado' })
  async getAdditionalProducts(
    @CurrentUser() user: JwtPayload,
  ): Promise<{ data: AdditionalProductResponseDto[] }> {
    const data = await this.tenantService.getAdditionalProducts(user.tenantId!, user.schemaName!);
    return { data };
  }

  @Post('me/additional-products')
  @UseGuards(JwtAuthGuard, RolesGuard, AbacGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear producto adicional para el tenant autenticado' })
  async createAdditionalProduct(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateAdditionalProductDto,
  ): Promise<{ data: AdditionalProductResponseDto[] }> {
    const data = await this.tenantService.createAdditionalProduct(
      user.tenantId!,
      user.schemaName!,
      dto,
      user.sub,
    );
    return { data };
  }

  @Patch('me/additional-products/:productId')
  @UseGuards(JwtAuthGuard, RolesGuard, AbacGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar producto adicional del tenant autenticado' })
  async updateAdditionalProduct(
    @CurrentUser() user: JwtPayload,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: UpdateAdditionalProductDto,
  ): Promise<{ data: AdditionalProductResponseDto[] }> {
    const data = await this.tenantService.updateAdditionalProduct(
      user.tenantId!,
      user.schemaName!,
      productId,
      dto,
      user.sub,
    );
    return { data };
  }

  @Delete('me/additional-products/:productId')
  @UseGuards(JwtAuthGuard, RolesGuard, AbacGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar (soft-delete) producto adicional del tenant' })
  async removeAdditionalProduct(
    @CurrentUser() user: JwtPayload,
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<{ data: AdditionalProductResponseDto[] }> {
    const data = await this.tenantService.removeAdditionalProduct(
      user.tenantId!,
      user.schemaName!,
      productId,
      user.sub,
    );
    return { data };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ADMINISTRACIÓN DE PLATAFORMA — Solo SYSTEM_ADMIN e IWANA_SUPPORT
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * POST /api/v1/tenants
   * Crea un nuevo tenant e inicia el provisioning del schema PostgreSQL via BullMQ.
   * Solo SYSTEM_ADMIN.
   */
  @Post()
  @Roles(PlatformRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Crear tenant e iniciar provisioning del schema PostgreSQL' })
  @ApiResponse({ status: 201, description: 'Tenant creado, provisioning en cola.' })
  @ApiResponse({ status: 409, description: 'Slug duplicado.' })
  async create(@Body() dto: CreateTenantDto): Promise<{ data: TenantResponseDto }> {
    const tenant = await this.tenantService.create(dto);

    // Encolar provisioning del schema PostgreSQL (BullMQ worker)
    await this.provisioningService.enqueue({
      tenantId: tenant.id,
      schemaName: tenant.schemaName,
      tenantSlug: tenant.slug,
    });

    return { data: tenant };
  }

  /**
   * GET /api/v1/tenants
   * Lista todos los tenants con paginacion basica.
   * Solo SYSTEM_ADMIN e IWANA_SUPPORT.
   */
  @Get()
  @Roles(PlatformRole.SYSTEM_ADMIN, PlatformRole.IWANA_SUPPORT)
  @ApiOperation({ summary: 'Listar tenants con paginacion' })
  @ApiResponse({ status: 200, description: 'Lista de tenants.' })
  async findAll(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<{ data: TenantResponseDto[]; meta: { total: number } }> {
    const parsedLimit = Math.min(parseInt(limit ?? '50', 10) || 50, 100);
    const parsedOffset = parseInt(offset ?? '0', 10) || 0;

    const result = await this.tenantService.findAll(parsedLimit, parsedOffset);
    return {
      data: result.data,
      meta: { total: result.total },
    };
  }

  /**
   * GET /api/v1/tenants/:id
   * Obtiene un tenant por UUID.
   * Solo SYSTEM_ADMIN e IWANA_SUPPORT.
   */
  @Get(':id')
  @Roles(PlatformRole.SYSTEM_ADMIN, PlatformRole.IWANA_SUPPORT)
  @ApiOperation({ summary: 'Obtener tenant por UUID' })
  @ApiResponse({ status: 200, description: 'Datos del tenant.' })
  @ApiResponse({ status: 404, description: 'Tenant no encontrado.' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<{ data: TenantResponseDto }> {
    const tenant = await this.tenantService.findOne(id);
    return { data: tenant };
  }

  /**
   * GET /api/v1/tenants/:id/settings
   * Retorna la configuracion funcional normalizada del tenant.
   */
  @Get(':id/settings')
  @Roles(PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Obtener configuración funcional del tenant' })
  async getSettings(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ data: TenantSettingsResponseDto }> {
    const data = await this.tenantService.getSettings(id);
    return { data };
  }

  /**
   * PATCH /api/v1/tenants/:id/settings
   * Actualiza configuracion funcional del tenant con validacion explicita.
   */
  @Patch(':id/settings')
  @Roles(PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Actualizar configuración funcional del tenant' })
  async updateSettings(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantSettingsDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ data: TenantSettingsResponseDto }> {
    const data = await this.tenantService.updateSettings(id, dto, user.sub);
    return { data };
  }

  /**
   * PATCH /api/v1/tenants/:id
   * Actualiza parcialmente un tenant (nombre, status, email, limites).
   * slug y schemaName son inmutables post-creacion.
   * Solo SYSTEM_ADMIN.
   */
  @Patch(':id')
  @Roles(PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Actualizar datos del tenant (slug y schema son inmutables)' })
  @ApiResponse({ status: 200, description: 'Tenant actualizado.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantDto,
  ): Promise<{ data: TenantResponseDto }> {
    const tenant = await this.tenantService.update(id, dto);
    return { data: tenant };
  }

  /**
   * PATCH /api/v1/tenants/:id/suspend
   * Suspende un tenant para bloquear acceso operativo inmediato.
   */
  @Patch(':id/suspend')
  @Roles(PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Suspender tenant — bloquea acceso operativo inmediato' })
  @ApiResponse({ status: 200, description: 'Tenant suspendido.' })
  async suspend(@Param('id', ParseUUIDPipe) id: string): Promise<{ data: TenantResponseDto }> {
    const tenant = await this.tenantService.suspend(id);
    return { data: tenant };
  }

  /**
   * PATCH /api/v1/tenants/:id/activate
   * Reactiva un tenant cuando la operación de plataforma lo autoriza.
   */
  @Patch(':id/activate')
  @Roles(PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Reactivar tenant previamente suspendido' })
  @ApiResponse({ status: 200, description: 'Tenant reactivado.' })
  async activate(@Param('id', ParseUUIDPipe) id: string): Promise<{ data: TenantResponseDto }> {
    const tenant = await this.tenantService.activate(id);
    return { data: tenant };
  }

  /**
   * PATCH /api/v1/tenants/:id/retry-provisioning
   * Reintenta el provisioning de un tenant en estado PROVISIONING_FAILED.
   */
  @Patch(':id/retry-provisioning')
  @Roles(PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Reintentar provisioning de tenant fallido' })
  @ApiResponse({ status: 200, description: 'Provisioning reencolado.' })
  async retryProvisioning(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ data: TenantResponseDto }> {
    const tenant = await this.tenantService.findOne(id);
    await this.provisioningService.retryProvisioning(tenant.id, tenant.schemaName, tenant.slug);
    return { data: tenant };
  }

  /**
   * POST /api/v1/tenants/:id/bootstrap-admin-credentials
   * Expone el acceso bootstrap fijo del ADMIN inicial solo mientras siga vigente.
   */
  @Post(':id/bootstrap-admin-credentials')
  @Roles(PlatformRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Consultar acceso inicial fijo del ADMIN bootstrap del tenant' })
  @ApiResponse({ status: 200, description: 'Acceso inicial vigente.' })
  @ApiResponse({ status: 409, description: 'El acceso inicial ya no está disponible.' })
  async getBootstrapAdminCredentials(@Param('id', ParseUUIDPipe) id: string): Promise<{
    data: {
      message: string;
      adminEmail: string;
      temporaryPassword: string;
      expiresAt: string;
    };
  }> {
    const tenant = await this.tenantService.findOne(id);
    const credentials = await this.authService.getBootstrapTenantAdminCredentials({
      tenantId: tenant.id,
      schemaName: tenant.schemaName,
    });

    return { data: credentials };
  }

  /**
   * POST /api/v1/tenants/:id/regenerate-admin-credentials
   * Regenera las credenciales temporales del ADMIN inicial del tenant.
   *
   * Requiere `Idempotency-Key` para que reintentos operativos no generen
   * passwords distintos si el cliente repite la misma operacion.
   */
  @Post(':id/regenerate-admin-credentials')
  @Roles(PlatformRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Regenerar credenciales temporales del ADMIN inicial del tenant' })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'Clave de idempotencia obligatoria',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'Credenciales regeneradas.' })
  @ApiResponse({ status: 400, description: 'Idempotency-Key faltante.' })
  async regenerateAdminCredentials(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<{
    data: {
      message: string;
      adminEmail: string;
      temporaryPassword: string;
      expiresAt: string;
    };
  }> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('El header Idempotency-Key es obligatorio.');
    }

    const tenant = await this.tenantService.findOne(id);
    const credentials = await this.authService.regenerateTenantAdminCredentials({
      tenantId: tenant.id,
      schemaName: tenant.schemaName,
      idempotencyKey: idempotencyKey.trim(),
    });

    return { data: credentials };
  }

  /**
   * DELETE /api/v1/tenants/:id
   * Elimina un tenant y su schema PostgreSQL.
   * OPERACION DESTRUCTIVA - solo SYSTEM_ADMIN.
   */
  @Delete(':id')
  @Roles(PlatformRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar tenant y su schema PostgreSQL' })
  @ApiResponse({ status: 204, description: 'Tenant eliminado.' })
  @ApiResponse({ status: 404, description: 'Tenant no encontrado.' })
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.tenantService.delete(id);
  }
}
