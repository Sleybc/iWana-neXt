import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Permissions } from '../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../access-control/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  CreateOrganizationSiteDto,
  replaceSiteAssignmentsSchema,
  replaceSiteBusinessHoursSchema,
  replaceSiteResponsibilitiesSchema,
  replaceCompanyBusinessHoursSchema,
  createBusinessHoursExceptionSchema,
  updateBusinessHoursExceptionSchema,
  ReplaceSiteAssignmentsDto,
  ReplaceSiteBusinessHoursDto,
  ReplaceSiteResponsibilitiesDto,
  ReplaceCompanyBusinessHoursDto,
  CreateBusinessHoursExceptionDto,
  UpdateBusinessHoursExceptionDto,
  UpdateOrganizationSiteDto,
} from './dto/organization-site.dto';
import { OrganizationService } from './organization.service';

type AuthenticatedRequest = {
  user: JwtPayload;
  ip: string;
  headers: Record<string, string | string[] | undefined>;
};

function getHeader(
  headers: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = headers[key];
  return Array.isArray(value) ? value[0] : value;
}

function buildAuditContext(req: AuthenticatedRequest) {
  return {
    userId: req.user.sub,
    ipAddress: req.ip,
    userAgent: getHeader(req.headers, 'user-agent') ?? null,
    requestId: getHeader(req.headers, 'x-request-id') ?? null,
  };
}

