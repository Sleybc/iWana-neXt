import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración public 018 — MOD04 Ola C / H-05 (D-2=A).
 *
 * Habilita `pg_trgm` a nivel de base de datos (una vez). Los índices GIN por
 * schema tenant viven en la migración tenant `084`.
 *
 * GO PLAT-OPS 2026-07-22: disponible en `postgres:18-alpine` (trusted).
 * ADR: ADR-062 (extensión pg_trgm para búsqueda de usuarios).
 */
export class EnablePgTrgm0180000000000 implements MigrationInterface {
  name = 'EnablePgTrgm0180000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No dropear la extensión en down: otros objetos (índices tenant) pueden
    // depender de ella y un DROP CASCADE es destructivo entre schemas.
    void queryRunner;
  }
}
