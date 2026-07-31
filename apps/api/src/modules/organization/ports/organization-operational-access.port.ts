import type { EntityManager } from 'typeorm';

export interface OrganizationOperationalAccessInput {
  tenantId: string;
  userId: string;
  organizationSiteId: string;
}

/**
 * Puerto de lectura para políticas resource-aware de otros bounded contexts.
 * El manager pertenece a la transacción del caso de uso consumidor; así la
 * decisión no se separa de la lectura de la OT por un segundo contexto tenant.
 */
export abstract class OrganizationOperationalAccessPort {
  abstract canSuperviseExecutionOrder(
    manager: EntityManager,
    input: OrganizationOperationalAccessInput,
  ): Promise<boolean>;
}
