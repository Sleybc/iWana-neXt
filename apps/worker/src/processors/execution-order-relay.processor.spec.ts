import type { Job, Queue } from 'bullmq';
import { INVENTORY_SOURCE_CLEANUP_INTERVAL_MS, INVENTORY_SOURCE_MAX_AGE_MS } from '@iwana/shared';
import { ExecutionOrderInventoryRescanService } from '../services/execution-order-inventory-rescan.service';
import { ExecutionOrderRelayService } from '../services/execution-order-relay.service';
import { ExecutionOrderRelayProcessor } from './execution-order-relay.processor';

interface FailedJobInput {
  id: string;
  name: string;
  data: unknown;
  finishedOn: number;
}

function failedQueue(inputs: FailedJobInput[]): {
  queue: Queue;
  jobs: FailedJobInput[];
  clean: jest.Mock;
} {
  const jobs = [...inputs];
  const clean = jest.fn(async (grace: number, limit: number, type: string) => {
    if (type !== 'failed') throw new Error('unexpected state');
    const cutoff = Date.now() - grace;
    const expired = jobs.filter((job) => job.finishedOn <= cutoff).slice(0, limit);
    for (const job of expired) jobs.splice(jobs.indexOf(job), 1);
    return expired.map(({ id }) => id);
  });
  return { queue: { clean } as unknown as Queue, jobs, clean };
}

describe('ExecutionOrderRelayProcessor — retención de fuentes de inventario', () => {
  it('limpia jobs antiguos aunque estén malformados y conserva los recientes con solo worker activo', async () => {
    const now = Date.now();
    const cleanupGraceMs = INVENTORY_SOURCE_MAX_AGE_MS - INVENTORY_SOURCE_CLEANUP_INTERVAL_MS;
    const expired = now - (23 * 60 * 60 * 1000 + 30 * 60 * 1000);
    const recent = now - 60 * 60 * 1000;
    const inventoryRequests = failedQueue([
      { id: 'malformed-request', name: 'unknown', data: null, finishedOn: expired },
      ...Array.from({ length: 1_000 }, (_, index) => ({
        id: `old-request-${index}`,
        name: 'unknown',
        data: { malformed: true },
        finishedOn: expired,
      })),
      {
        id: 'recent-request',
        name: 'process-inventory-execution-request',
        data: {},
        finishedOn: recent,
      },
    ]);
    const operationsEvents = failedQueue([
      { id: 'missing-event-type', name: 'unknown', data: {}, finishedOn: expired },
      { id: 'recent-event', name: 'deliver-execution-event', data: {}, finishedOn: recent },
    ]);
    const relay = { scanAndRelay: jest.fn().mockResolvedValue(0) };
    const inventoryRescan = { scanPendingRequests: jest.fn().mockResolvedValue(undefined) };
    const processor = new ExecutionOrderRelayProcessor(
      relay as unknown as ExecutionOrderRelayService,
      inventoryRescan as unknown as ExecutionOrderInventoryRescanService,
      operationsEvents.queue,
      inventoryRequests.queue,
    );

    await processor.process({ name: 'clean-expired-inventory-source-failures' } as Job);

    expect(inventoryRequests.jobs.map(({ id }) => id)).toEqual(['recent-request']);
    expect(operationsEvents.jobs.map(({ id }) => id)).toEqual(['recent-event']);
    expect(INVENTORY_SOURCE_MAX_AGE_MS).toBe(24 * 60 * 60 * 1000);
    expect(INVENTORY_SOURCE_CLEANUP_INTERVAL_MS).toBe(60 * 60 * 1000);
    expect(cleanupGraceMs).toBe(23 * 60 * 60 * 1000);
    expect(inventoryRequests.clean).toHaveBeenCalledTimes(2);
    expect(inventoryRequests.clean).toHaveBeenNthCalledWith(1, cleanupGraceMs, 1_000, 'failed');
    expect(inventoryRequests.clean).toHaveBeenNthCalledWith(2, cleanupGraceMs, 1_000, 'failed');
    expect(operationsEvents.clean).toHaveBeenCalledWith(cleanupGraceMs, 1_000, 'failed');
    expect(relay.scanAndRelay).not.toHaveBeenCalled();
    expect(inventoryRescan.scanPendingRequests).not.toHaveBeenCalled();
  });

  it('si falla la limpieza, registra solo queue y errorType catalogado', async () => {
    const rawMessage = 'raw payload or exception must not be logged';
    const inventoryRequests = failedQueue([]);
    const operationsEvents = failedQueue([]);
    operationsEvents.clean.mockRejectedValue(new Error(rawMessage));
    const relay = { scanAndRelay: jest.fn().mockResolvedValue(0) };
    const inventoryRescan = { scanPendingRequests: jest.fn().mockResolvedValue(undefined) };
    const processor = new ExecutionOrderRelayProcessor(
      relay as unknown as ExecutionOrderRelayService,
      inventoryRescan as unknown as ExecutionOrderInventoryRescanService,
      operationsEvents.queue,
      inventoryRequests.queue,
    );
    const loggerWarn = jest.spyOn(
      (processor as unknown as { logger: { warn: (message: string) => void } }).logger,
      'warn',
    );

    await processor.process({ name: 'clean-expired-inventory-source-failures' } as Job);

    const logs = loggerWarn.mock.calls.flat().join(' ');
    expect(logs).toContain('queue=operations-execution-events');
    expect(logs).toContain('error_type=Error');
    expect(logs).not.toContain(rawMessage);
    expect(operationsEvents.clean).toHaveBeenCalledWith(
      INVENTORY_SOURCE_MAX_AGE_MS - INVENTORY_SOURCE_CLEANUP_INTERVAL_MS,
      1_000,
      'failed',
    );
  });
});
