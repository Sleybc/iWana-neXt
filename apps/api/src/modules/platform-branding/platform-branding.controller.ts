import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { PlatformRole } from '@iwana/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlatformOnlyGuard } from '../auth/guards/platform-only.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { SkipAudit } from '../audit/decorators/skip-audit.decorator';
import { MediaAssetResponseDto } from '../media/dto/media-asset-response.dto';
import {
  PlatformBrandingResponseDto,
  PlatformPublicBrandingDto,
  UpdatePlatformBrandingDto,
  UploadPlatformBrandingAssetDto,
} from './dto/platform-branding.dto';
import { PlatformBrandingService } from './platform-branding.service';

@Controller('platform/branding')
@UseGuards(JwtAuthGuard, RolesGuard, PlatformOnlyGuard)
@SkipAudit()
@ApiTags('platform-branding')
@ApiBearerAuth('access-token')
export class PlatformBrandingController {
  constructor(private readonly platformBrandingService: PlatformBrandingService) {}

  @Get('public')
  @Public()
  @Header('Cache-Control', 'public, max-age=60')
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  @ApiOperation({ summary: 'Obtener branding publico de la consola de plataforma' })
  @ApiResponse({ status: 200, type: PlatformPublicBrandingDto })
  async getPublicBranding(): Promise<{ data: PlatformPublicBrandingDto }> {
    const data = await this.platformBrandingService.getPublicBranding();
    return { data };
  }

  @Get()
  @Roles(PlatformRole.SYSTEM_ADMIN, PlatformRole.IWANA_SUPPORT)
  @ApiOperation({ summary: 'Obtener configuracion de branding de plataforma' })
  @ApiResponse({ status: 200, type: PlatformBrandingResponseDto })
  async getBranding(): Promise<{ data: PlatformBrandingResponseDto }> {
    const data = await this.platformBrandingService.getAdminBranding();
    return { data };
  }

  @Patch()
  @Roles(PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Actualizar branding propio de plataforma' })
  @ApiResponse({ status: 200, type: PlatformBrandingResponseDto })
  async updateBranding(
    @Body() dto: UpdatePlatformBrandingDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ data: PlatformBrandingResponseDto }> {
    const data = await this.platformBrandingService.updateBranding(dto, user.sub);
    return { data };
  }

  @Post('reset')
  @Roles(PlatformRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restaurar branding de plataforma por defecto' })
  @ApiResponse({ status: 200, type: PlatformBrandingResponseDto })
  async resetBranding(
    @CurrentUser() user: JwtPayload,
  ): Promise<{ data: PlatformBrandingResponseDto }> {
    const data = await this.platformBrandingService.resetBranding(user.sub);
    return { data };
  }

  @Post('assets')
  @Roles(PlatformRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'usage'],
      properties: {
        file: { type: 'string', format: 'binary' },
        usage: { type: 'string', enum: ['logo', 'favicon', 'login_background'] },
        themeVariant: { type: 'string', enum: ['light', 'dark'] },
      },
    },
  })
  @ApiOperation({ summary: 'Subir y asignar asset de branding de plataforma' })
  @ApiResponse({ status: 201, type: MediaAssetResponseDto })
  async uploadBrandingAsset(
    @Body() dto: UploadPlatformBrandingAssetDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ data: MediaAssetResponseDto }> {
    if (!file) {
      throw new BadRequestException('Se requiere el campo "file" con el archivo a subir.');
    }

    const data = await this.platformBrandingService.uploadBrandingAsset(dto, file, user.sub);
    return { data };
  }
}
