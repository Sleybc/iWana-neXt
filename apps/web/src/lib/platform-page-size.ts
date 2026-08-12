/** Tamaños de página del historial (alineado a ADR-065 / portal). */
export const PLATFORM_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

/** Tope del DTO `QueryAuditLogsDto` / `QueryPlatformAuditLogsDto` (`@Max(100)`). */
export const AUDIT_LIST_MAX_LIMIT = 100;

export const PLATFORM_DEFAULT_PAGE_SIZE = 10;

export type PlatformPageSize = (typeof PLATFORM_PAGE_SIZE_OPTIONS)[number];

export function parsePlatformPageSize(raw: string | null | undefined): PlatformPageSize {
  const n = Number.parseInt(raw ?? '', 10);
  return (PLATFORM_PAGE_SIZE_OPTIONS as readonly number[]).includes(n)
    ? (n as PlatformPageSize)
    : PLATFORM_DEFAULT_PAGE_SIZE;
}
