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
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '@iwana/shared';
import { SubscriberTaxProfileService } from './subscriber-tax-profile.service';
import { SaveTaxAssignmentsDto } from './dto/save-tax-assignments.dto';
import { UpsertTaxAssignmentDto } from './dto/upsert-tax-assignment.dto';
import { SubscriberTaxProfileSnapshotDto } from './dto/subscriber-tax-profile-snapshot.dto';

/**
 * Controlador REST del perfil tributario por suscriptor.
 *
 * Rutas declaradas con prefijo /subscribers/:subscriberId/tax-profile
 * para colgar del bounded context del cliente.
 *
 * Roles autorizados:
 * - ACCOUNTANT: operación completa de facturación (lectura, configuración).
 * - ADMIN: acceso administrativo completo.
 * - SYSTEM_ADMIN: acceso de plataforma.
 *
 * No se expone a roles sin privilegios sobre facturación.
 *
 * Ref: spec-2026-04-22 §9, BT-TAXMVP-06
 */
@ApiTags('subscribers')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('crm/subscribers/:subscriberId/tax-profile')
export class SubscriberTaxController {
  constructor(private readonly taxProfileService: SubscriberTaxProfileService) {}

  /**
   * Retorna el perfil tributario del suscriptor.
   * Si no existe aún, lo crea y sugiere IVA por estrato.
   * Usado por Suscriptor 360 y por el flujo de configuración de facturación.
   */
  @Get()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Obtener perfil tributario del suscriptor (Suscriptor 360)' })
  @ApiResponse({ status: 200, description: 'Perfil tributario del suscriptor.' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos.' })
  @ApiResponse({ status: 404, description: 'Suscriptor no encontrado.' })
  async getProfile(
    @Param('subscriberId', ParseUUIDPipe) subscriberId: string,
  ): Promise<{ data: SubscriberTaxProfileSnapshotDto }> {
    const data = await this.taxProfileService.getOrCreateProfile(subscriberId);
    return { data };
  }

  /**
   * Guarda (upsert) la lista completa de asignaciones tributarias del suscriptor.
   * El área de facturación usa este endpoint para confirmar o ajustar el checklist.
   */
  @Put('assignments')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Guardar asignaciones tributarias del suscriptor (bulk upsert)' })
  @ApiResponse({ status: 200, description: 'Asignaciones guardadas.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos.' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos.' })
  @ApiResponse({ status: 404, description: 'Suscriptor o definición tributaria no encontrada.' })
  async saveAssignments(
    @Param('subscriberId', ParseUUIDPipe) subscriberId: string,
    @Body() dto: SaveTaxAssignmentsDto,
    @Request() req: { user: { sub: string } },
  ): Promise<{ data: SubscriberTaxProfileSnapshotDto }> {
    const data = await this.taxProfileService.saveAssignments(
      subscriberId,
      dto.assignments,
      req.user.sub,
    );
    return { data };
  }

  /**
   * Actualiza una asignación tributaria individual.
   * Permite confirmar o ajustar manualmente un tributo específico.
   */
  @Patch('assignments/:assignmentId')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Actualizar una asignación tributaria individual del suscriptor' })
  @ApiResponse({ status: 200, description: 'Asignación actualizada.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos.' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos.' })
  @ApiResponse({ status: 404, description: 'Perfil o asignación no encontrada.' })
  async updateAssignment(
    @Param('subscriberId', ParseUUIDPipe) subscriberId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() dto: UpsertTaxAssignmentDto,
    @Request() req: { user: { sub: string } },
  ): Promise<{ data: SubscriberTaxProfileSnapshotDto }> {
    const data = await this.taxProfileService.updateAssignment(
      subscriberId,
      assignmentId,
      dto,
      req.user.sub,
    );
    return { data };
  }

  /**
   * Recalcula y actualiza la sugerencia de IVA del suscriptor basándose en el estrato actual.
   * Útil cuando el estrato del suscriptor cambia después de la creación del perfil.
   * Solo actualiza la asignación IVA si está en estado SUGGESTED; no sobreescribe confirmadas.
   */
  @Post('suggest-vat')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recalcular sugerencia IVA por estrato para el suscriptor' })
  @ApiResponse({ status: 200, description: 'Sugerencia IVA actualizada.' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos.' })
  @ApiResponse({ status: 404, description: 'Suscriptor o perfil no encontrado.' })
  async suggestVat(
    @Param('subscriberId', ParseUUIDPipe) subscriberId: string,
  ): Promise<{ data: SubscriberTaxProfileSnapshotDto }> {
    const data = await this.taxProfileService.suggestVatForSubscriber(subscriberId);
    return { data };
  }
}
