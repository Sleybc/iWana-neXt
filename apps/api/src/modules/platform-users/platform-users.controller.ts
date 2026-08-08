import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { PlatformRole } from '@iwana/shared';
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
import { PlatformUserResponseDto } from './dto/platform-user-response.dto';
import {
  ChangePlatformUserLoginEmailDto,
  ChangePlatformUserPasswordDto,
  UpdatePlatformUserDto,
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
      'Crea el usuario admin inicial de plataforma y retorna el access token (flujo bootstrap)',
  })
  @ApiResponse({ status: 201, description: 'Usuario admin creado y token emitido.' })
  @ApiResponse({ status: 409, description: 'Ya existen usuarios o email inválido.' })
  async createBootstrapUser(
    @Body() dto: CreatePlatformUserBootstrapDto,
    @Request() req: ExpressRequest,
  ): Promise<{ data: { accessToken: string } }> {
    const user = await this.platformUsersService.createBootstrapUser(
      dto,
      PlatformUsersController.auditContext(req),
    );
    const accessToken = this.authService.signPlatformToken(user as unknown as PlatformUser);
    return { data: { accessToken } };
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
}
