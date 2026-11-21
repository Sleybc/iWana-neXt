import { PlatformRole, type PlatformUsersSummary } from '@iwana/shared';

/** Mock tipado de `GET /platform-users/summary` (PlatformUsersSummary v1.0). */
export function makePlatformUsersSummary(
  overrides: Partial<PlatformUsersSummary> = {},
): PlatformUsersSummary {
  return {
    total: 9,
    byRole: { [PlatformRole.SYSTEM_ADMIN]: 4, [PlatformRole.IWANA_SUPPORT]: 5 },
    withoutMfa: 2,
    withoutAccess30d: 1,
    generatedAt: '2026-11-21T10:00:00.000Z',
    ...overrides,
  };
}
