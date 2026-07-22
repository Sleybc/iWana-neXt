import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PlatformRole, UserRole } from '@iwana/shared';
import { TaxDefinitionService } from './services/tax-definition.service';
import {
  CreateTaxDefinitionInput,
  ListTaxDefinitionQueryDto,
  UpdateTaxDefinitionInput,
} from './dto';
import { TaxDefinition } from './entities/tax-definition.entity';

/**
 * Controlador de gestión de definiciones tributarias por tenant.
 *
 * Todos los endpoints requieren JWT válido y resolución de tenant por TenantMiddleware.
 *
 * Accesos:
 * - GET, POST, PATCH: ADMIN | ACCOUNTANT | SYSTEM_ADMIN
 * - DELETE: ADMIN | SYSTEM_ADMIN (solo roles de máxima autoridad)
 *
 * Reglas:
 * - CREATE siempre fuerza origin=CUSTOM.
 *
 * HLD-MOD07-TRIBUTACION §5 — Endpoints REST versionada
 */
@ApiTags('taxation')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('taxation')
export class TaxationController {
  constructor(private readonly taxDefinitionService: TaxDefinitionService) {}

  /**
   * Lista definiciones tributarias con filtros opcionales.
   * Por defecto excluye inactivas; usar `isActive=false` para incluirlas.
   */
  @Get('definitions')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Listar definiciones tributarias del tenant con filtros' })
  @ApiResponse({ status: 200, description: 'Lista de definiciones tributarias.' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos suficientes.' })
  async findAll(@Query() query: ListTaxDefinitionQueryDto): Promise<{ data: TaxDefinition[] }> {
    const data = await this.taxDefinitionService.findAll(query);
    return { data };
  }

  /**
   * Obtiene una definición tributaria por ID.
   */
  @Get('definitions/:id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Obtener definición tributaria por ID' })
  @ApiResponse({ status: 200, description: 'Definición tributaria encontrada.' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos suficientes.' })
  @ApiResponse({ status: 404, description: 'Definición no encontrada.' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<{ data: TaxDefinition }> {
    const data = await this.taxDefinitionService.findOne(id);
    return { data };
  }

  /**
   * Crea una nueva definición tributaria con origen CUSTOM.
   * Valida unicidad del código (case-insensitive, normalizado a UPPER).
   */
  @Post('definitions')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, PlatformRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear definición tributaria personalizada (origen CUSTOM)' })
  @ApiResponse({ status: 201, description: 'Definición tributaria creada exitosamente.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o código duplicado.' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos suficientes.' })
  async create(@Body() dto: CreateTaxDefinitionInput): Promise<{ data: TaxDefinition }> {
    const data = await this.taxDefinitionService.create(dto);
    return { data };
  }

  /**
   * Actualiza una definición tributaria existente.
   */
  @Patch('definitions/:id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Actualizar definición tributaria' })
  @ApiResponse({ status: 200, description: 'Definición tributaria actualizada exitosamente.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos.' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado.' })
  @ApiResponse({
    status: 403,
    description: 'Sin permisos suficientes.',
  })
  @ApiResponse({ status: 404, description: 'Definición no encontrada.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaxDefinitionInput,
  ): Promise<{ data: TaxDefinition }> {
    const data = await this.taxDefinitionService.update(id, dto);
    return { data };
  }

  /**
   * Elimina (soft delete) una definición tributaria.
   * Solo roles con autoridad máxima (ADMIN, SYSTEM_ADMIN).
   */
  @Delete('definitions/:id')
  @Roles(UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Eliminar definición tributaria' })
  @ApiResponse({ status: 200, description: 'Definición tributaria desactivada exitosamente.' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado.' })
  @ApiResponse({
    status: 403,
    description: 'Sin permisos suficientes.',
  })
  @ApiResponse({ status: 404, description: 'Definición no encontrada.' })
  async softDelete(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    await this.taxDefinitionService.softDelete(id);
    return { message: 'Definición de impuesto desactivada' };
  }
}
