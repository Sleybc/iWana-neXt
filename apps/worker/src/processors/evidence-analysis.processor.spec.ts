import type { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import { createHash } from 'node:crypto';
import { EvidenceAnalysisProcessor } from './evidence-analysis.processor';

describe('EvidenceAnalysisProcessor', () => {
  it('promueve solo una evidencia en cuarentena cuando el baseline es válido', async () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(12).fill(0)]);
    const checksum = createHash('sha256').update(bytes).digest('hex');
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          rows: [
            {
              mime_type: 'image/jpeg',
              size_bytes: bytes.length,
              checksum_sha256: checksum,
              object_key: 'tenant_test/execution_evidence/asset.jpg',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ asset_status: 'AVAILABLE' }] })
        .mockResolvedValueOnce(undefined),
      release: jest.fn(),
    };
    const storage = { getObject: jest.fn().mockResolvedValue(bytes) };
    const processor = new EvidenceAnalysisProcessor({ get: jest.fn() } as unknown as ConfigService);
    (processor as unknown as { storage: typeof storage }).storage = storage;
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

    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'), [
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'tenant_test',
    ]);
    expect(storage.getObject).toHaveBeenCalledWith('tenant_test/execution_evidence/asset.jpg');
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('SET asset_status = $3'), [
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'tenant_test',
      'AVAILABLE',
    ]);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('rechaza sin promover cuando el objeto no contiene bytes reales', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          rows: [
            {
              mime_type: 'image/jpeg',
              size_bytes: 16,
              checksum_sha256: 'a'.repeat(64),
              object_key: 'tenant_test/execution_evidence/asset.jpg',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ asset_status: 'REJECTED' }] })
        .mockResolvedValueOnce(undefined),
      release: jest.fn(),
    };
    const storage = { getObject: jest.fn().mockResolvedValue(Buffer.alloc(0)) };
    const processor = new EvidenceAnalysisProcessor(
      { get: jest.fn() } as unknown as ConfigService,
      storage,
    );
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

    expect(storage.getObject).toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('SET asset_status = $3'), [
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'tenant_test',
      'REJECTED',
    ]);
    expect(client.query).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['AVAILABLE']),
    );
  });

  it('rechaza checksum del objeto que no coincide con la metadata', async () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(12).fill(0)]);
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          rows: [
            {
              mime_type: 'image/jpeg',
              size_bytes: bytes.length,
              checksum_sha256: 'b'.repeat(64),
              object_key: 'tenant_test/execution_evidence/asset.jpg',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ asset_status: 'REJECTED' }] })
        .mockResolvedValueOnce(undefined),
      release: jest.fn(),
    };
    const processor = new EvidenceAnalysisProcessor(
      { get: jest.fn() } as unknown as ConfigService,
      { getObject: jest.fn().mockResolvedValue(bytes) },
    );
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

    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('SET asset_status = $3'), [
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'tenant_test',
      'REJECTED',
    ]);
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
