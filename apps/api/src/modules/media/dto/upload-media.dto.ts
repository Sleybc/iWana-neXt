import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MediaUsage } from '@iwana/db';
import type { MediaThemeVariant } from '@iwana/db';

/** Usos aceptados por la ruta genérica de media. La evidencia tiene su propio flujo. */
export const GENERIC_MEDIA_USAGES = [
  MediaUsage.LOGO,
  MediaUsage.SEAL,
  MediaUsage.FAVICON,
  MediaUsage.LOGIN_BACKGROUND,
  MediaUsage.GENERAL,
] as const;

export type GenericMediaUsage = (typeof GENERIC_MEDIA_USAGES)[number];

/**
 * DTO para recibir los metadatos del upload junto al archivo.
 * Se envía como campos de formulario en multipart/form-data.
 */
export class UploadMediaDto {
  @IsIn(GENERIC_MEDIA_USAGES, {
    message: `usage debe ser uno de: ${GENERIC_MEDIA_USAGES.join(', ')}`,
  })
  @ApiPropertyOptional({
    enum: GENERIC_MEDIA_USAGES,
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
