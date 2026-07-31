import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { MediaAsset } from '@iwana/db';
import type { Readable } from 'node:stream';
import type { DataSource, Repository } from 'typeorm';
import { EvidenceAssetProvider, EVIDENCE_ANALYSIS_QUEUE } from './evidence-asset.provider';

type MockFile = Express.Multer.File;

function buildFile(overrides: Partial<MockFile> = {}): MockFile {
  const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(12).fill(0)]);
  return {
    fieldname: 'file',
    originalname: 'client-supplied-name.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    destination: '',
    filename: '',
    path: '',
    size: buffer.length,
    buffer,
    stream: null as unknown as Readable,
    ...overrides,
  };
}

describe('EvidenceAssetProvider', () => {
  const repo = {
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    findOne: jest.fn(),
  } as unknown as Repository<MediaAsset>;
  const storage = {
    putObject: jest.fn().mockResolvedValue(undefined),
    getSignedUrl: jest.fn(),
  };
  const queue = { add: jest.fn().mockResolvedValue(undefined) };
  const config = { get: jest.fn() } as unknown as ConfigService;

  function createProvider(): EvidenceAssetProvider {
    return new EvidenceAssetProvider(
      { getRepository: jest.fn().mockReturnValue(repo) } as unknown as DataSource,
      storage as never,
      config,
      queue as never,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (repo.create as jest.Mock).mockImplementation((value: Partial<MediaAsset>) => value);
    (repo.save as jest.Mock).mockImplementation(async (value: Partial<MediaAsset>) => value);
  });

  it.each(['image/heic', 'image/heif'])(
    'rechaza %s hasta validación completa',
    async (mimetype) => {
      await expect(
        createProvider().createUploadIntent('tenant_test', buildFile({ mimetype }), 'actor-001'),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(repo.save).not.toHaveBeenCalled();
      expect(storage.putObject).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    },
  );

  it('rechaza MIME declarado que no coincide con los bytes reales', async () => {
    await expect(
      createProvider().createUploadIntent(
        'tenant_test',
        buildFile({ mimetype: 'image/png' }),
        'actor-001',
      ),
    ).rejects.toMatchObject({ response: { code: 'EVIDENCE_MIME_MISMATCH' } });

    expect(repo.save).not.toHaveBeenCalled();
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('persiste un filename opaco generado por servidor', async () => {
    const uploaded = await createProvider().createUploadIntent(
      'tenant_test',
      buildFile({ originalname: '../../cliente-documento-confidencial.jpg' }),
      'actor-001',
    );

    expect(uploaded.mediaAssetId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        originalFilename: expect.stringMatching(/^[0-9a-f-]{36}\.jpg$/i),
      }),
    );
    expect(repo.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ originalFilename: '../../cliente-documento-confidencial.jpg' }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      'analyze-evidence-asset',
      expect.objectContaining({ mediaAssetId: uploaded.mediaAssetId }),
      expect.objectContaining({ jobId: `evidence-analysis-${uploaded.mediaAssetId}` }),
    );
    expect(EVIDENCE_ANALYSIS_QUEUE).toBe('evidence-analysis');
  });

  describe('MIME declarado vs magic bytes reales', () => {
    it('rechaza PDF declarado cuando el contenido es JPEG', async () => {
      await expect(
        createProvider().createUploadIntent(
          'tenant_test',
          buildFile({ mimetype: 'application/pdf' }),
          'actor-001',
        ),
      ).rejects.toMatchObject({ response: { code: 'EVIDENCE_MIME_MISMATCH' } });
    });

    it('rechaza WebP declarado sin encabezado RIFF', async () => {
      // Buffer que tiene los bytes WEBP tras offset 8 pero sin RIFF al inicio
      const webpFake = Buffer.from([
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x00,
      ]);
      await expect(
        createProvider().createUploadIntent(
          'tenant_test',
          buildFile({ mimetype: 'image/webp', buffer: webpFake, size: webpFake.length }),
          'actor-001',
        ),
      ).rejects.toMatchObject({ response: { code: 'EVIDENCE_MIME_MISMATCH' } });
    });

    it('rechaza WebP declarado con RIFF pero sin bytes WEBP', async () => {
      // RIFF presente pero sin los bytes WEBP en offset 8
      const riffNoWebp = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      ]);
      await expect(
        createProvider().createUploadIntent(
          'tenant_test',
          buildFile({ mimetype: 'image/webp', buffer: riffNoWebp, size: riffNoWebp.length }),
          'actor-001',
        ),
      ).rejects.toMatchObject({ response: { code: 'EVIDENCE_MIME_MISMATCH' } });
    });

    it('rechaza GIF declarado cuando el contenido es JPEG', async () => {
      await expect(
        createProvider().createUploadIntent(
          'tenant_test',
          buildFile({ mimetype: 'image/gif' }),
          'actor-001',
        ),
      ).rejects.toMatchObject({ response: { code: 'EVIDENCE_MIME_MISMATCH' } });
    });

    it('rechaza buffer demasiado corto para validar magic bytes', async () => {
      const shortBuf = Buffer.from([0xff, 0xd8]);
      await expect(
        createProvider().createUploadIntent(
          'tenant_test',
          buildFile({ mimetype: 'image/jpeg', buffer: shortBuf, size: shortBuf.length }),
          'actor-001',
        ),
      ).rejects.toMatchObject({ response: { code: 'EVIDENCE_MIME_MISMATCH' } });
    });
  });

  describe('validación de tamaño', () => {
    it('rechaza archivo vacío', async () => {
      const emptyBuf = Buffer.alloc(0);
      await expect(
        createProvider().createUploadIntent(
          'tenant_test',
          buildFile({ buffer: emptyBuf, size: 0, mimetype: 'image/jpeg' }),
          'actor-001',
        ),
      ).rejects.toMatchObject({ response: { code: 'EVIDENCE_FILE_EMPTY' } });
    });
  });

  describe('getAssetStatus', () => {
    it('lanza NotFoundException si el asset no existe', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(null);
      await expect(
        createProvider().getAssetStatus('non-existent-id', 'tenant_test'),
      ).rejects.toMatchObject({ response: { code: 'EVIDENCE_ASSET_NOT_FOUND' } });
    });

    it('lanza NotFoundException si el asset fue soft-deleteado', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue({
        assetStatus: 'EXPIRED',
        deletedAt: new Date(),
        mimeType: 'image/jpeg',
        sizeBytes: 100,
        checksumSha256: 'abc123',
        createdAt: new Date(),
      });
      await expect(
        createProvider().getAssetStatus('deleted-id', 'tenant_test'),
      ).rejects.toMatchObject({ response: { code: 'EVIDENCE_ASSET_NOT_FOUND' } });
    });

    it('expone QUARANTINED como PENDING_ANALYSIS en la respuesta pública', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue({
        assetStatus: 'QUARANTINED',
        deletedAt: null,
        mimeType: 'image/png',
        sizeBytes: 200,
        checksumSha256: 'def456',
        createdAt: new Date('2026-01-01'),
      });
      const result = await createProvider().getAssetStatus('quarantined-id', 'tenant_test');
      expect(result.status).toBe('PENDING_ANALYSIS');
      expect(result.expiresAt).toBeDefined();
    });

    it('expone AVAILABLE como AVAILABLE', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue({
        assetStatus: 'AVAILABLE',
        deletedAt: null,
        mimeType: 'image/jpeg',
        sizeBytes: 300,
        checksumSha256: 'ghi789',
        createdAt: new Date('2026-01-01'),
      });
      const result = await createProvider().getAssetStatus('available-id', 'tenant_test');
      expect(result.status).toBe('AVAILABLE');
    });

    it('expone REJECTED como REJECTED', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue({
        assetStatus: 'REJECTED',
        deletedAt: null,
        mimeType: 'application/pdf',
        sizeBytes: 400,
        checksumSha256: 'jkl012',
        createdAt: new Date('2026-01-01'),
      });
      const result = await createProvider().getAssetStatus('rejected-id', 'tenant_test');
      expect(result.status).toBe('REJECTED');
    });
  });

  describe('getSignedUrl', () => {
    it('lanza ConflictException si el asset no está AVAILABLE', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue({
        id: 'asset-001',
        objectKey: 'key',
        assetStatus: 'QUARANTINED',
        deletedAt: null,
      });
      await expect(
        createProvider().getSignedUrl('asset-001', 'tenant_test', 3600),
      ).rejects.toMatchObject({ response: { code: 'EVIDENCE_ASSET_NOT_AVAILABLE' } });
    });

    it('lanza NotFoundException si el asset no existe', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(null);
      await expect(
        createProvider().getSignedUrl('non-existent', 'tenant_test', 3600),
      ).rejects.toMatchObject({ response: { code: 'EVIDENCE_ASSET_NOT_FOUND' } });
    });

    it('genera signed URL para asset AVAILABLE', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue({
        id: 'asset-001',
        objectKey: 'tenant_test/execution_evidence/asset-001.jpg',
        assetStatus: 'AVAILABLE',
        deletedAt: null,
      });
      (storage.getSignedUrl as jest.Mock).mockResolvedValue('https://signed.example.com/asset-001');
      const url = await createProvider().getSignedUrl('asset-001', 'tenant_test', 600);
      expect(url).toBe('https://signed.example.com/asset-001');
      expect(storage.getSignedUrl).toHaveBeenCalledWith(
        'tenant_test/execution_evidence/asset-001.jpg',
        600,
      );
    });
  });

  describe('claimAsset', () => {
    it('reclama exitosamente un asset AVAILABLE', async () => {
      const updateExecute = jest.fn().mockResolvedValue({ affected: 1 });
      (repo.createQueryBuilder as unknown as jest.Mock) = jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: updateExecute,
      });
      await expect(
        createProvider().claimAsset('asset-001', 'tenant_test', 'eo-001'),
      ).resolves.toBeUndefined();
    });

    it('lanza ConflictException si el asset ya fue reclamado', async () => {
      const updateExecute = jest.fn().mockResolvedValue({ affected: 0 });
      (repo.createQueryBuilder as unknown as jest.Mock) = jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: updateExecute,
      });
      (repo.findOne as jest.Mock).mockResolvedValue({
        id: 'asset-001',
        assetStatus: 'AVAILABLE',
        claimRef: 'tenant_other:eo-002',
        deletedAt: null,
      });
      await expect(
        createProvider().claimAsset('asset-001', 'tenant_test', 'eo-001'),
      ).rejects.toMatchObject({ response: { code: 'EVIDENCE_ASSET_ALREADY_CLAIMED' } });
    });

    it('lanza ConflictException si el asset no está disponible', async () => {
      const updateExecute = jest.fn().mockResolvedValue({ affected: 0 });
      (repo.createQueryBuilder as unknown as jest.Mock) = jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: updateExecute,
      });
      (repo.findOne as jest.Mock).mockResolvedValue({
        id: 'asset-001',
        assetStatus: 'QUARANTINED',
        claimRef: null,
        deletedAt: null,
      });
      await expect(
        createProvider().claimAsset('asset-001', 'tenant_test', 'eo-001'),
      ).rejects.toMatchObject({ response: { code: 'EVIDENCE_ASSET_NOT_AVAILABLE' } });
    });

    it('lanza NotFoundException si el asset no existe', async () => {
      const updateExecute = jest.fn().mockResolvedValue({ affected: 0 });
      (repo.createQueryBuilder as unknown as jest.Mock) = jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: updateExecute,
      });
      (repo.findOne as jest.Mock).mockResolvedValue(null);
      await expect(
        createProvider().claimAsset('asset-001', 'tenant_test', 'eo-001'),
      ).rejects.toMatchObject({ response: { code: 'EVIDENCE_ASSET_NOT_FOUND' } });
    });
  });
});
