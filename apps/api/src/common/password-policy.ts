/**
 * Politica de contrasenas del servidor (Ola 2, decision CTO 2026-09-03).
 *
 * Fuente unica del lado API: min 10, max 128 + complejidad NIST
 * (mayuscula, minuscula, digito, caracter especial). Espeja
 * `createBootstrapPasswordSchema` de `@iwana/shared` para que la politica
 * no sea cosmetica (el cliente se valida con Zod; el servidor con
 * class-validator sobre estos patrones).
 *
 * Vive en `apps/api` y no en `packages/shared` a proposito: los schemas
 * compartidos son superficie de T4 (consolidacion DS) y este track no la toca.
 *
 * La politica aplica al FIJAR una credencial, nunca al verificarla en login:
 * `currentPassword` / `LoginDto.password` no la usan (ver Paso 7 del prompt).
 */

/** Longitud minima de una contrasena fijada por cualquier via. */
export const PASSWORD_MIN_LENGTH = 10;

/** Longitud maxima (columna y contrato: 128). */
export const PASSWORD_MAX_LENGTH = 128;

/** Al menos una mayuscula (A-Z, ASCII). */
export const PASSWORD_UPPERCASE_PATTERN = /[A-Z]/;

/** Al menos una minuscula (a-z, ASCII). */
export const PASSWORD_LOWERCASE_PATTERN = /[a-z]/;

/** Al menos un digito. */
export const PASSWORD_DIGIT_PATTERN = /\d/;

/** Al menos un caracter especial (no alfanumerico). */
export const PASSWORD_SPECIAL_PATTERN = /[^A-Za-z0-9]/;

/** Mensaje unico de complejidad, en espanol y sentence case. */
export const PASSWORD_COMPLEXITY_MESSAGE =
  'La contraseña debe incluir mayúscula, minúscula, número y carácter especial.';
