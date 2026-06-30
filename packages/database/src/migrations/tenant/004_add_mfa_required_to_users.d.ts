import { DataSource } from 'typeorm';
/**
 * Migración retroactiva de schemas de tenant — Campo mfa_required en users.
 *
 * Agrega columna `mfa_required` a la tabla `users` en TODOS los schemas
 * de tenant activos. Default false — no cambia el comportamiento de usuarios existentes.
 *
 * Uso:
 *   pnpm --filter @iwana/db migration:tenant:run
 */
export declare function runMigration(dataSource: DataSource): Promise<void>;
//# sourceMappingURL=004_add_mfa_required_to_users.d.ts.map