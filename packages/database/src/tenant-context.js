'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.TenantContext = void 0;
const async_hooks_1 = require('async_hooks');
/** Storage de AsyncLocalStorage con scope de request */
const tenantStorage = new async_hooks_1.AsyncLocalStorage();
/**
 * API de acceso al contexto de tenant del request en curso.
 *
 * Uso en middleware:
 *   TenantContext.run({ tenantId, schemaName, tenantSlug }, () => next());
 *
 * Uso en servicio:
 *   const ctx = TenantContext.getOrThrow();
 */
exports.TenantContext = {
  /**
   * Ejecuta fn dentro del contexto del tenant dado.
   * Equivalente a AsyncLocalStorage.run — el contexto esta disponible
   * para todo el arbol de llamadas dentro de fn.
   */
  run: (context, fn) => tenantStorage.run(context, fn),
  /** Retorna el contexto del tenant o undefined si no hay request activo */
  get: () => tenantStorage.getStore(),
  /**
   * Retorna el contexto del tenant o lanza un error.
   * Usar en servicios que requieren contexto de tenant obligatorio.
   */
  getOrThrow: () => {
    const ctx = tenantStorage.getStore();
    if (!ctx) {
      throw new Error(
        'TenantContext no inicializado. ' +
          'Verificar que TenantMiddleware esta aplicado a esta ruta.',
      );
    }
    return ctx;
  },
};
//# sourceMappingURL=tenant-context.js.map
