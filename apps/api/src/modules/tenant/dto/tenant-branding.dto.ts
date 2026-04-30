import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MediaUsage } from '@iwana/db';
import { IsEnum, IsIn } from 'class-validator';

const BRANDING_MEDIA_USAGES = [
  MediaUsage.LOGO,
  MediaUsage.SEAL,
  MediaUsage.FAVICON,
  MediaUsage.LOGIN_BACKGROUND,
] as const;

/** Payload multipart para subir y asignar un asset de branding a un tenant. */
export class UploadTenantBrandingAssetDto {
  @IsEnum(MediaUsage, {
    message: `usage debe ser uno de: ${BRANDING_MEDIA_USAGES.join(', ')}`,
  })
  @IsIn(BRANDING_MEDIA_USAGES, {
    message: `usage debe ser uno de: ${BRANDING_MEDIA_USAGES.join(', ')}`,
  })
  @ApiProperty({ enum: BRANDING_MEDIA_USAGES, description: 'Slot de branding a actualizar.' })
  usage: MediaUsage;

  @IsIn(['light', 'dark'], {
    message: 'themeVariant debe ser light o dark.',
  })
  @ApiProperty({ enum: ['light', 'dark'], description: 'Variante visual del slot.' })
  themeVariant: 'light' | 'dark';
}

/** Respuesta pública para aplicar branding antes de autenticar al usuario. */
export class TenantPublicBrandingDto {
  @ApiProperty()
  displayName: string;

  @ApiProperty()
  showTenantName: boolean;

  @ApiPropertyOptional({ nullable: true })
  logoLightUrl: string | null;

  @ApiPropertyOptional({ nullable: true })
  logoDarkUrl: string | null;

  @ApiPropertyOptional({ nullable: true })
  sealLightUrl: string | null;

  @ApiPropertyOptional({ nullable: true })
  sealDarkUrl: string | null;

  @ApiPropertyOptional({ nullable: true })
  faviconLightUrl: string | null;

  @ApiPropertyOptional({ nullable: true })
  faviconDarkUrl: string | null;

  @ApiPropertyOptional({ nullable: true })
  loginBackgroundLightUrl: string | null;

  @ApiPropertyOptional({ nullable: true })
  loginBackgroundDarkUrl: string | null;
}
