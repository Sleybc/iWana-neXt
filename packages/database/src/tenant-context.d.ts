/**
 * Payload del contexto de tenant propagado via AsyncLocalStorage.
 * Se inicializa en TenantMiddleware y queda disponible para toda
 * la cadena de ejecucion del request (servicios, repositorios, interceptores).
 *
 * ADVERTENCIA: AsyncLocalStorage NO se propaga a workers BullMQ automaticamente.
 * Los workers deben reconstruir el contexto desde el payload del job (Riesgo R3).
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 2 (Schema routing middleware)
 */
export interface TenantContextPayload {
    /** UUID del tenant en public.tenants */
    tenantId: string;
    /** Nombre del schema PostgreSQL: "tenant_<slug>" */
    schemaName: string;
    /** Slug legible del tenant. Inmutable post-creacion */
    tenantSlug: string;
}
/**
 * API de acceso al contexto de tenant del request en curso.
 *
 * Uso en middleware:
 *   TenantContext.run({ tenantId, schemaName, tenantSlug }, () => next());
 *
 * Uso en servicio:
 *   const ctx = TenantContext.getOrThrow();
 */
export declare const TenantContext: {
    /**
     * Ejecuta fn dentro del contexto del tenant dado.
     * Equivalente a AsyncLocalStorage.run — el contexto esta disponible
     * para todo el arbol de llamadas dentro de fn.
     */
    readonly run: <T>(context: TenantContextPayload, fn: () => T) => T;
    /** Retorna el contexto del tenant o undefined si no hay request activo */
    readonly get: () => TenantContextPayload | undefined;
    /**
     * Retorna el contexto del tenant o lanza un error.
     * Usar en servicios que requieren contexto de tenant obligatorio.
     */
    readonly getOrThrow: () => TenantContextPayload;
};
//# sourceMappingURL=tenant-context.d.ts.map