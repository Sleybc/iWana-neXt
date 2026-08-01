import { SetMetadata } from '@nestjs/common';

export const EXECUTION_ORDER_TENANT_SCOPED_KEY = 'execution_order_tenant_scoped';

/**
 * Marca rutas tenant-scoped sin recurso de OT (p. ej. health del relay):
 * ExecutionOrderAccessGuard permite el paso sin comprobación ABAC sobre un
 * recurso inexistente en los params. JWT/RBAC/PermissionsGuard ya validaron
 * rol y permiso antes de que corra el guard ABAC.
 */
export const ExecutionOrderTenantScoped = () =>
  SetMetadata(EXECUTION_ORDER_TENANT_SCOPED_KEY, true);
