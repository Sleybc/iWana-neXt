/**
 * Clave HMAC de laboratorio para suites unitarias (SEC-P1).
 * Entropía no nula; no es un secreto de producción.
 */
if (!process.env.PII_HASH_KEY) {
  process.env.PII_HASH_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
}
