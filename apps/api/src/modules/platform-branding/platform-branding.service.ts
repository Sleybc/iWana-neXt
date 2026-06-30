import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MediaUsage, PlatformBrandingSettings } from '@iwana/db';
import { AuditAction } from '@iwana/shared';
import { Repository } from 'typeorm';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { MediaService } from '../media/media.service';
import type { MediaAssetResponseDto } from '../media/dto/media-asset-response.dto';
import type {
  PlatformBrandingResponseDto,
  PlatformPublicBrandingDto,
  UpdatePlatformBrandingDto,
  UploadPlatformBrandingAssetDto,
} from './dto/platform-branding.dto';

const PLATFORM_BRANDING_ID = 'platform';
const PLATFORM_MEDIA_SCHEMA = 'platform';

const DEFAULT_PLATFORM_BRANDING = {
  productName: 'iWana neXt',
  surfaceName: 'Portal administrativo',
  metadataTitle: 'iWana neXt — Portal Administrativo',
  metadataDescription: 'Portal administrativo para operadores ISP iWana neXt',
  logoUrl: '/brand/iwiso6.png',
  faviconUrl: '/brand/favicon-gecko.svg',
  loginBackgroundLightUrl: null,
  loginBackgroundDarkUrl: null,
} as const;

@Injectable()
export class PlatformBrandingService {
  constructor(
    @InjectRepository(PlatformBrandingSettings)
    private readonly brandingRepo: Repository<PlatformBrandingSettings>,
    private readonly mediaService: MediaService,
    private readonly platformAuditService: PlatformAuditService,
  ) {}

  async getPublicBranding(): Promise<PlatformPublicBrandingDto> {
    return this.toPublicDto(await this.getOrCreateSettings());
  }

  async getAdminBranding(): Promise<PlatformBrandingResponseDto> {
    return this.toAdminDto(await this.getOrCreateSettings());
  }

  async updateBranding(
    dto: UpdatePlatformBrandingDto,
    userId: string,
  ): Promise<PlatformBrandingResponseDto> {
    const current = await this.getOrCreateSettings();
    const previous = this.toAdminDto(current);
    const next = this.brandingRepo.merge(current, dto);

    this.applySlotCleanupForNullUrls(next, dto);

    if (dto.logoAssetId) {
      const asset = await this.mediaService.findOne(dto.logoAssetId, PLATFORM_MEDIA_SCHEMA);
      this.assertAssetMatchesUsage(asset, MediaUsage.LOGO);
      next.logoUrl = this.requirePublicUrl(asset);
    }

    if (dto.faviconAssetId) {
      const asset = await this.mediaService.findOne(dto.faviconAssetId, PLATFORM_MEDIA_SCHEMA);
      this.assertAssetMatchesUsage(asset, MediaUsage.FAVICON);
      next.faviconUrl = this.requirePublicUrl(asset);
    }

    if (dto.loginBackgroundLightAssetId) {
      const asset = await this.mediaService.findOne(
        dto.loginBackgroundLightAssetId,
        PLATFORM_MEDIA_SCHEMA,
      );
      this.assertAssetMatchesUsage(asset, MediaUsage.LOGIN_BACKGROUND, 'light');
      next.loginBackgroundLightUrl = this.requirePublicUrl(asset);
    }

    if (dto.loginBackgroundDarkAssetId) {
      const asset = await this.mediaService.findOne(
        dto.loginBackgroundDarkAssetId,
        PLATFORM_MEDIA_SCHEMA,
      );
      this.assertAssetMatchesUsage(asset, MediaUsage.LOGIN_BACKGROUND, 'dark');
      next.loginBackgroundDarkUrl = this.requirePublicUrl(asset);
    }

    const saved = await this.brandingRepo.save(next);
    const response = this.toAdminDto(saved);

    await this.platformAuditService.log({
      action: AuditAction.UPDATE,
      entityType: 'PlatformBrandingSettings',
      entityId: PLATFORM_BRANDING_ID,
      userId,
      oldValue: { ...previous },
      newValue: { ...response },
    });

    return response;
  }

  private applySlotCleanupForNullUrls(
    next: PlatformBrandingSettings,
    dto: UpdatePlatformBrandingDto,
  ): void {
    if (dto.logoUrl === null) {
      next.logoAssetId = null;
    }

    if (dto.faviconUrl === null) {
      next.faviconAssetId = null;
    }

    if (dto.loginBackgroundLightUrl === null) {
      next.loginBackgroundLightAssetId = null;
    }

    if (dto.loginBackgroundDarkUrl === null) {
      next.loginBackgroundDarkAssetId = null;
    }
  }

