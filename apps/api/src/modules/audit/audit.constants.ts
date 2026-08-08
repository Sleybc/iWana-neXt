/**
 * Constantes compartidas del modulo de auditoria.
 */

/**
 * Prefijo aplicado al `entityType` de las entradas reencaminadas a
 * `public.platform_audit_logs` porque su destino natural no era resoluble.
 *
 * Lo usan los dos caminos que pueden quedarse sin destino:
 * - `AuditInterceptor`, en peticiones CUD autenticadas sin TenantContext (H-01).
 * - `AuditService.log()`, en llamadas directas sin TenantContext ni
 *   tenantId/schemaName explicitos (S-8).
 *
 * Una fila con este prefijo no es ruido: senala que alguien audito por el canal
 * equivocado y que la operacion quedo fuera de su trail natural.
 */
export const ANOMALIA_AUDITORIA_PREFIX = 'ANOMALIA_AUDITORIA:';

/**
 * `entityType` canonico —singular— de toda entrada de auditoria sobre una cuenta
 * de plataforma.
 *
 * Convive con lo que el interceptor derivaba del nombre del controlador
 * (`PlatformUsers`, en plural) y con el `PlatformUserLoginEmail` que usaba el
 * cambio de correo. Dos nombres para la misma entidad rompen cualquier filtro por
 * `entity_type`; el matiz de la operacion va en `action` y en el payload, no en el
 * nombre de la entidad.
 */
export const PLATFORM_USER_ENTITY_TYPE = 'PlatformUser';

/**
 * `entityId` de un intento de login de plataforma contra un correo que no
 * corresponde a ninguna cuenta.
 *
 * Es un centinela deliberado, no un UUID: no hay entidad a la que apuntar y el
 * correo tecleado es PII que no se persiste. Los invariantes de auditoria exigen
 * UUID solo a las operaciones CUD, que siempre tienen entidad real.
 */
export const UNKNOWN_PLATFORM_USER_ENTITY_ID = 'USUARIO_DESCONOCIDO';
