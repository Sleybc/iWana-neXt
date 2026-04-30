import { ApiProperty } from '@nestjs/swagger';
import type { MediaThemeVariant } from '@iwana/db';
import { MediaUsage } from '@iwana/db';

/**
 * DTO de respuesta para un MediaAsset.
 * No expone object_key ni tenant_schema para no filtrar información interna.
 */
export class MediaAssetResponseDto {
  @ApiProperty({ description: 'UUID del asset' })
  id: string;

  @ApiProperty({ enum: MediaUsage, description: 'Propósito del asset' })
  usage: MediaUsage;

  @ApiProperty({ nullable: true, description: 'Variante de tema: light, dark o null' })
  themeVariant: MediaThemeVariant;

  @ApiProperty({ description: 'MIME type del archivo' })
  mimeType: string;

  @ApiProperty({ description: 'Tamaño en bytes' })
  sizeBytes: number;

  @ApiProperty({ nullable: true, description: 'URL pública permanente (si bucket es público)' })
  publicUrl: string | null;

  @ApiProperty({ description: 'Fecha de subida' })
  createdAt: Date;
}
