import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { MediaAsset, MediaUsage } from '@iwana/db';
import { STORAGE_PORT } from '@iwana/storage';
import { imageSize } from 'image-size';
import { MediaService } from './media.service';

jest.mock('image-size', () => ({
  imageSize: jest.fn(),
}));

/**
 * Factoría de MediaAsset para pruebas — sin PII real.
 */
function buildMediaAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  const asset = new MediaAsset();
  asset.id = '00000000-0000-0000-0000-000000000001';
  asset.tenantSchema = 'tenant_test_isp';
  asset.usage = MediaUsage.LOGO;
  asset.themeVariant = 'light';
  asset.originalFilename = 'logo.png';
  asset.mimeType = 'image/png';
  asset.ext = 'png';
  asset.sizeBytes = 1024;
  asset.objectKey = 'tenant_test_isp/logo/00000000-0000-0000-0000-000000000001.png';
  asset.publicUrl = null;
  asset.uploadedByUserId = 'user-001';
  asset.createdAt = new Date('2026-01-01T00:00:00Z');
  asset.updatedAt = new Date('2026-01-01T00:00:00Z');
  asset.deletedAt = null;
  return Object.assign(asset, overrides);
}

// Tipo local para pruebas — evita dependencia directa del namespace Express.Multer
type MockMulterFile = {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
  stream: NodeJS.ReadableStream;
  destination: string;
  filename: string;
  path: string;
};

/**
 * Factoría de archivo simulado para pruebas de upload.
 */
function buildMulterFile(overrides: Partial<MockMulterFile> = {}): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'logo.png',
    encoding: '7bit',
    mimetype: 'image/png',
    buffer: Buffer.from('fake-image-bytes'),
    size: 16,
    stream: null as unknown as NodeJS.ReadableStream,
    destination: '',
    filename: '',
    path: '',
    ...overrides,
  } as Express.Multer.File;
}

