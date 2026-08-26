import { PlatformRole, UserRole } from '@iwana/shared';

/** Lectura de reglas y catálogo tributario. */
export const TAXATION_TAX_READ_ROLES = [
  UserRole.ADMIN,
  UserRole.ACCOUNTANT,
  PlatformRole.SYSTEM_ADMIN,
] as const;

/** Escritura de reglas y aplicaciones. */
export const TAXATION_TAX_WRITE_ROLES = [
  UserRole.ADMIN,
  UserRole.ACCOUNTANT,
  PlatformRole.SYSTEM_ADMIN,
] as const;

/** Simulador tributario (incluye ventas). */
export const TAXATION_TAX_SIMULATE_ROLES = [
  UserRole.ADMIN,
  UserRole.ACCOUNTANT,
  UserRole.SALES,
  PlatformRole.SYSTEM_ADMIN,
] as const;
