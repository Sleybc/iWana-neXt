import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { MediaUsage } from '@iwana/db';

const PLATFORM_BRANDING_MEDIA_USAGES = [
  MediaUsage.LOGO,
  MediaUsage.FAVICON,
  MediaUsage.LOGIN_BACKGROUND,
] as const;

export class PlatformBrandingResponseDto {
  @ApiProperty()
  productName: string;

  @ApiProperty()
  surfaceName: string;

  @ApiProperty()
  metadataTitle: string;

  @ApiProperty()
  metadataDescription: string;

  @ApiPropertyOptional({ nullable: true })
  logoUrl: string | null;

  @ApiPropertyOptional({ nullable: true })
  logoAssetId: string | null;

  @ApiPropertyOptional({ nullable: true })
  faviconUrl: string | null;

  @ApiPropertyOptional({ nullable: true })
  faviconAssetId: string | null;

  @ApiPropertyOptional({ nullable: true })
  loginBackgroundLightUrl: string | null;

  @ApiPropertyOptional({ nullable: true })
  loginBackgroundLightAssetId: string | null;

  @ApiPropertyOptional({ nullable: true })
  loginBackgroundDarkUrl: string | null;

  @ApiPropertyOptional({ nullable: true })
  loginBackgroundDarkAssetId: string | null;

  @ApiProperty()
  updatedAt: Date;
}

export class PlatformPublicBrandingDto {
  @ApiProperty()
  productName: string;

  @ApiProperty()
  surfaceName: string;

  @ApiProperty()
  metadataTitle: string;

  @ApiProperty()
  metadataDescription: string;

  @ApiPropertyOptional({ nullable: true })
  logoUrl: string | null;

  @ApiPropertyOptional({ nullable: true })
  faviconUrl: string | null;

  @ApiPropertyOptional({ nullable: true })
  loginBackgroundLightUrl: string | null;

  @ApiPropertyOptional({ nullable: true })
  loginBackgroundDarkUrl: string | null;
}

export class UpdatePlatformBrandingDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  productName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  surfaceName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  metadataTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  metadataDescription?: string;

  @IsOptional()
  @Matches(/^(https:\/\/|\/)/, { message: 'logoUrl debe ser HTTPS o una ruta interna.' })
  @MaxLength(500)
  logoUrl?: string | null;

  @IsOptional()
  @IsUUID('4')
  logoAssetId?: string | null;

  @IsOptional()
  @Matches(/^(https:\/\/|\/)/, { message: 'faviconUrl debe ser HTTPS o una ruta interna.' })
  @MaxLength(500)
  faviconUrl?: string | null;

  @IsOptional()
  @IsUUID('4')
  faviconAssetId?: string | null;

  @IsOptional()
  @Matches(/^(https:\/\/|\/)/, {
    message: 'loginBackgroundLightUrl debe ser HTTPS o una ruta interna.',
  })
  @MaxLength(500)
  loginBackgroundLightUrl?: string | null;

  @IsOptional()
  @IsUUID('4')
  loginBackgroundLightAssetId?: string | null;

  @IsOptional()
  @Matches(/^(https:\/\/|\/)/, {
    message: 'loginBackgroundDarkUrl debe ser HTTPS o una ruta interna.',
  })
  @MaxLength(500)
  loginBackgroundDarkUrl?: string | null;

  @IsOptional()
  @IsUUID('4')
  loginBackgroundDarkAssetId?: string | null;
}

export class UploadPlatformBrandingAssetDto {
  @IsEnum(MediaUsage, {
    message: `usage debe ser uno de: ${PLATFORM_BRANDING_MEDIA_USAGES.join(', ')}`,
  })
  @IsIn(PLATFORM_BRANDING_MEDIA_USAGES, {
    message: `usage debe ser uno de: ${PLATFORM_BRANDING_MEDIA_USAGES.join(', ')}`,
  })
  @ApiProperty({ enum: PLATFORM_BRANDING_MEDIA_USAGES })
  usage: MediaUsage.LOGO | MediaUsage.FAVICON | MediaUsage.LOGIN_BACKGROUND;

  @IsOptional()
  @IsIn(['light', 'dark'], { message: 'themeVariant debe ser light o dark.' })
  @ApiPropertyOptional({ enum: ['light', 'dark'] })
  themeVariant?: 'light' | 'dark';
}
