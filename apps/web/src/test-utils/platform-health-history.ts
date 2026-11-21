import type { PlatformHealthDay, PlatformHealthHistory } from '@iwana/shared';

const ok = { samples: 288, availability: 1 };

/** Mock tipado de `GET /platform/health/history` (contrato P2 v1.0): 30 días OK. */
export function makeHealthDays(
  overrides: Record<number, Partial<PlatformHealthDay['components']>> = {},
): PlatformHealthDay[] {
  return Array.from({ length: 30 }, (_, i) => {
    const date = new Date(Date.UTC(2026, 9, 23 + i)).toISOString().slice(0, 10);
    return { date, components: { api: ok, db: ok, redis: ok, ...overrides[i] } };
  });
}

export function makePlatformHealthHistory(
  overrides: Partial<PlatformHealthHistory> = {},
): PlatformHealthHistory {
  return {
    days: makeHealthDays(),
    queues: [
      { name: 'tenant-provisioning', waiting: 0, failed: 0, oldestWaitingSeconds: null },
      { name: 'search-index', waiting: 3, failed: 1, oldestWaitingSeconds: 420 },
    ],
    queuesSampledAt: '2026-11-21T09:55:00.000Z',
    generatedAt: '2026-11-21T10:00:00.000Z',
    ...overrides,
  };
}
