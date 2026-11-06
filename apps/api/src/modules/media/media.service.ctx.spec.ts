import { ConfigService } from '@nestjs/config';
import { MediaAsset, MediaUsage } from '@iwana/db';
import { MediaService } from './media.service';

/**
 * CA-5 (D3): con `ctx` `findOne` usa el repositorio del manager del llamante y
 * no el repositorio propio; sin `ctx` conserva el repositorio inyectado.
 */
function buildAsset(): MediaAsset {
  const asset = new MediaAsset();
  asset.id = '11111111-1111-4111-8111-111111111111';
  asset.tenantSchema = 'tenant_ctx';
  asset.usage = MediaUsage.STRATUM_EVIDENCE;
  asset.themeVariant = null;
  asset.originalFilename = 'soporte-sintetico.pdf';
  asset.mimeType = 'application/pdf';
  asset.ext = 'pdf';
  asset.sizeBytes = 128;
  asset.objectKey = 'tenant_ctx/stratum_evidence/11111111-1111-4111-8111-111111111111.pdf';
  asset.publicUrl = null;
  asset.uploadedByUserId = null;
  asset.createdAt = new Date('2026-01-01T00:00:00Z');
  asset.updatedAt = new Date('2026-01-01T00:00:00Z');
  asset.deletedAt = null;
  return asset;
}

describe('MediaService.findOne · contexto de transacción (D3)', () => {
  const asset = buildAsset();
  const config = { get: () => undefined } as unknown as ConfigService;

  it('con ctx usa el repositorio del manager y no el repositorio propio', async () => {
    const ownRepo = { findOne: jest.fn().mockResolvedValue(asset) };
    const ctxRepo = { findOne: jest.fn().mockResolvedValue(asset) };
    const manager = { getRepository: jest.fn(() => ctxRepo) };
    const service = new MediaService(ownRepo as never, {} as never, config);

    const result = await service.findOne(asset.id, 'tenant_ctx', { manager: manager as never });

    expect(result.id).toBe(asset.id);
    expect(manager.getRepository).toHaveBeenCalledTimes(1);
    expect(ctxRepo.findOne).toHaveBeenCalledTimes(1);
    expect(ownRepo.findOne).not.toHaveBeenCalled();
  });

  it('sin ctx conserva el repositorio propio', async () => {
    const ownRepo = { findOne: jest.fn().mockResolvedValue(asset) };
    const service = new MediaService(ownRepo as never, {} as never, config);

    const result = await service.findOne(asset.id, 'tenant_ctx');

    expect(result.id).toBe(asset.id);
    expect(ownRepo.findOne).toHaveBeenCalledTimes(1);
  });
});