describe('MediaService', () => {
  let service: MediaService;
  const configMap: Record<string, unknown> = {
    STORAGE_DRIVER: 'local',
    S3_BUCKET_PUBLIC: 'false',
    S3_PUBLIC_BASE_URL: undefined,
  };

  const mockRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const mockStorage = {
    putObject: jest.fn(),
    deleteObject: jest.fn(),
    objectExists: jest.fn(),
    getPublicUrl: jest.fn(),
    getSignedUrl: jest.fn(),
  };

  const mockConfig = {
    get: jest.fn((key: string, fallback?: unknown) => {
      return configMap[key] ?? fallback;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    (imageSize as jest.Mock).mockReturnValue({ width: 1600, height: 900 });
    configMap.STORAGE_DRIVER = 'local';
    configMap.S3_BUCKET_PUBLIC = 'false';
    configMap.S3_PUBLIC_BASE_URL = undefined;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: getRepositoryToken(MediaAsset), useValue: mockRepo },
        { provide: STORAGE_PORT, useValue: mockStorage },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<MediaService>(MediaService);
  });

  describe('upload', () => {
    it('debe subir un archivo válido y retornar el DTO de respuesta', async () => {
      const saved = buildMediaAsset();
      mockRepo.create.mockReturnValue(saved);
      mockRepo.save.mockResolvedValue(saved);
      mockRepo.update.mockResolvedValue(undefined);
      mockStorage.putObject.mockResolvedValue(undefined);
      mockStorage.getPublicUrl.mockReturnValue(
        'http://localhost:3000/storage/tenant_test_isp/logo/00000000-0000-0000-0000-000000000001.png',
      );

      const file = buildMulterFile();
      const result = await service.upload(
        'tenant_test_isp',
        { usage: MediaUsage.LOGO, themeVariant: 'light' },
        file,
        'user-001',
      );

      expect(mockStorage.putObject).toHaveBeenCalledTimes(1);
      expect(result.id).toBe(saved.id);
      expect(result.usage).toBe(MediaUsage.LOGO);
      expect(result.mimeType).toBe('image/png');
      expect(result.publicUrl).toBe(
        'http://localhost:3000/storage/tenant_test_isp/logo/00000000-0000-0000-0000-000000000001.png',
      );
    });

    it('debe asignar publicUrl cuando existe S3_PUBLIC_BASE_URL aunque el bucket no sea público', async () => {
      const saved = buildMediaAsset();
      mockRepo.create.mockReturnValue(saved);
      mockRepo.save.mockResolvedValue(saved);
      mockRepo.update.mockResolvedValue(undefined);
      mockStorage.putObject.mockResolvedValue(undefined);
      mockStorage.getPublicUrl.mockReturnValue(
        'https://cdn.example.test/tenant_test_isp/logo/00000000-0000-0000-0000-000000000001.png',
      );
      configMap.S3_BUCKET_PUBLIC = 'false';
      configMap.S3_PUBLIC_BASE_URL = 'https://cdn.example.test';
      configMap.STORAGE_DRIVER = 'minio';

      const file = buildMulterFile();
      const result = await service.upload(
        'tenant_test_isp',
        { usage: MediaUsage.LOGO, themeVariant: 'light' },
        file,
        'user-001',
      );

      expect(mockStorage.getPublicUrl).toHaveBeenCalledWith(
        'tenant_test_isp/logo/00000000-0000-0000-0000-000000000001.png',
      );
      expect(result.publicUrl).toBe(
        'https://cdn.example.test/tenant_test_isp/logo/00000000-0000-0000-0000-000000000001.png',
      );
    });

    it('debe lanzar BadRequestException si el MIME type no es permitido para el uso', async () => {
      const file = buildMulterFile({ mimetype: 'application/pdf' });

      await expect(
        service.upload('tenant_test_isp', { usage: MediaUsage.LOGO }, file, 'user-001'),
      ).rejects.toThrow(BadRequestException);

      expect(mockStorage.putObject).not.toHaveBeenCalled();
    });

    it('debe rechazar evidencia de ejecución en el upload genérico sin persistir ni escribir en storage', async () => {
      const file = buildMulterFile({
        mimetype: 'application/pdf',
        originalname: 'evidence.pdf',
      });

      const rejection = service.upload(
        'tenant_test_isp',
        { usage: MediaUsage.EXECUTION_EVIDENCE },
        file,
        'user-001',
      );

      await expect(rejection).rejects.toBeInstanceOf(BadRequestException);
      await expect(rejection).rejects.toMatchObject({
        response: {
          code: 'MEDIA_GENERIC_EXECUTION_EVIDENCE_FORBIDDEN',
        },
      });
      expect(mockRepo.create).not.toHaveBeenCalled();
      expect(mockRepo.save).not.toHaveBeenCalled();
      expect(mockStorage.putObject).not.toHaveBeenCalled();
    });

    it('debe lanzar BadRequestException si el archivo supera el tamaño máximo', async () => {
      // Logo tiene límite de 1 MB = 1048576 bytes
      const file = buildMulterFile({
        mimetype: 'image/png',
        size: 2 * 1024 * 1024, // 2 MB
      });

      await expect(
        service.upload('tenant_test_isp', { usage: MediaUsage.LOGO }, file, 'user-001'),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe rechazar logo cuando la proporción no cumple las reglas de diseño', async () => {
      const saved = buildMediaAsset();
      mockRepo.create.mockReturnValue(saved);
      mockRepo.save.mockResolvedValue(saved);
      (imageSize as jest.Mock).mockReturnValue({ width: 300, height: 300 });

      const file = buildMulterFile({ mimetype: 'image/png', size: 1024 });

      await expect(
        service.upload('tenant_test_isp', { usage: MediaUsage.LOGO }, file, 'user-001'),
      ).rejects.toThrow(BadRequestException);

      expect(mockStorage.putObject).not.toHaveBeenCalled();
    });

    it('debe rechazar fondo de login con resolución menor a la mínima', async () => {
      const saved = buildMediaAsset({ usage: MediaUsage.LOGIN_BACKGROUND });
      mockRepo.create.mockReturnValue(saved);
      mockRepo.save.mockResolvedValue(saved);
      (imageSize as jest.Mock).mockReturnValue({ width: 1024, height: 600 });

      const file = buildMulterFile({ mimetype: 'image/png', size: 4096 });

      await expect(
        service.upload(
          'tenant_test_isp',
          { usage: MediaUsage.LOGIN_BACKGROUND, themeVariant: 'light' },
          file,
          'user-001',
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockStorage.putObject).not.toHaveBeenCalled();
    });

    it('debe hacer rollback en BD si falla el storage', async () => {
      const saved = buildMediaAsset();
      mockRepo.create.mockReturnValue(saved);
      mockRepo.save.mockResolvedValue(saved);
      mockStorage.putObject.mockRejectedValue(new Error('Storage error'));

      const file = buildMulterFile();

      await expect(
        service.upload('tenant_test_isp', { usage: MediaUsage.LOGO }, file, 'user-001'),
      ).rejects.toThrow(BadRequestException);

      // Debe haberse eliminado el registro de BD
      expect(mockRepo.delete).toHaveBeenCalledWith(saved.id);
    });
  });

  describe('findOne', () => {
    it('debe retornar el DTO cuando el asset existe', async () => {
      const asset = buildMediaAsset();
      mockRepo.findOne.mockResolvedValue(asset);

      const result = await service.findOne(asset.id, 'tenant_test_isp');

      expect(result.id).toBe(asset.id);
    });

    it('debe lanzar NotFoundException si el asset no existe', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('no-existe', 'tenant_test_isp')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('debe lanzar NotFoundException si el asset tiene deletedAt', async () => {
      const asset = buildMediaAsset({ deletedAt: new Date() });
      mockRepo.findOne.mockResolvedValue(asset);

      await expect(service.findOne(asset.id, 'tenant_test_isp')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getSignedUrl', () => {
    it('debe retornar URL firmada con expiración dentro del límite de 1 hora', async () => {
      const asset = buildMediaAsset();
      mockRepo.findOne.mockResolvedValue(asset);
      mockStorage.getSignedUrl.mockResolvedValue('https://minio/signed-url?...');

      const result = await service.getSignedUrl(asset.id, 'tenant_test_isp', 7200);

      // Debe limitar a 3600 segundos por política de seguridad
      expect(mockStorage.getSignedUrl).toHaveBeenCalledWith(asset.objectKey, 3600);
      expect(result.signedUrl).toBe('https://minio/signed-url?...');
    });
  });

  describe('softDelete', () => {
    it('debe marcar deleted_at en el asset existente', async () => {
      const asset = buildMediaAsset();
      mockRepo.findOne.mockResolvedValue(asset);
      mockRepo.update.mockResolvedValue(undefined);

      await service.softDelete(asset.id, 'tenant_test_isp');

      expect(mockRepo.update).toHaveBeenCalledWith(
        asset.id,
        expect.objectContaining({ deletedAt: expect.any(Date) }),
      );
    });

    it('debe lanzar NotFoundException si el asset no existe', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.softDelete('no-existe', 'tenant_test_isp')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('debe lanzar NotFoundException si el asset ya está eliminado', async () => {
      const asset = buildMediaAsset({ deletedAt: new Date() });
      mockRepo.findOne.mockResolvedValue(asset);

      await expect(service.softDelete(asset.id, 'tenant_test_isp')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