  async uploadBrandingAsset(
    dto: UploadPlatformBrandingAssetDto,
    file: Express.Multer.File,
    userId: string,
  ): Promise<MediaAssetResponseDto> {
    if (dto.usage === MediaUsage.LOGIN_BACKGROUND && !dto.themeVariant) {
      throw new BadRequestException('themeVariant es obligatorio para el fondo del login.');
    }

    if (dto.usage !== MediaUsage.LOGIN_BACKGROUND && dto.themeVariant) {
      throw new BadRequestException('themeVariant solo aplica para login_background.');
    }

    const asset = await this.mediaService.upload(PLATFORM_MEDIA_SCHEMA, dto, file, userId);
    const publicUrl = this.requirePublicUrl(asset);
    const payload = this.buildAssetAssignmentPayload(asset, publicUrl);
    await this.updateBranding(payload, userId);

    return asset;
  }

  async resetBranding(userId: string): Promise<PlatformBrandingResponseDto> {
    const current = await this.getOrCreateSettings();
    return this.updateBranding(
      {
        ...DEFAULT_PLATFORM_BRANDING,
        logoAssetId: null,
        faviconAssetId: null,
        loginBackgroundLightAssetId: null,
        loginBackgroundDarkAssetId: null,
      },
      userId,
    );
  }

  private async getOrCreateSettings(): Promise<PlatformBrandingSettings> {
    const existing = await this.brandingRepo.findOne({ where: { id: PLATFORM_BRANDING_ID } });

    if (existing) {
      return existing;
    }

    const created = this.brandingRepo.create({
      id: PLATFORM_BRANDING_ID,
      ...DEFAULT_PLATFORM_BRANDING,
      logoAssetId: null,
      faviconAssetId: null,
      loginBackgroundLightAssetId: null,
      loginBackgroundDarkAssetId: null,
    });

    return this.brandingRepo.save(created);
  }

  private buildAssetAssignmentPayload(
    asset: MediaAssetResponseDto,
    publicUrl: string,
  ): UpdatePlatformBrandingDto {
    if (asset.usage === MediaUsage.LOGO) {
      return { logoUrl: publicUrl, logoAssetId: asset.id };
    }

    if (asset.usage === MediaUsage.FAVICON) {
      return { faviconUrl: publicUrl, faviconAssetId: asset.id };
    }

    if (asset.usage === MediaUsage.LOGIN_BACKGROUND && asset.themeVariant === 'light') {
      return { loginBackgroundLightUrl: publicUrl, loginBackgroundLightAssetId: asset.id };
    }

    if (asset.usage === MediaUsage.LOGIN_BACKGROUND && asset.themeVariant === 'dark') {
      return { loginBackgroundDarkUrl: publicUrl, loginBackgroundDarkAssetId: asset.id };
    }

    throw new BadRequestException('Asset de branding no soportado para plataforma.');
  }

  private assertAssetMatchesUsage(
    asset: MediaAssetResponseDto,
    expectedUsage: MediaUsage,
    expectedThemeVariant?: 'light' | 'dark',
  ): void {
    if (asset.usage !== expectedUsage) {
      throw new BadRequestException(`El asset debe tener usage='${expectedUsage}'.`);
    }

    if (expectedThemeVariant && asset.themeVariant !== expectedThemeVariant) {
      throw new BadRequestException(`El asset debe tener themeVariant='${expectedThemeVariant}'.`);
    }
  }

  private requirePublicUrl(asset: MediaAssetResponseDto): string {
    if (!asset.publicUrl) {
      throw new BadRequestException(
        'El asset debe tener URL publica. Configura S3_BUCKET_PUBLIC=true o S3_PUBLIC_BASE_URL.',
      );
    }

    return asset.publicUrl;
  }

  private toAdminDto(settings: PlatformBrandingSettings): PlatformBrandingResponseDto {
    return {
      productName: settings.productName,
      surfaceName: settings.surfaceName,
      metadataTitle: settings.metadataTitle,
      metadataDescription: settings.metadataDescription,
      logoUrl: settings.logoUrl,
      logoAssetId: settings.logoAssetId,
      faviconUrl: settings.faviconUrl,
      faviconAssetId: settings.faviconAssetId,
      loginBackgroundLightUrl: settings.loginBackgroundLightUrl,
      loginBackgroundLightAssetId: settings.loginBackgroundLightAssetId,
      loginBackgroundDarkUrl: settings.loginBackgroundDarkUrl,
      loginBackgroundDarkAssetId: settings.loginBackgroundDarkAssetId,
      updatedAt: settings.updatedAt,
    };
  }

  private toPublicDto(settings: PlatformBrandingSettings): PlatformPublicBrandingDto {
    return {
      productName: settings.productName,
      surfaceName: settings.surfaceName,
      metadataTitle: settings.metadataTitle,
      metadataDescription: settings.metadataDescription,
      logoUrl: settings.logoUrl,
      faviconUrl: settings.faviconUrl,
      loginBackgroundLightUrl: settings.loginBackgroundLightUrl,
      loginBackgroundDarkUrl: settings.loginBackgroundDarkUrl,
    };
  }
}
