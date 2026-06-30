import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migración 008 — Tabla media_assets en schema público.
 *
 * Crea la tabla que registra todos los archivos subidos via el módulo Media.
 * Los archivos físicos viven en MinIO (ADR-033).
 * Cada fila representa un asset vinculado a un tenant (o 'platform' para assets globales).
 *
 * Schema: public
 * Reversible: sí — down() elimina la tabla completa
 *
 * ADR-034 — Bounded Context Media/Assets
 * HLD-TRANSVERSAL-MEDIA-ASSETS-v1.0
 */
export declare class CreateMediaAssetsTable1746000001000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=008_create_media_assets_table.d.ts.map