import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TenantContext } from '@iwana/db';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { UploadMediaDto } from './dto/upload-media.dto';

describe('MediaController', () => {
  let controller: MediaController;
  const mediaService = {
    upload: jest.fn(),
    getSignedUrl: jest.fn(),
    softDelete: jest.fn(),
  };

  const user = {
    sub: 'user-001',
    email: 'hash',
    role: 'ADMIN',
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    jti: 'jti-001',
    type: 'tenant' as const,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MediaController],
      providers: [{ provide: MediaService, useValue: mediaService }],
    }).compile();
    controller = module.get(MediaController);
  });

  it('rechaza la carga cuando falta el archivo', async () => {
    await expect(controller.upload(user, new UploadMediaDto(), undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(mediaService.upload).not.toHaveBeenCalled();
  });

  it('sube el archivo en el schema del contexto tenant', async () => {
    const file = { originalname: 'support.png' } as Express.Multer.File;
    const result = { id: 'media-001' };
    const dto = new UploadMediaDto();
    mediaService.upload.mockResolvedValue(result);

    await expect(
      TenantContext.run(
        { tenantId: 'tenant-001', schemaName: 'tenant_001', tenantSlug: 'one' },
        () => controller.upload(user, dto, file),
      ),
    ).resolves.toEqual({ data: result });
    expect(mediaService.upload).toHaveBeenCalledWith('tenant_001', dto, file, user.sub);
  });

  it('usa la expiración predeterminada de la URL firmada', async () => {
    const signed = { signedUrl: 'https://media.test/signed', expiresAt: new Date() };
    mediaService.getSignedUrl.mockResolvedValue(signed);

    await expect(
      TenantContext.run(
        { tenantId: 'tenant-001', schemaName: 'tenant_001', tenantSlug: 'one' },
        () => controller.getSignedUrl(user, '00000000-0000-0000-0000-000000000001'),
      ),
    ).resolves.toEqual({ data: signed });
    expect(mediaService.getSignedUrl).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000001',
      'tenant_001',
      3600,
    );
  });

  it('convierte expiresIn explícito a segundos', async () => {
    mediaService.getSignedUrl.mockResolvedValue({ signedUrl: 'signed', expiresAt: new Date() });

    await TenantContext.run(
      { tenantId: 'tenant-001', schemaName: 'tenant_001', tenantSlug: 'one' },
      () => controller.getSignedUrl(user, '00000000-0000-0000-0000-000000000001', '120'),
    );

    expect(mediaService.getSignedUrl).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000001',
      'tenant_001',
      120,
    );
  });

  it('permite resolver el schema por contexto a un actor de plataforma', async () => {
    const platformUser = { ...user, type: 'platform' as const, tenantId: null, schemaName: null };
    mediaService.softDelete.mockResolvedValue(undefined);

    await expect(
      TenantContext.run(
        { tenantId: 'tenant-001', schemaName: 'tenant_001', tenantSlug: 'one' },
        () => controller.remove(platformUser, '00000000-0000-0000-0000-000000000001'),
      ),
    ).resolves.toBeUndefined();
    expect(mediaService.softDelete).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000001',
      'tenant_001',
    );
  });

  it('rechaza un contexto de plataforma sin schema tenant', async () => {
    const platformUser = { ...user, type: 'platform' as const, tenantId: null, schemaName: null };

    await expect(
      TenantContext.run(
        { tenantId: 'tenant-001', schemaName: 'platform', tenantSlug: 'platform' },
        () => controller.remove(platformUser, '00000000-0000-0000-0000-000000000001'),
      ),
    ).rejects.toThrow('Se requiere un contexto de tenant válido.');
  });

  it('rechaza operación cuando falta el contexto de tenant', async () => {
    await expect(
      controller.getSignedUrl(user, '00000000-0000-0000-0000-000000000001'),
    ).rejects.toThrow();
  });

  it('rechaza contexto que no coincide con claims de tenant verificados', async () => {
    await expect(
      TenantContext.run(
        { tenantId: 'tenant-002', schemaName: 'tenant_002', tenantSlug: 'other' },
        () => controller.getSignedUrl(user, '00000000-0000-0000-0000-000000000001'),
      ),
    ).rejects.toThrow('no coincide con el token');
  });

  it('detecta que schemaName no coincide aunque tenantId coincida', async () => {
    await expect(
      TenantContext.run(
        { tenantId: 'tenant-001', schemaName: 'tenant_002', tenantSlug: 'other' },
        () => controller.getSignedUrl(user, '00000000-0000-0000-0000-000000000001'),
      ),
    ).rejects.toThrow('no coincide con el token');
  });
});
