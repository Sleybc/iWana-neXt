/** Cola del vencimiento de retención H-EXP, procesada en la API (ADR-105). */
export const RETENTION_EXPIRY_QUEUE = 'privacy-retention-expiry';
export const RETENTION_EXPIRY_SWEEP_JOB = 'privacy-retention-expiry-sweep';
export const RETENTION_EXPIRY_TENANT_JOB = 'privacy-retention-expiry-tenant';
export const RETENTION_EXPIRY_REPEATABLE_JOB_ID = 'privacy-retention-expiry';
export const RETENTION_EXPIRY_CRON_PATTERN = '0 4 * * *';
export const RETENTION_EXPIRY_TIME_ZONE = 'America/Bogota';
export const RETENTION_EXPIRY_ATTEMPTS = 5;
export const RETENTION_EXPIRY_BACKOFF_MS = 30_000;
