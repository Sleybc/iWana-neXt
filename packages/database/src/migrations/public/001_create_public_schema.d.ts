import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migracion 001 — Creacion del schema publico MOD01.
 *
 * Crea las 3 tablas de plataforma en el schema 'public':
 * - public.tenants: ISPs clientes de la plataforma
 * - public.platform_users: usuarios de administracion de la plataforma
 * - public.platform_audit_logs: auditoria append-only de operaciones de plataforma
 *
 * REVERSIBILIDAD: down() elimina tablas en orden inverso al de dependencias.
 *
 * Referencias:
 * - HLD-MOD01-ARQUITECTURA-v1.0 Seccion 3 (Modelo de Datos)
 * - ADR-017: Multi-tenant schema-per-tenant
 * - ADR-018: TypeORM como ORM principal
 */
export declare class CreatePublicSchema1741766400000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=001_create_public_schema.d.ts.map