import {
  areBullMqWorkersOperational,
  isWorkerHeartbeatFresh,
  resolveWorkerHeartbeatTiming,
  type BullMqWorkerHealthState,
} from './worker-heartbeat.health';

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

  it('requires every BullMQ consumer to be running, unpaused and connected', async () => {
    const ready = (): BullMqWorkerHealthState => ({
      isRunning: () => true,
      isPaused: () => false,
      client: Promise.resolve({ status: 'ready' }),
    });

    expect(await areBullMqWorkersOperational([])).toBe(false);
    expect(await areBullMqWorkersOperational([ready()])).toBe(true);
    expect(
      await areBullMqWorkersOperational([ready(), { ...ready(), isRunning: () => false }]),
    ).toBe(false);
    expect(await areBullMqWorkersOperational([ready(), { ...ready(), isPaused: () => true }])).toBe(
      false,
    );
    expect(
      await areBullMqWorkersOperational([
        ready(),
        { ...ready(), client: Promise.resolve({ status: 'reconnecting' }) },
      ]),
    ).toBe(false);
  });
});
