import type { EntityManager } from 'typeorm';

/**
 * Nombre visible de los responsables de tickets (spec MOD05 pestaña Soporte §16 B-1). Lo
 * implementa Usuarios; Assurance no lee la tabla `users`. Solo nombre y apellido: nunca el
 * correo ni otros datos de la cuenta.
 */
export abstract class AssuranceAssigneeNamesPort {
  /**
   * Nombre de cada usuario utilizable como responsable, en una sola consulta y con el manager
   * de la transacción del llamante. Quedan fuera del mapa los ids no UUID, inexistentes,
   * borrados, desactivados (INACTIVE, SUSPENDED) o sin nombre ni apellido.
   */
  abstract findDisplayNames(
    manager: EntityManager,
    tenantId: string,
    userIds: readonly string[],
  ): Promise<ReadonlyMap<string, string>>;
}