@ApiTags('organization')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('organization')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get('sites')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.ACCOUNTANT, UserRole.HR)
  @Permissions(AccessPermissionKey.ORGANIZATION_SITES_READ)
  @ApiOperation({ summary: 'Listar sedes organizacionales del tenant' })
  @ApiResponse({ status: 200, description: 'Listado de sedes disponible.' })
  async findAll() {
    const data = await this.organizationService.findAll();
    return { data };
  }

  @Post('sites')
  @Roles(UserRole.ADMIN)
  @Permissions(AccessPermissionKey.ORGANIZATION_SITES_MANAGE)
  @ApiOperation({ summary: 'Crear una sede organizacional tenant-aware' })
  @ApiResponse({ status: 201, description: 'Sede creada correctamente.' })
  async create(@Body() dto: CreateOrganizationSiteDto, @Request() req: AuthenticatedRequest) {
    const data = await this.organizationService.create(dto, buildAuditContext(req));

    return { data };
  }

  @Get('sites/:siteId')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.ACCOUNTANT, UserRole.HR)
  @Permissions(AccessPermissionKey.ORGANIZATION_SITES_READ)
  @ApiOperation({ summary: 'Obtener el detalle de una sede' })
  @ApiResponse({ status: 200, description: 'Detalle de la sede.' })
  async findOne(@Param('siteId', ParseUUIDPipe) siteId: string) {
    const data = await this.organizationService.findOne(siteId);
    return { data };
  }

  @Patch('sites/:siteId')
  @Roles(UserRole.ADMIN)
  @Permissions(AccessPermissionKey.ORGANIZATION_SITES_MANAGE)
  @ApiOperation({ summary: 'Actualizar datos básicos de una sede' })
  @ApiResponse({ status: 200, description: 'Sede actualizada correctamente.' })
  async update(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: UpdateOrganizationSiteDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const data = await this.organizationService.update(siteId, dto, buildAuditContext(req));

    return { data };
  }

  @Delete('sites/:siteId')
  @Roles(UserRole.ADMIN)
  @Permissions(AccessPermissionKey.ORGANIZATION_SITES_MANAGE)
  @ApiOperation({ summary: 'Dar de baja lógica a una sede organizacional' })
  @ApiResponse({ status: 200, description: 'Sede dada de baja correctamente.' })
  async remove(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    await this.organizationService.remove(siteId, buildAuditContext(req));

    return { message: 'Sede eliminada' };
  }

  @Put('sites/:siteId/business-hours')
  @Roles(UserRole.ADMIN)
  @Permissions(AccessPermissionKey.ORGANIZATION_HOURS_MANAGE)
  @ApiOperation({ summary: 'Reemplazar el horario institucional de una sede' })
  @ApiResponse({ status: 200, description: 'Horario actualizado.' })
  async replaceBusinessHours(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body(new ZodValidationPipe(replaceSiteBusinessHoursSchema)) dto: ReplaceSiteBusinessHoursDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const data = await this.organizationService.replaceBusinessHours(
      siteId,
      dto,
      buildAuditContext(req),
    );

    return { data };
  }

  @Put('sites/:siteId/assignments')
  @Roles(UserRole.ADMIN)
  @Permissions(AccessPermissionKey.ORGANIZATION_ASSIGNMENTS_MANAGE)
  @ApiOperation({ summary: 'Reemplazar asignaciones activas de usuarios para una sede' })
  @ApiResponse({ status: 200, description: 'Asignaciones actualizadas.' })
  async replaceAssignments(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body(new ZodValidationPipe(replaceSiteAssignmentsSchema)) dto: ReplaceSiteAssignmentsDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const data = await this.organizationService.replaceAssignments(
      siteId,
      dto,
      buildAuditContext(req),
    );

    return { data };
  }

  @Put('sites/:siteId/responsibilities')
  @Roles(UserRole.ADMIN)
  @Permissions(AccessPermissionKey.ORGANIZATION_ASSIGNMENTS_MANAGE)
  @ApiOperation({ summary: 'Reemplazar responsables activos de una sede' })
  @ApiResponse({ status: 200, description: 'Responsables actualizados.' })
  async replaceResponsibilities(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body(new ZodValidationPipe(replaceSiteResponsibilitiesSchema))
    dto: ReplaceSiteResponsibilitiesDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const data = await this.organizationService.replaceResponsibilities(
      siteId,
      dto,
      buildAuditContext(req),
    );

    return { data };
  }

  // ─── Horario base empresa ────────────────────────────────────────────────────

  @Get('business-hours/company')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.ACCOUNTANT)
  @Permissions(AccessPermissionKey.ORGANIZATION_HOURS_MANAGE)
  @ApiOperation({ summary: 'Obtener horario base de atención y recaudo a nivel empresa' })
  @ApiResponse({ status: 200, description: 'Horario base de empresa.' })
  async getCompanyHours() {
    const data = await this.organizationService.getCompanyHours();
    return { data };
  }

  @Put('business-hours/company')
  @Roles(UserRole.ADMIN)
  @Permissions(AccessPermissionKey.ORGANIZATION_HOURS_MANAGE)
  @ApiOperation({ summary: 'Reemplazar horario base de atención y recaudo a nivel empresa' })
  @ApiResponse({ status: 200, description: 'Horario base de empresa actualizado.' })
  async replaceCompanyHours(
    @Body(new ZodValidationPipe(replaceCompanyBusinessHoursSchema))
    dto: ReplaceCompanyBusinessHoursDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const data = await this.organizationService.replaceCompanyHours(dto, buildAuditContext(req));
    return { data };
  }

  // ─── Override semanal de sede (reset a horario base) ─────────────────────────

  @Delete('sites/:siteId/business-hours')
  @Roles(UserRole.ADMIN)
  @Permissions(AccessPermissionKey.ORGANIZATION_HOURS_MANAGE)
  @ApiOperation({ summary: 'Limpiar override semanal de sede y volver a horario base empresa' })
  @ApiResponse({ status: 200, description: 'Override eliminado; la sede usa horario base.' })
  async clearSiteOverride(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const data = await this.organizationService.clearSiteOverride(siteId, buildAuditContext(req));
    return { data };
  }

  // ─── Excepciones de horario por fecha ────────────────────────────────────────

  @Get('business-hours/exceptions')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.ACCOUNTANT)
  @Permissions(AccessPermissionKey.ORGANIZATION_HOURS_MANAGE)
  @ApiOperation({ summary: 'Listar excepciones de horario por fecha (festivos y cierres)' })
  @ApiResponse({ status: 200, description: 'Lista de excepciones.' })
  async getExceptions(@Query('siteId') siteId?: string) {
    const data = await this.organizationService.getExceptions(siteId);
    return { data };
  }

  @Post('business-hours/exceptions')
  @Roles(UserRole.ADMIN)
  @Permissions(AccessPermissionKey.ORGANIZATION_HOURS_MANAGE)
  @ApiOperation({ summary: 'Crear excepción de horario por fecha' })
  @ApiResponse({ status: 201, description: 'Excepción creada.' })
  async createException(
    @Body(new ZodValidationPipe(createBusinessHoursExceptionSchema))
    dto: CreateBusinessHoursExceptionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const data = await this.organizationService.createException(dto, buildAuditContext(req));
    return { data };
  }

  @Patch('business-hours/exceptions/:exceptionId')
  @Roles(UserRole.ADMIN)
  @Permissions(AccessPermissionKey.ORGANIZATION_HOURS_MANAGE)
  @ApiOperation({ summary: 'Actualizar excepción de horario por fecha' })
  @ApiResponse({ status: 200, description: 'Excepción actualizada.' })
  async updateException(
    @Param('exceptionId', ParseUUIDPipe) exceptionId: string,
    @Body(new ZodValidationPipe(updateBusinessHoursExceptionSchema))
    dto: UpdateBusinessHoursExceptionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const data = await this.organizationService.updateException(
      exceptionId,
      dto,
      buildAuditContext(req),
    );
    return { data };
  }

  @Delete('business-hours/exceptions/:exceptionId')
  @Roles(UserRole.ADMIN)
  @Permissions(AccessPermissionKey.ORGANIZATION_HOURS_MANAGE)
  @ApiOperation({ summary: 'Eliminar excepción de horario por fecha' })
  @ApiResponse({ status: 200, description: 'Excepción eliminada.' })
  async deleteException(
    @Param('exceptionId', ParseUUIDPipe) exceptionId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    await this.organizationService.deleteException(exceptionId, buildAuditContext(req));
    return { message: 'Excepción eliminada.' };
  }
}
