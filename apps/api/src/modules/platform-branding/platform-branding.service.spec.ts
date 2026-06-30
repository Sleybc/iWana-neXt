import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { MediaUsage, PlatformBrandingSettings } from '@iwana/db';
import { AuditAction } from '@iwana/shared';
import { Repository } from 'typeorm';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { MediaService } from '../media/media.service';
import { PlatformBrandingService } from './platform-branding.service';

function buildSettings(
  overrides: Partial<PlatformBrandingSettings> = {},
): PlatformBrandingSettings {
  return {
    id: 'platform',
    productName: 'iWana neXt',
    surfaceName: 'Portal administrativo',
    metadataTitle: 'iWana neXt — Portal Administrativo',
    metadataDescription: 'Portal administrativo para operadores ISP iWana neXt',
    logoUrl: '/brand/iwiso6.png',
    logoAssetId: null,
    faviconUrl: '/brand/favicon-gecko.svg',
    faviconAssetId: null,
    loginBackgroundLightUrl: null,
    loginBackgroundLightAssetId: null,
    loginBackgroundDarkUrl: null,
    loginBackgroundDarkAssetId: null,
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    ...overrides,
  } as PlatformBrandingSettings;
}

describe('PlatformBrandingService', () => {
  let service: PlatformBrandingService;
  let repo: jest.Mocked<Repository<PlatformBrandingSettings>>;
  const mediaServiceMock = {
    findOne: jest.fn(),
    upload: jest.fn(),
  };
  const platformAuditServiceMock = { log: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformBrandingService,
        {
          provide: getRepositoryToken(PlatformBrandingSettings),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn((data: Partial<PlatformBrandingSettings>) => data),
            merge: jest.fn(
              (target: PlatformBrandingSettings, source: Partial<PlatformBrandingSettings>) =>
                Object.assign(target, source),
            ),
            save: jest.fn(async (data: Partial<PlatformBrandingSettings>) =>
              buildSettings(data as Partial<PlatformBrandingSettings>),
            ),
          },
        },
        { provide: MediaService, useValue: mediaServiceMock },
        { provide: PlatformAuditService, useValue: platformAuditServiceMock },
      ],
    }).compile();

    service = module.get(PlatformBrandingService);
    repo = module.get(getRepositoryToken(PlatformBrandingSettings));
    jest.clearAllMocks();
  });

  it('crea y retorna branding publico por defecto cuando no existe singleton', async () => {
    repo.findOne.mockResolvedValue(null);

    const result = await service.getPublicBranding();

    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'platform' }));
    expect(repo.save).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        productName: 'iWana neXt',
        logoUrl: '/brand/iwiso6.png',
      }),
    );
    expect(result).not.toHaveProperty('logoAssetId');
  });

  it('actualiza branding y registra auditoria de plataforma', async () => {
    repo.findOne.mockResolvedValue(buildSettings());

    const result = await service.updateBranding(
      { productName: 'Marca Operadora', metadataTitle: 'Marca Operadora — Admin' },
      'user-1',
    );

    expect(result.productName).toBe('Marca Operadora');
    expect(platformAuditServiceMock.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.UPDATE,
        entityType: 'PlatformBrandingSettings',
        entityId: 'platform',
        userId: 'user-1',
      }),
    );
  });

  it('exige themeVariant para subir fondo de login', async () => {
    await expect(
      service.uploadBrandingAsset(
        { usage: MediaUsage.LOGIN_BACKGROUND },
        { mimetype: 'image/png', size: 100, buffer: Buffer.from('x') } as Express.Multer.File,
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('asigna asset publico de logo al branding de plataforma', async () => {
    repo.findOne.mockResolvedValue(buildSettings());
    const logoAsset = {
      id: 'b1849e54-32fb-4e67-b154-2b61ad9ba7ad',
      usage: MediaUsage.LOGO,
      themeVariant: null,
      mimeType: 'image/png',
      sizeBytes: 100,
      publicUrl: 'https://cdn.example.test/platform/logo.png',
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
    };
    (mediaServiceMock.upload as unknown as jest.Mock).mockImplementation(async () => logoAsset);
    (mediaServiceMock.findOne as unknown as jest.Mock).mockImplementation(async () => logoAsset);

    const result = await service.uploadBrandingAsset(
      { usage: MediaUsage.LOGO },
      { mimetype: 'image/png', size: 100, buffer: Buffer.from('x') } as Express.Multer.File,
      'user-1',
    );

    expect(result.publicUrl).toBe('https://cdn.example.test/platform/logo.png');
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ logoAssetId: result.id }));
  });

  it('al eliminar logo por URL nula también limpia logoAssetId', async () => {
    repo.findOne.mockResolvedValue(
      buildSettings({
        logoUrl: 'https://cdn.example.test/platform/logo-anterior.png',
        logoAssetId: '7f4f6f9d-7ca8-4af4-8308-f4d00bf02555',
      }),
    );

    const result = await service.updateBranding({ logoUrl: null }, 'user-1');

    expect(result.logoUrl).toBeNull();
    expect(result.logoAssetId).toBeNull();
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        logoUrl: null,
        logoAssetId: null,
      }),
    );
  });
});
