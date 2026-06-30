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
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AccessControlService } from './access-control.service';
import { Permissions } from './decorators/permissions.decorator';
import {
  CreateAccessProfileDto,
  replaceProfilePermissionsSchema,
  replaceUserProfilesSchema,
  ReplaceProfilePermissionsDto,
  ReplaceUserProfilesDto,
  UpdateAccessProfileDto,
} from './dto/access-control.dto';
import { PermissionsGuard } from './guards/permissions.guard';

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

@ApiTags('access-control')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('access-control')
export class AccessControlController {
  constructor(private readonly accessControlService: AccessControlService) {}

  @Get('permissions')
  @Roles(UserRole.ADMIN)
  @Permissions(AccessPermissionKey.ACCESS_PERMISSIONS_READ)
  @ApiOperation({ summary: 'Obtener el catálogo tenant-aware de permisos MOD00_ACCESS_V1' })
  @ApiResponse({ status: 200, description: 'Catálogo de permisos y matriz de compatibilidad.' })
  async listPermissions() {
    const data = await this.accessControlService.listPermissions();
    return { data };
  }

  @Get('profiles')
  @Roles(UserRole.ADMIN)
  @Permissions(AccessPermissionKey.ACCESS_PROFILES_READ)
  @ApiOperation({ summary: 'Listar perfiles de acceso configurables del tenant' })
  @ApiResponse({ status: 200, description: 'Listado de perfiles configurables.' })
  async listProfiles() {
    const data = await this.accessControlService.listProfiles();
    return { data };
  }

  @Post('profiles')
  @Roles(UserRole.ADMIN)
  @Permissions(AccessPermissionKey.ACCESS_PROFILES_MANAGE)
  @ApiOperation({ summary: 'Crear perfil de acceso complementario al rol base' })
  @ApiResponse({ status: 201, description: 'Perfil creado correctamente.' })
  async createProfile(@Body() dto: CreateAccessProfileDto, @Request() req: AuthenticatedRequest) {
    const data = await this.accessControlService.createProfile(dto, buildAuditContext(req));

    return { data };
  }

  @Patch('profiles/:id')
  @Roles(UserRole.ADMIN)
  @Permissions(AccessPermissionKey.ACCESS_PROFILES_MANAGE)
  @ApiOperation({ summary: 'Editar datos básicos de un perfil de acceso' })
  @ApiResponse({ status: 200, description: 'Perfil actualizado correctamente.' })
  async updateProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccessProfileDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const data = await this.accessControlService.updateProfile(id, dto, buildAuditContext(req));

    return { data };
  }

  @Delete('profiles/:id')
  @Roles(UserRole.ADMIN)
  @Permissions(AccessPermissionKey.ACCESS_PROFILES_MANAGE)
  @ApiOperation({ summary: 'Eliminar lógicamente un perfil de acceso no sistema' })
  @ApiResponse({ status: 200, description: 'Perfil eliminado correctamente.' })
  async removeProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    await this.accessControlService.removeProfile(id, buildAuditContext(req));

    return { message: 'Perfil eliminado' };
  }

  @Put('profiles/:id/permissions')
  @Roles(UserRole.ADMIN)
  @Permissions(AccessPermissionKey.ACCESS_PROFILES_MANAGE)
  @ApiOperation({ summary: 'Reemplazar permisos activos de un perfil' })
  @ApiResponse({ status: 200, description: 'Permisos del perfil actualizados.' })
  async replaceProfilePermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(replaceProfilePermissionsSchema)) dto: ReplaceProfilePermissionsDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const data = await this.accessControlService.replaceProfilePermissions(
      id,
      dto,
      buildAuditContext(req),
    );

    return { data };
  }

  @Put('users/:userId/profiles')
  @Roles(UserRole.ADMIN)
  @Permissions(AccessPermissionKey.ACCESS_ASSIGNMENTS_MANAGE)
  @ApiOperation({ summary: 'Reemplazar perfiles activos de un usuario del tenant' })
  @ApiResponse({ status: 200, description: 'Perfiles de usuario actualizados.' })
  async replaceUserProfiles(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(replaceUserProfilesSchema)) dto: ReplaceUserProfilesDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const data = await this.accessControlService.replaceUserProfiles(
      userId,
      dto,
      buildAuditContext(req),
    );

    return { data };
  }

  @Get('me/effective-permissions')
  @Roles(
    UserRole.ADMIN,
    UserRole.NOC,
    UserRole.SUPPORT,
    UserRole.SALES,
    UserRole.TECHNICIAN,
    UserRole.ACCOUNTANT,
    UserRole.HR,
    UserRole.AUDITOR,
    UserRole.CONTRACTOR,
  )
  @ApiOperation({ summary: 'Consultar permisos efectivos del usuario autenticado' })
  @ApiResponse({
    status: 200,
    description: 'Resumen self-service de permisos efectivos del usuario autenticado.',
  })
  async getMyEffectivePermissions(@Request() req: AuthenticatedRequest) {
    const data = await this.accessControlService.getEffectivePermissionsSummary(req.user.sub);

    return { data };
  }

  @Get('users/:userId/effective-permissions')
  @Roles(UserRole.ADMIN)
  @Permissions(AccessPermissionKey.ACCESS_PROFILES_READ)
  @ApiOperation({ summary: 'Consultar permisos efectivos de un usuario del tenant' })
  @ApiResponse({
    status: 200,
    description: 'Resumen de permisos efectivos por rol base y perfiles activos.',
  })
  async getEffectivePermissions(@Param('userId', ParseUUIDPipe) userId: string) {
    const data = await this.accessControlService.getEffectivePermissionsSummary(userId);

    return { data };
  }
}
