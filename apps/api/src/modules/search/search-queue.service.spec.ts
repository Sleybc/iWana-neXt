import { BUSINESS_JOB_REMOVE_ON_FAIL } from '@iwana/shared';
import { SearchQueueService } from './search-queue.service';

describe('SearchQueueService — retención B(b)', () => {
  it('los cinco trabajos del índice conservan los fallidos 14 días (familia N)', async () => {
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const service = new SearchQueueService(queue as never);
    const calls: Array<() => Promise<void>> = [];
    for (const key of Object.getOwnPropertyNames(SearchQueueService.prototype)) {
      const method = (service as unknown as Record<string, unknown>)[key];
      if (key.startsWith('enqueue') && typeof method === 'function') {
        calls.push(() => (method as (...args: unknown[]) => Promise<void>).call(service, 'id-1'));
      }
    }
    for (const call of calls) await call();

    expect(queue.add).toHaveBeenCalledTimes(5);
    for (const [, , options] of queue.add.mock.calls) {
      expect(options).toEqual(
        expect.objectContaining({ removeOnFail: BUSINESS_JOB_REMOVE_ON_FAIL }),
      );
    }
  });
});
