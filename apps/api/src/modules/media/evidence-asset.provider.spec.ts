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
});
