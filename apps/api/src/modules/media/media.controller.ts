import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
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
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { TenantContext } from '@iwana/db';
import { UserRole } from '@iwana/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AbacGuard } from '../auth/guards/abac.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { MediaService } from './media.service';
import { UploadMediaDto } from './dto/upload-media.dto';
import { MediaAssetResponseDto } from './dto/media-asset-response.dto';

/**
 * Controlador Media — MOD03 Media/Assets.
 *
 * Endpoints:
 * - POST   /media/upload        Subir un archivo al bucket de media
 * - GET    /media/:id/signed-url Obtener URL firmada temporal
 * - DELETE /media/:id           Soft delete del asset
 *
 * TODO: agregar permiso granular 'branding:manage' cuando RBAC v2 esté implementado.
 * Por ahora solo ADMIN puede subir/borrar assets.
 *
 * ADR-034 — Bounded Context Media/Assets
 */
@Controller('media')
@UseGuards(JwtAuthGuard, RolesGuard, AbacGuard)
@ApiTags('media')
@ApiBearerAuth('access-token')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  /**
   * POST /api/v1/media/upload
   * Sube un archivo multipart y registra el MediaAsset.
   * Límite de subidas: 20 requests/minuto por tenant (ThrottlerGuard).
   */
  @Post('upload')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(), // Buffer en memoria — validado y enviado a MinIO en el servicio
      limits: {
        fileSize: 10 * 1024 * 1024, // Hard limit 10 MB antes de llegar al servicio
        files: 1,
      },
    }),
  )
  @ApiOperation({ summary: 'Subir un archivo de branding al almacenamiento' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'usage'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'Archivo a subir' },
        usage: { type: 'string', enum: ['logo', 'seal', 'favicon', 'login_background', 'general'] },
        themeVariant: { type: 'string', enum: ['light', 'dark'], nullable: true },
      },
    },
  })
  @ApiResponse({ status: 201, type: MediaAssetResponseDto })
  async upload(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UploadMediaDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<{ data: MediaAssetResponseDto }> {
    if (!file) {
      throw new BadRequestException('Se requiere el campo "file" con el archivo a subir.');
    }

    // Resolver tenantSchema desde el contexto del JWT
    const tenantSchema = this.resolveTenantSchema(user);

    const data = await this.mediaService.upload(tenantSchema, dto, file, user.sub);
    return { data };
  }

  /**
   * GET /api/v1/media/:id/signed-url
   * Genera una URL pre-firmada con expiración máxima de 1 hora.
   */
  @Get(':id/signed-url')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.ACCOUNTANT, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Obtener URL firmada temporal para un asset privado' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiQuery({
    name: 'expiresIn',
    required: false,
    type: 'number',
    description: 'Tiempo de validez en segundos (máx. 3600). Por defecto: 3600.',
  })
  @ApiResponse({ status: 200 })
  async getSignedUrl(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('expiresIn') expiresIn?: string,
  ): Promise<{ data: { signedUrl: string; expiresAt: Date } }> {
    const tenantSchema = this.resolveTenantSchema(user);
    const expiresInSeconds = expiresIn ? parseInt(expiresIn, 10) : 3600;

    const data = await this.mediaService.getSignedUrl(id, tenantSchema, expiresInSeconds);
    return { data };
  }

  /**
   * DELETE /api/v1/media/:id
   * Soft delete — marca deleted_at. La limpieza física se delega al worker.
   */
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar (soft delete) un asset de media' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204 })
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    const tenantSchema = this.resolveTenantSchema(user);
    await this.mediaService.softDelete(id, tenantSchema);
  }

  private resolveTenantSchema(user: JwtPayload): string {
    const context = TenantContext.getOrThrow();

    if (
      user.type === 'tenant' &&
      (user.tenantId !== context.tenantId || user.schemaName !== context.schemaName)
    ) {
      throw new BadRequestException('El contexto de tenant no coincide con el token verificado.');
    }

    if (!context.schemaName || context.schemaName === 'platform') {
      throw new BadRequestException('Se requiere un contexto de tenant válido.');
    }

    return context.schemaName;
  }
}
