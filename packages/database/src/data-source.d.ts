import 'reflect-metadata';
import { DataSource, DataSourceOptions, QueryRunner } from 'typeorm';
/**
 * Opciones de configuracion del DataSource TypeORM.
 *
 * MULTI-TENANT: El schema de la conexion no se fija aqui.
 * - Entidades de schema publico: usan schema: 'public' en @Entity() — TypeORM
 *   las califica como "public"."tabla" siempre.
 * - Entidades de schema tenant: SIN schema en @Entity() — TypeORM las genera
 *   sin calificar ("tabla"), PostgreSQL las resuelve via search_path.
 *
 * PGBOUNCER (Riesgo R2): Usar SET LOCAL search_path al inicio de cada
 * transaccion — no usar SET (persistente) que no sobrevive entre
 * conexiones en transaction pooling mode.
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 2 + ADR-018
 */
export declare const dataSourceOptions: DataSourceOptions;
/** DataSource principal para uso via NestJS DI (TypeOrmModule.forRootAsync) */
export declare const AppDataSource: DataSource;
/**
 * Nombre de schema valido: solo letras minusculas, numeros y guiones_bajos.
 * Prefijo obligatorio "tenant_" para distinguir de schemas del sistema.
 * Longitud maxima PostgreSQL: 63 caracteres.
 * Regex: ^tenant_[a-z][a-z0-9_]{0,54}$
 */
export declare function isValidSchemaName(schemaName: string): boolean;
/**
 * Ejecuta una funcion dentro de una transaccion con el search_path
 * del schema de tenant indicado.
 *
 * Garantiza:
 * 1. SET LOCAL search_path (compatible con pgBouncer transaction pooling)
 * 2. Rollback automatico en caso de error
 * 3. Release del QueryRunner en finally (sin leak de conexiones)
 *
 * @throws Error si schemaName no es un schema de tenant valido
 */
export declare function runInTenantSchema<T>(dataSource: DataSource, schemaName: string, fn: (qr: QueryRunner) => Promise<T>): Promise<T>;
//# sourceMappingURL=data-source.d.ts.map