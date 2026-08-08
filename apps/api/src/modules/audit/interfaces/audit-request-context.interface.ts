/**
 * Metadatos de la peticion HTTP que acompanan a una entrada de auditoria emitida
 * desde un servicio.
 *
 * `AuditInterceptor` los toma del `Request` por su cuenta. Un servicio que emite
 * su propia entrada —y por tanto marca el handler con `@SkipAudit()`— tiene que
 * recibirlos explicitamente, o la fila pierde el origen del cambio: sin IP ni
 * User-Agent, un cambio de credenciales de plataforma deja de ser atribuible.
 */
export interface AuditRequestContext {
  /** IP del solicitante (IPv4 o IPv6, max 45 chars). */
  ipAddress?: string | null;
  /** User-Agent del cliente. */
  userAgent?: string | null;
}
