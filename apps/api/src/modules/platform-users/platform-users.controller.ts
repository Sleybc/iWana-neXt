import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { PlatformRole } from '@iwana/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SkipAudit } from '../audit/decorators/skip-audit.decorator';
import { AuditRequestContext } from '../audit/interfaces/audit-request-context.interface';
import { AuthService } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlatformOnlyGuard } from '../auth/guards/platform-only.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PlatformUser } from '@iwana/db';
import { CreatePlatformUserBootstrapDto } from './dto/create-platform-user-bootstrap.dto';
import {
  CreatePlatformUserDto,
  CreatePlatformUserResponseDto,
} from './dto/create-platform-user.dto';
import {
  PlatformUserDirectoryResponseDto,
  QueryPlatformUserDirectoryDto,
  SearchPlatformUserDirectoryDto,
  SearchPlatformUserDirectorySchema,
  type SearchPlatformUserDirectory,
} from './dto/platform-user-directory.dto';
import { PlatformUserResponseDto } from './dto/platform-user-response.dto';
import { PlatformUsersSummaryResponseDto } from './dto/platform-users-summary.dto';
import {
  ChangePlatformUserLoginEmailDto,
  ChangePlatformUserPasswordDto,
  UpdatePlatformUserDto,
  UpdatePlatformUserNameDto,
} from './dto/update-platform-user.dto';
import { PlatformUsersService } from './platform-users.service';

@Controller('platform-users')
@UseGuards(JwtAuthGuard, RolesGuard, PlatformOnlyGuard)
@ApiTags('platform-users')
@ApiBearerAuth('access-token')
export class PlatformUsersController {
  constructor(
    private readonly platformUsersService: PlatformUsersService,
    private readonly authService: AuthService,
  ) {}

  /**
   * Extrae IP y User-Agent para las entradas de auditoría que emite el servicio.
   *
   * Los handlers CUD de este controlador llevan `@SkipAudit()`: emiten su propia
   * entrada semántica en lugar de la genérica del interceptor, así que el origen
   * de la petición hay que pasarlo a mano (S-8).
   */
  private static auditContext(req: ExpressRequest): AuditRequestContext {
    return {
      ipAddress: req.ip ?? req.socket?.remoteAddress ?? null,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    };
  }

  @Get('bootstrap/status')
  @Public()
  @ApiOperation({ summary: 'Estado del bootstrap de plataforma — indica si hay usuarios creados' })
  async getBootstrapStatus(): Promise<{ data: { hasUsers: boolean; pendingUser: boolean } }> {
    const data = await this.platformUsersService.getBootstrapStatus();
    return { data };
  }

