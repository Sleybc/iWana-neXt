import type { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import { EvidenceAnalysisProcessor } from './evidence-analysis.processor';

describe('EvidenceAnalysisProcessor', () => {
  it('promueve solo una evidencia en cuarentena cuando el baseline es válido', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [{ asset_status: 'AVAILABLE' }] })
        .mockResolvedValueOnce(undefined),
      release: jest.fn(),
    };
    const processor = new EvidenceAnalysisProcessor({ get: jest.fn() } as unknown as ConfigService);
    (processor as unknown as { pool: { connect: jest.Mock } }).pool = {
      connect: jest.fn().mockResolvedValue(client),
    };

    await processor.process({
      data: {
        tenantSchema: 'tenant_test',
        mediaAssetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        correlationId: 'asset-correlation',
      },
    } as Job<{
      tenantSchema: string;
      mediaAssetId: string;
      correlationId: string;
    }>);

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("asset_status = 'QUARANTINED'"),
      ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'tenant_test'],
    );
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('rechaza el job si el tenant no es válido', async () => {
    const processor = new EvidenceAnalysisProcessor({ get: jest.fn() } as unknown as ConfigService);
    await expect(
      processor.process({
        data: {
          tenantSchema: 'tenant;drop',
          mediaAssetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          correlationId: 'asset-correlation',
        },
      } as Job<{
        tenantSchema: string;
        mediaAssetId: string;
        correlationId: string;
      }>),
    ).rejects.toThrow('EVIDENCE_ANALYSIS_INVALID_JOB');
  });
});
