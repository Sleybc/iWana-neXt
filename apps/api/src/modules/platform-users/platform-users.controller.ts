import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformRole } from '@iwana/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PlatformUserResponseDto } from './dto/platform-user-response.dto';
import { UpdatePlatformUserDto } from './dto/update-platform-user.dto';
import { PlatformUsersService } from './platform-users.service';

@Controller('platform-users')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('platform-users')
@ApiBearerAuth('access-token')
export class PlatformUsersController {
  constructor(private readonly platformUsersService: PlatformUsersService) {}

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
}
