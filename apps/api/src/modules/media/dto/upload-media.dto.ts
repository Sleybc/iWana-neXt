import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MediaUsage } from '@iwana/db';
import type { MediaThemeVariant } from '@iwana/db';

/**
 * DTO para recibir los metadatos del upload junto al archivo.
 * Se envía como campos de formulario en multipart/form-data.
 */
export class UploadMediaDto {
  @IsEnum(MediaUsage, {
    message: `usage debe ser uno de: ${Object.values(MediaUsage).join(', ')}`,
  })
  @ApiPropertyOptional({
    enum: MediaUsage,
    description: 'Propósito del asset dentro del branding empresarial.',
  })
  usage: MediaUsage = MediaUsage.GENERAL;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    enum: ['light', 'dark'],
    description: 'Variante de tema: light (fondo claro) o dark (fondo oscuro).',
  })
  themeVariant?: MediaThemeVariant;
}
