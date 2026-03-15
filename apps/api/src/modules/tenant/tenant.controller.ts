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
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AuthService } from '../auth/auth.service';
import { PlatformRole } from '@iwana/shared';
import { TenantService } from './tenant.service';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { CreateTenantDto, TenantResponseDto, UpdateTenantDto } from './dto/tenant.dto';
import { TenantSettingsResponseDto, UpdateTenantSettingsDto } from './dto/tenant-settings.dto';

/**
 * Controlador de gestion de tenants.
 *
 * Todos los endpoints son de administracion de plataforma:
 * solo accesibles para SYSTEM_ADMIN e IWANA_SUPPORT.
 *
 * Pipeline de seguridad:
 *   JwtAuthGuard (verifica JWT RS256) → RolesGuard (verifica PlatformRole)
 *
 * Prefijo: /api/v1/tenants
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 2 (tenant.controller.ts)
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 4 (endpoints 16-21)
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
  ) {}

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
      adminEmail: tenant.contactEmail,
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
