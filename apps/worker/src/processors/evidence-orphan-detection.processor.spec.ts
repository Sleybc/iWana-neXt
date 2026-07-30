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
        .mockResolvedValueOnce({ rows: [] }), // SELECT de candidatos físicos
      release: jest.fn(),
    };
    const processor = new EvidenceOrphanDetectionProcessor(
      {
        get: jest.fn(),
      } as unknown as ConfigService,
      { add: jest.fn() } as unknown as Queue,
      { deleteObject: jest.fn() },
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

  it('audita el soft-delete en el schema tenant antes de confirmar la transacción', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              object_key: 'tenant_test/execution_evidence/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg',
              tenant_schema: 'tenant_test',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }] })
        .mockResolvedValueOnce(undefined) // SET LOCAL search_path
        .mockResolvedValueOnce({ rows: [] }) // INSERT audit
        .mockResolvedValueOnce(undefined), // COMMIT
    };
    const processor = new EvidenceOrphanDetectionProcessor(
      { get: jest.fn() } as unknown as ConfigService,
      { add: jest.fn() } as unknown as Queue,
      { deleteObject: jest.fn() },
    );

    await (
      processor as unknown as {
        softDeleteUnclaimedOrphans: (client: unknown, correlationId: string) => Promise<void>;
      }
    ).softDeleteUnclaimedOrphans(client, 'correlation-audit');

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "tenant_test".audit_logs'),
      expect.arrayContaining([
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        'DELETE',
        'MediaAsset',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      ]),
    );
  });

  it('borra el objeto físico antes de marcar DELETED', async () => {
    const deleteObject = jest.fn().mockResolvedValue(undefined);
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              object_key: 'tenant_test/execution_evidence/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg',
              tenant_schema: 'tenant_test',
            },
          ],
        })
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce(undefined), // COMMIT
    };
    const processor = new EvidenceOrphanDetectionProcessor(
      { get: jest.fn() } as unknown as ConfigService,
      { add: jest.fn() } as unknown as Queue,
      { deleteObject },
    );

    await (
      processor as unknown as {
        physicalDeleteRetained: (client: unknown, correlationId: string) => Promise<void>;
      }
    ).physicalDeleteRetained(client, 'correlation-delete');

    expect(deleteObject).toHaveBeenCalledWith(
      'tenant_test/execution_evidence/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg',
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("SET asset_status = 'DELETED'"),
      ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
    );
  });

  it('recupera un CLAIM_FAILED sin promover una cuarentena', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ schema_name: 'tenant_test' }] })
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce(undefined) // SET LOCAL search_path
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'evidence-001',
              media_asset_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              execution_order_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ asset_status: 'QUARANTINED', claim_ref: null }] })
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE evidence
        .mockResolvedValueOnce(undefined), // COMMIT
    };
    const processor = new EvidenceOrphanDetectionProcessor(
      { get: jest.fn() } as unknown as ConfigService,
      { add: jest.fn() } as unknown as Queue,
      { deleteObject: jest.fn() },
    );

    await (
      processor as unknown as {
        reconcileClaimFailed: (client: unknown, correlationId: string) => Promise<void>;
      }
    ).reconcileClaimFailed(client, 'correlation-claim');

    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('SET asset_status = $1'), [
      'PENDING_ANALYSIS',
      'evidence-001',
    ]);
    expect(
      client.query.mock.calls.some(([query]) => String(query).includes('claim_ref = $1')),
    ).toBe(false);
  });

  it('no marca DELETED si falla el borrado físico del objeto', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              object_key: 'tenant_test/execution_evidence/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg',
              tenant_schema: 'tenant_test',
            },
          ],
        })
        .mockResolvedValueOnce(undefined), // ROLLBACK tras fallo del storage
    };
    const processor = new EvidenceOrphanDetectionProcessor(
      { get: jest.fn() } as unknown as ConfigService,
      { add: jest.fn() } as unknown as Queue,
      { deleteObject: jest.fn().mockRejectedValue(new Error('storage-unavailable')) },
    );

    await expect(
      (
        processor as unknown as {
          physicalDeleteRetained: (client: unknown, correlationId: string) => Promise<void>;
        }
      ).physicalDeleteRetained(client, 'correlation-delete-error'),
    ).rejects.toThrow('EVIDENCE_PHYSICAL_DELETE_FAILED:1');
    expect(
      client.query.mock.calls.some(([query]) =>
        String(query).includes("SET asset_status = 'DELETED'"),
      ),
    ).toBe(false);
  });
});
