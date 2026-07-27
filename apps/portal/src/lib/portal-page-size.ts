/**
 * Tamaños de página del pager numerado (ADR-065 / contrato DS).
 * Alineado a `USERS_PAGE_SIZE` — no definir literales `20` locales en pantallas nuevas.
 */
export const PORTAL_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

export const PORTAL_DEFAULT_PAGE_SIZE = 20;

export type PortalPageSize = (typeof PORTAL_PAGE_SIZE_OPTIONS)[number];