  @Post('bootstrap')
  @Public()
  @SkipAudit()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Crea el usuario admin inicial de plataforma y retorna un token de inscripción MFA (solo desarrollo)',
  })
  @ApiResponse({ status: 201, description: 'Usuario admin creado y token de inscripción emitido.' })
  @ApiResponse({ status: 404, description: 'Fuera de desarrollo y pruebas.' })
  @ApiResponse({ status: 409, description: 'Ya existen usuarios o email inválido.' })
  async createBootstrapUser(
    @Body() dto: CreatePlatformUserBootstrapDto,
    @Request() req: ExpressRequest,
  ): Promise<{ data: { accessToken: string; mfaSetupRequired: true } }> {
    const user = await this.platformUsersService.createBootstrapUser(
      dto,
      PlatformUsersController.auditContext(req),
    );
    const accessToken = await this.authService.signPlatformEnrollmentToken(user.id);
    return { data: { accessToken, mfaSetupRequired: true } };
  }

  /**
   * GET /api/v1/platform-users/summary — `PlatformUsersSummary` v1.0.
   * Mismos guards y roles que el resto del controlador; declarado antes de
   * cualquier ruta con parámetro.
   */
  @Get('summary')
  @Roles(PlatformRole.SYSTEM_ADMIN, PlatformRole.IWANA_SUPPORT)
  @ApiOperation({ summary: 'Resumen de usuarios internos para la portada de plataforma' })
  @ApiResponse({ status: 200, description: 'Resumen.', type: PlatformUsersSummaryResponseDto })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado.' })
  @ApiResponse({ status: 403, description: 'Requiere un token de plataforma.' })
  async getSummary(): Promise<PlatformUsersSummaryResponseDto> {
    return { data: await this.platformUsersService.getSummary() };
  }

  @Get()
  @Roles(PlatformRole.SYSTEM_ADMIN, PlatformRole.IWANA_SUPPORT)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Listar cuentas de plataforma' })
  @ApiResponse({ status: 200, type: PlatformUserDirectoryResponseDto })
  @ApiResponse({ status: 400, description: 'Página inválida.' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado.' })
  @ApiResponse({ status: 403, description: 'Requiere un token de plataforma.' })
  async listDirectory(
    @Query() query: QueryPlatformUserDirectoryDto,
    @CurrentUser() user: JwtPayload,
    @Request() req: ExpressRequest,
  ): Promise<PlatformUserDirectoryResponseDto> {
    return {
      data: await this.platformUsersService.listDirectory(
        query.page,
        user,
        PlatformUsersController.auditContext(req),
      ),
    };
  }

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @Roles(PlatformRole.SYSTEM_ADMIN, PlatformRole.IWANA_SUPPORT)
  @SkipAudit()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Buscar cuentas de plataforma por nombre o estado' })
  @ApiBody({ type: SearchPlatformUserDirectoryDto })
  @ApiResponse({ status: 200, type: PlatformUserDirectoryResponseDto })
  @ApiResponse({ status: 400, description: 'Criterios de búsqueda inválidos.' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado.' })
  @ApiResponse({ status: 403, description: 'Requiere un token de plataforma.' })
  async searchDirectory(
    @Body(new ZodValidationPipe(SearchPlatformUserDirectorySchema))
    { page, ...filters }: SearchPlatformUserDirectory,
    @CurrentUser() user: JwtPayload,
    @Request() req: ExpressRequest,
  ): Promise<PlatformUserDirectoryResponseDto> {
    return {
      data: await this.platformUsersService.listDirectory(
        page,
        user,
        PlatformUsersController.auditContext(req),
        filters,
      ),
    };
  }

  @Post()
  @SkipAudit()
  @Roles(PlatformRole.SYSTEM_ADMIN)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Crear una cuenta de plataforma pendiente de activación' })
  @ApiResponse({ status: 201, type: CreatePlatformUserResponseDto })
  @ApiResponse({ status: 400, description: 'Datos de la cuenta inválidos.' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado.' })
  @ApiResponse({ status: 403, description: 'Requiere una sesión de administrador de plataforma.' })
  @ApiResponse({ status: 409, description: 'Ya existe una cuenta con ese correo.' })
  async createAccount(
    @Body() dto: CreatePlatformUserDto,
    @CurrentUser() user: JwtPayload,
    @Request() req: ExpressRequest,
  ): Promise<CreatePlatformUserResponseDto> {
    return {
      data: await this.platformUsersService.createDirectoryAccount(
        dto,
        user.sub,
        PlatformUsersController.auditContext(req),
      ),
    };
  }

  @Get('me')
  @Roles(PlatformRole.SYSTEM_ADMIN, PlatformRole.IWANA_SUPPORT)
  @ApiOperation({ summary: 'Obtener perfil del usuario de plataforma autenticado' })
  async getMyProfile(@CurrentUser() user: JwtPayload): Promise<{ data: PlatformUserResponseDto }> {
    const data = await this.platformUsersService.getProfile(user.sub);
    return { data };
  }

  @Patch('me')
  @SkipAudit()
  @Roles(PlatformRole.SYSTEM_ADMIN, PlatformRole.IWANA_SUPPORT)
  @ApiOperation({ summary: 'Actualizar perfil propio del usuario de plataforma' })
  async updateMyProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdatePlatformUserDto,
    @Request() req: ExpressRequest,
  ): Promise<{ data: PlatformUserResponseDto }> {
    const data = await this.platformUsersService.updateProfile(
      user.sub,
      dto,
      PlatformUsersController.auditContext(req),
    );
    return { data };
  }

  @Patch('me/login-email')
  @SkipAudit()
  @Roles(PlatformRole.SYSTEM_ADMIN, PlatformRole.IWANA_SUPPORT)
  @ApiOperation({ summary: 'Actualizar el email de acceso del usuario de plataforma autenticado' })
  @ApiResponse({ status: 409, description: 'Correo en uso o contraseña cambiada en paralelo.' })
  async updateMyLoginEmail(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePlatformUserLoginEmailDto,
    @Request() req: ExpressRequest,
  ): Promise<{ data: PlatformUserResponseDto }> {
    const data = await this.platformUsersService.changeLoginEmail(
      user.sub,
      dto,
      PlatformUsersController.auditContext(req),
    );
    return { data };
  }

  @Post('me/change-password')
  @SkipAudit()
  @Roles(PlatformRole.SYSTEM_ADMIN, PlatformRole.IWANA_SUPPORT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Actualizar la contraseña del usuario de plataforma autenticado' })
  @ApiResponse({ status: 409, description: 'La contraseña cambió en paralelo.' })
  async updateMyPassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePlatformUserPasswordDto,
    @Request() req: ExpressRequest,
  ): Promise<{ data: { message: string } }> {
    await this.platformUsersService.changePassword(
      user.sub,
      dto,
      PlatformUsersController.auditContext(req),
    );
    return { data: { message: 'Contraseña actualizada correctamente.' } };
  }

  @Patch(':id/name')
  @SkipAudit()
  @Roles(PlatformRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Editar el nombre de una cuenta de plataforma' })
  @ApiResponse({ status: 204, description: 'Nombre actualizado.' })
  @ApiResponse({ status: 400, description: 'Identificador o nombre inválido.' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado.' })
  @ApiResponse({ status: 403, description: 'Requiere una sesión de administrador de plataforma.' })
  @ApiResponse({ status: 404, description: 'Cuenta de plataforma no encontrada.' })
  async updateName(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlatformUserNameDto,
    @CurrentUser() user: JwtPayload,
    @Request() req: ExpressRequest,
  ): Promise<void> {
    await this.platformUsersService.updateDirectoryName(
      id,
      dto,
      user.sub,
      PlatformUsersController.auditContext(req),
    );
  }
}
