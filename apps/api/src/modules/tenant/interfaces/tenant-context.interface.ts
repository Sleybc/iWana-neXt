import { TenantStatus } from '@iwana/shared';

/**
 * Contexto de tenant resuelto y almacenado en AsyncLocalStorage
 * para el request en curso.
 *
 * Inicializado por TenantMiddleware a partir del JWT del usuario autenticado.
 * Disponible via TenantContext.getOrThrow() para toda la cadena de llamadas.
 */
export interface TenantContextInterface {
  /** UUID del tenant en public.tenants */
  tenantId: string;
  /** Nombre del schema PostgreSQL: "tenant_<slug>" */
  schemaName: string;
  /** Slug legible e inmutable del tenant */
  tenantSlug: string;
  /** Estado actual del tenant al momento de la resolucion */
  status: TenantStatus;
}
