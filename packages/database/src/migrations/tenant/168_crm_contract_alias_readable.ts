import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración tenant 168: alias autogenerados legibles.
 *
 * Solo toca alias con el prefijo que genera el servidor («Servicio — …»): el resto puede
 * ser texto del usuario. Quita guiones bajos y deja cada palabra con mayúscula inicial,
 * igual que la regla vigente de creación. Respalda el valor anterior para el down y sube
 * updated_at, que es la versión que usan las ediciones concurrentes.
 */
export class CrmContractAliasReadable1680000000000 implements MigrationInterface {
  name = 'CrmContractAliasReadable1680000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE crm_contract_alias_backup_168 (
        contract_id uuid PRIMARY KEY,
        alias varchar(120) NOT NULL
      )
    `);
    await queryRunner.query(`
      WITH candidates AS (
        SELECT id, alias,
          left(
            'Servicio — ' || initcap(
              btrim(regexp_replace(
                replace(substring(alias FROM char_length('Servicio — ') + 1), '_', ' '),
                '\\s+', ' ', 'g'
              ))
            ),
            120
          ) AS readable
        FROM contracts
        WHERE alias LIKE 'Servicio — %'
      ),
      changed AS (
        SELECT id, alias, readable FROM candidates WHERE readable <> alias
      ),
      backup AS (
        INSERT INTO crm_contract_alias_backup_168 (contract_id, alias)
        SELECT id, alias FROM changed
      )
      UPDATE contracts c
      SET alias = changed.readable, updated_at = now()
      FROM changed
      WHERE c.id = changed.id
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE contracts c
      SET alias = b.alias, updated_at = now()
      FROM crm_contract_alias_backup_168 b
      WHERE c.id = b.contract_id
    `);
    await queryRunner.query('DROP TABLE IF EXISTS crm_contract_alias_backup_168');
  }
}
