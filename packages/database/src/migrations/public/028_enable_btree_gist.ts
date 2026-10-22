import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración public 028 — habilita `btree_gist` una vez para los schemas tenant.
 * La migración tenant 160 usa la extensión para excluir redes IPv4 solapadas.
 */
export class EnableBtreeGist1784419216000 implements MigrationInterface {
  name = 'EnableBtreeGist1784419216000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS btree_gist');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // La extensión puede tener índices dependientes en varios schemas tenant.
    void queryRunner;
  }
}
