import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  AccessPermissionKey,
  CreatePrivacyIncident,
  ReportPrivacyIncident,
  UserRole,
  createPrivacyIncidentSchema,
  reportPrivacyIncidentSchema,
  privacyIncidentSchema,
} from '@iwana/shared';
import type { Request } from 'express';
import { Permissions } from '../../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { AuditEntity } from '../../audit/decorators/audit-entity.decorator';
import { SkipAudit } from '../../audit/decorators/skip-audit.decorator';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { IncidentsService } from './incidents.service';
import {
  createPrivacyIncidentRequestSchema,
  reportPrivacyIncidentRequestSchema,
  privacyIncidentResponseSchema,
  privacyIncidentsResponseSchema,
} from '../privacy-openapi.schemas';

type AuthenticatedRequest = Request & { user: JwtPayload };

@ApiTags('privacy')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@AuditEntity('PrivacyIncident')
@Controller('privacy/incidents')
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.PRIVACY_READ)
  @ApiOperation({ summary: 'Consultar incidentes de privacidad' })
  @ApiOkResponse({
    description: 'Incidentes y plazos de reporte calculados.',
    schema: privacyIncidentsResponseSchema,
  })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({ description: 'El rol o permiso no permite esta acción.' })
  async list() {
    const data = await this.incidentsService.list();
    data.forEach((incident) => privacyIncidentSchema.parse(incident));
    return { data };
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.PRIVACY_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Registrar un incidente de privacidad' })
  @ApiBody({ schema: createPrivacyIncidentRequestSchema })
  @ApiCreatedResponse({
    description: 'Incidente registrado con plazo para reporte a la SIC.',
    schema: privacyIncidentResponseSchema,
  })
  @ApiBadRequestResponse({ description: 'El cuerpo no cumple el contrato de incidente.' })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({ description: 'El rol o permiso no permite esta acción.' })
  async create(
    @Body(new ZodValidationPipe(createPrivacyIncidentSchema)) dto: CreatePrivacyIncident,
    @Req() request: AuthenticatedRequest,
  ) {
    const data = await this.incidentsService.create(dto, request.user);
    return { data: privacyIncidentSchema.parse(data) };
  }

  @Post(':id/reported')
  @Roles(UserRole.ADMIN, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.PRIVACY_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Registrar una sola vez el reporte del incidente' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiBody({ schema: reportPrivacyIncidentRequestSchema })
  @ApiOkResponse({
    description: 'Fecha civil y referencia del reporte guardadas.',
    schema: privacyIncidentResponseSchema,
  })
  @ApiConflictResponse({ description: 'El incidente ya fue reportado.' })
  @ApiResponse({ status: 404, description: 'El incidente no existe.' })
  @ApiResponse({ status: 422, description: 'La fecha no está entre la detección y hoy.' })
  async report(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reportPrivacyIncidentSchema)) dto: ReportPrivacyIncident,
    @Req() request: AuthenticatedRequest,
  ) {
    const data = await this.incidentsService.report(id, dto, request.user);
    return { data: privacyIncidentSchema.parse(data) };
  }
}
