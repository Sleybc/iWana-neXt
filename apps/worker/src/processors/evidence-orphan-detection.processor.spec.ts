import type { Job, Queue } from 'bullmq';
import type { ConfigService } from '@nestjs/config';
import { EvidenceOrphanDetectionProcessor } from './evidence-orphan-detection.processor';

describe('EvidenceOrphanDetectionProcessor', () => {
  it('libera claims con segmentos extra sin consultar un schema parcial', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce(undefined) // BEGIN de soft-delete
        .mockResolvedValueOnce({ rows: [] }) // UPDATE de soft-delete
        .mockResolvedValueOnce(undefined) // COMMIT de soft-delete
        .mockResolvedValueOnce({
          rows: [{ id: 'asset-001', claim_ref: 'tenant_test:order-001:extra' }],
        }) // SELECT de claims
        .mockResolvedValueOnce({ rows: [] }) // UPDATE de claim inválido
        .mockResolvedValueOnce({ rows: [] }) // SELECT de tenants para CLAIM_FAILED
        .mockResolvedValueOnce(undefined) // BEGIN de eliminación física
        .mockResolvedValueOnce({ rows: [] }) // UPDATE de eliminación física
        .mockResolvedValueOnce(undefined), // COMMIT de eliminación física
      release: jest.fn(),
    };
    const processor = new EvidenceOrphanDetectionProcessor(
      {
        get: jest.fn(),
      } as unknown as ConfigService,
      { add: jest.fn() } as unknown as Queue,
    );
    (processor as unknown as { pool: { connect: jest.Mock } }).pool = {
      connect: jest.fn().mockResolvedValue(client),
    };

    await processor.process({
      data: { operation: 'detect-and-clean', correlationId: 'correlation-001' },
    } as Job<{ operation: 'detect-and-clean'; correlationId: string }>);

    const queries = client.query.mock.calls.map(([query]) => query as string);
    expect(queries.some((query) => query.includes('execution_order_evidence'))).toBe(false);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('SET claim_ref = NULL'), [
      'asset-001',
    ]);
    expect(queries.some((query) => query.includes("asset_status = 'AVAILABLE'"))).toBe(false);
  });
});
