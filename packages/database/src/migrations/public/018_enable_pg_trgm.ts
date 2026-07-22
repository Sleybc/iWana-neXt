import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración public 018 — MOD04 Ola C / H-05 (D-2=A).
 *
 * Habilita `pg_trgm` a nivel de base de datos (una vez). Los índices GIN por
 * schema tenant viven en la migración tenant `084`.
 *
 * GO PLAT-OPS 2026-07-22: disponible en `postgres:18-alpine` (trusted).
 * ADR: ADR-062 (extensión pg_trgm para búsqueda de usuarios).
 *
 * NO REVERTIR EL TIMESTAMP DE ESTA CLASE (renumerada 2026-07-22).
 *
 * Nació con el sufijo `0180000000000`, MENOR que toda la cadena public
 * (`1741766400000`..`1784419206000`). TypeORM ordena por el timestamp del
 * NOMBRE DE CLASE, no por el prefijo del fichero: sobre una base limpia esta
 * migración corría ANTES de `CreatePublicSchema1741766400000`. En `dbiw` no se
 * notaba porque ya estaba aplicada — el defecto solo aparece en CI limpio y en
 * el bootstrap de un entorno nuevo. Es el mismo fallo documentado en
 * `013_add_tenant_admin_email.ts`, reintroducido.
 *
 * El sufijo actual queda por encima del máximo de la cadena previa. Renumerar
 * es seguro aquí porque `CREATE EXTENSION IF NOT EXISTS` es idempotente: las
 * bases que ya la tenían registrada con el nombre viejo la reejecutan sin
 * efecto. Esa idempotencia es la condición necesaria para renumerar.
 */
export class EnablePgTrgm1784419207000 implements MigrationInterface {
  name = 'EnablePgTrgm1784419207000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No dropear la extensión en down: otros objetos (índices tenant) pueden
    // depender de ella y un DROP CASCADE es destructivo entre schemas.
    void queryRunner;
  }
}
