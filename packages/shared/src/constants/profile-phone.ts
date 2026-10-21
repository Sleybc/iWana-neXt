import { USER_PHONE_E164_PATTERN } from './user-field-constraints';

/**
 * Datos de dominio del perfil propio: prefijos telefónicos y patrón E.164.
 *
 * P-03: esta tabla vivía dentro de `PersonalInfoForm` como UI. Es dato de
 * dominio y vive en `@iwana/shared`. El patrón E.164 canónico vive en
 * `./user-field-constraints` (P-14, Ola 2) y aquí solo se reexporta.
 * `BulkImportUsersModal` (web) aún lo copia a mano: fuera del alcance de T4.
 */

/** Mapa de código ISO 3166-1 alpha-2 → prefijo telefónico E.164 */
export const COUNTRY_PHONE_PREFIX: Readonly<Record<string, string>> = {
  CO: '+57',
  US: '+1',
  MX: '+52',
  AR: '+54',
  CL: '+56',
  PE: '+51',
  EC: '+593',
  VE: '+58',
  BR: '+55',
  PA: '+507',
};

/** Prefijo E.164 del país del tenant; '+57' (Colombia) por defecto. */
export function getCountryPhonePrefix(countryCode?: string): string {
  return COUNTRY_PHONE_PREFIX[countryCode ?? 'CO'] ?? '+57';
}

/**
 * Normaliza un teléfono exclusivamente para generar un destino marcable.
 * `countryPrefix` debe provenir de `getCountryPhonePrefix` para el tenant.
 * No altera ni valida el dato persistido.
 */
export function toDialablePhone(
  raw: string | null | undefined,
  countryPrefix: string,
): string | null {
  if (raw == null) return null;

  const normalizedRaw = raw.replace(/[\s().-]/g, '');
  const candidate = normalizedRaw.startsWith('+')
    ? normalizedRaw
    : `${countryPrefix}${normalizedRaw}`;

  return USER_PHONE_E164_PATTERN.test(candidate) ? candidate : null;
}

/**
 * E.164: '+' + 7–15 dígitos.
 * Alias de `USER_PHONE_E164_PATTERN` (fuente única en
 * `./user-field-constraints`); se conserva por compatibilidad con los
 * consumidores actuales del portal.
 */
export { USER_PHONE_E164_PATTERN as E164_PHONE_PATTERN } from './user-field-constraints';
