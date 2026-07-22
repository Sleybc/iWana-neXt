/**
 * Roles de usuario DENTRO de un tenant.
 *
 * ADR-061 §4: `SYSTEM_ADMIN` e `IWANA_SUPPORT` ya no son miembros de este enum.
 * Viven exclusivamente en `PlatformRole` (platform-role.enum.ts). Mientras
 * fueron miembros de ambos enums, la columna `users.role` admitia a nivel de
 * tipo un rol de plataforma y la contencion era solo perimetral
 * (`TENANT_ASSIGNABLE_ROLES`): cualquier escritura que no pasara por
 * `UsersService` podia reintroducir el estado invalido que origino H-01.
 *
 * La frontera estructural es esta: un valor de `users.role` es, por tipo, un
 * rol de tenant. La migracion tenant 085 la fija tambien en la base de datos.
 */
export enum UserRole {
  ADMIN = 'ADMIN',
  NOC = 'NOC',
  SUPPORT = 'SUPPORT',
  SALES = 'SALES',
  TECHNICIAN = 'TECHNICIAN',
  ACCOUNTANT = 'ACCOUNTANT',
  HR = 'HR',
  SUBSCRIBER = 'SUBSCRIBER',
  CONTRACTOR = 'CONTRACTOR',
  PARTNER = 'PARTNER',
  AUDITOR = 'AUDITOR',
  INVESTOR = 'INVESTOR',
}
