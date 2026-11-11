import type { EntityManager } from 'typeorm';

/**
 * Correo de un usuario activo del tenant, para avisos dirigidos a una persona concreta
 * (p. ej. el responsable comercial de una oportunidad). Null si no está activo o no tiene correo.
 */
export abstract class IActiveUserEmailReadPort {
  abstract emailOf(userId: string, manager: EntityManager): Promise<string | null>;
}
