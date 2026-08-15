import { PlatformRole, UserRole } from '@iwana/shared';

/** Lectura de catálogo / dashboard / picker (incluye NOC). */
export const COMMERCIAL_CATALOG_READ_ROLES = [
  UserRole.ADMIN,
  UserRole.SALES,
  UserRole.SUPPORT,
  UserRole.NOC,
  UserRole.ACCOUNTANT,
  PlatformRole.SYSTEM_ADMIN,
] as const;

/** Escritura de catálogo, bundles y compatibilidad. */
export const COMMERCIAL_CATALOG_WRITE_ROLES = [UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN] as const;

/** Lectura de combos y promociones (sin NOC). */
export const COMMERCIAL_OFFER_READ_ROLES = [
  UserRole.ADMIN,
  UserRole.SALES,
  UserRole.SUPPORT,
  UserRole.ACCOUNTANT,
  PlatformRole.SYSTEM_ADMIN,
] as const;

/** Escritura de promociones y reglas tributarias. */
export const COMMERCIAL_BILLING_WRITE_ROLES = [
  UserRole.ADMIN,
  UserRole.ACCOUNTANT,
  PlatformRole.SYSTEM_ADMIN,
] as const;

/** Lectura de precios SCD y cálculo de combo. */
export const COMMERCIAL_PRICE_READ_ROLES = [
  UserRole.ADMIN,
  UserRole.SALES,
  UserRole.ACCOUNTANT,
  PlatformRole.SYSTEM_ADMIN,
] as const;

/** Lectura de compatibilidad (sin ACCOUNTANT ni NOC). */
export const COMMERCIAL_COMPAT_READ_ROLES = [
  UserRole.ADMIN,
  UserRole.SALES,
  UserRole.SUPPORT,
  PlatformRole.SYSTEM_ADMIN,
] as const;

/** Lectura CUD de reglas tributarias (sin SALES). */
export const COMMERCIAL_TAX_READ_ROLES = [
  UserRole.ADMIN,
  UserRole.ACCOUNTANT,
  PlatformRole.SYSTEM_ADMIN,
] as const;

/** Simulador tributario (incluye SALES). */
export const COMMERCIAL_TAX_SIMULATE_ROLES = [
  UserRole.ADMIN,
  UserRole.ACCOUNTANT,
  UserRole.SALES,
  PlatformRole.SYSTEM_ADMIN,
] as const;
