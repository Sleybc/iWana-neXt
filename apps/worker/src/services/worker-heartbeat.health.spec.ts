import { isWorkerHeartbeatFresh, resolveWorkerHeartbeatTiming } from './worker-heartbeat.health';

describe('worker heartbeat health helpers', () => {
  it('rejects a missing, malformed, future or stale heartbeat', () => {
    const now = 1_800_000_000_000;

    expect(isWorkerHeartbeatFresh(null, now, 30)).toBe(false);
    expect(isWorkerHeartbeatFresh('not-a-timestamp', now, 30)).toBe(false);
    expect(isWorkerHeartbeatFresh(String(now + 1), now, 30)).toBe(false);
    expect(isWorkerHeartbeatFresh(String(now - 30_001), now, 30)).toBe(false);
  });

  it('accepts a heartbeat within the configured TTL', () => {
    const now = 1_800_000_000_000;

    expect(isWorkerHeartbeatFresh(String(now - 30_000), now, 30)).toBe(true);
    expect(resolveWorkerHeartbeatTiming(undefined, undefined)).toEqual({
      intervalSeconds: 10,
      ttlSeconds: 30,
    });
  });
});
