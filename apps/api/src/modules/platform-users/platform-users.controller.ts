import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PlatformRole } from '@iwana/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreatePlatformUserBootstrapDto } from './dto/create-platform-user-bootstrap.dto';
import { PlatformUserResponseDto } from './dto/platform-user-response.dto';
import {
  ChangePlatformUserLoginEmailDto,
  UpdatePlatformUserDto,
} from './dto/update-platform-user.dto';
import { PlatformUsersService } from './platform-users.service';

@Controller('platform-users')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('platform-users')
@ApiBearerAuth('access-token')
export class PlatformUsersController {
  constructor(private readonly platformUsersService: PlatformUsersService) {}

  @Get('bootstrap/status')
  @Public()
  @ApiOperation({ summary: 'Estado del bootstrap de plataforma — indica si hay usuarios creados' })
  async getBootstrapStatus(): Promise<{ data: { hasUsers: boolean; pendingUser: boolean } }> {
    const data = await this.platformUsersService.getBootstrapStatus();
    return { data };
  }

  @Post('bootstrap')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Crea el usuario admin inicial de plataforma (solo si no existen usuarios)',
  })
  @ApiResponse({ status: 201, description: 'Usuario admin creado.' })
  @ApiResponse({ status: 409, description: 'Ya existen usuarios o email inválido.' })
  async createBootstrapUser(
    @Body() dto: CreatePlatformUserBootstrapDto,
  ): Promise<{ data: { message: string } }> {
    await this.platformUsersService.createBootstrapUser(dto);
    return { data: { message: 'Usuario admin creado correctamente.' } };
  }

  @Get('me')
  @Roles(PlatformRole.SYSTEM_ADMIN, PlatformRole.IWANA_SUPPORT)
  @ApiOperation({ summary: 'Obtener perfil del usuario de plataforma autenticado' })
  async getMyProfile(@CurrentUser() user: JwtPayload): Promise<{ data: PlatformUserResponseDto }> {
    const data = await this.platformUsersService.getProfile(user.sub);
    return { data };
  }

  @Patch('me')
  @Roles(PlatformRole.SYSTEM_ADMIN, PlatformRole.IWANA_SUPPORT)
  @ApiOperation({ summary: 'Actualizar perfil propio del usuario de plataforma' })
  async updateMyProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdatePlatformUserDto,
  ): Promise<{ data: PlatformUserResponseDto }> {
    const data = await this.platformUsersService.updateProfile(user.sub, dto);
    return { data };
  }

  @Patch('me/login-email')
  @Roles(PlatformRole.SYSTEM_ADMIN, PlatformRole.IWANA_SUPPORT)
  @ApiOperation({ summary: 'Actualizar el email de acceso del usuario de plataforma autenticado' })
  async updateMyLoginEmail(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePlatformUserLoginEmailDto,
  ): Promise<{ data: PlatformUserResponseDto }> {
    const data = await this.platformUsersService.changeLoginEmail(user.sub, dto);
    return { data };
  }
}
