/**
 * Salud pública del API — contrato v1.0 congelado (PROMPT-WEB-DASHBOARD-OLA2-v1.0).
 * Respuesta de `GET /api/v1/health` sin envelope. HTTP 200 si `db` y `redis` son `ok`;
 * 503 con el mismo cuerpo si alguno falla. Sin telemetría adicional.
 */
export interface PublicHealth {
  status: 'ok' | 'degraded';
  db: 'ok' | 'error';
  redis: 'ok' | 'error';
  /** ISO 8601. */
  timestamp: string;
}
