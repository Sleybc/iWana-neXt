import { SetMetadata } from '@nestjs/common';

/**
 * Clave de metadata para indicar el nombre de la entidad auditada.
 *
 * Cuando se aplica en un controlador, el AuditInterceptor usara este nombre
 * en lugar de derivarlo del nombre de la clase del controlador.
 *
 * Uso:
 *   @AuditEntity('User')
 *   @Controller('users')
 *   export class UsersController { ... }
 */
export const AUDIT_ENTITY_KEY = 'auditEntity';
export const AuditEntity = (entityName: string) => SetMetadata(AUDIT_ENTITY_KEY, entityName);
