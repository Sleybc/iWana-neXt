import { DataSource } from 'typeorm';
/**
 * Migración 005 — simplifica campos de users a texto plano manteniendo emailHash.
 *
 * No elimina `email_hash` porque sigue siendo dependencia transversal de autenticación.
 */
export declare function runMigration(dataSource: DataSource): Promise<void>;
/** Reversión estructural de la migración 005. */
export declare function revertMigration(dataSource: DataSource): Promise<void>;
//# sourceMappingURL=005_simplify_user_fields.d.ts.map