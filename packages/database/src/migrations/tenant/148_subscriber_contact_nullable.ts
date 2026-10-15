import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 148 — permite suscriptores y contactos sin datos de contacto pendientes.
 * No modifica ni rellena datos existentes; el backfill se ejecuta por tenant aparte.
 */
export class SubscriberContactNullable1480000000000 implements MigrationInterface {
  name = 'SubscriberContactNullable1480000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE subscribers
        ALTER COLUMN email_encrypted DROP NOT NULL,
        ALTER COLUMN phone_encrypted DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE party_contact
        ALTER COLUMN value DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(`
      SELECT
        (SELECT COUNT(*)::int FROM subscribers WHERE email_encrypted IS NULL) AS email_nulls,
        (SELECT COUNT(*)::int FROM subscribers WHERE phone_encrypted IS NULL) AS phone_nulls,
        (SELECT COUNT(*)::int FROM party_contact WHERE value IS NULL) AS party_contact_value_nulls
    `)) as Array<{
      email_nulls: number;
      phone_nulls: number;
      party_contact_value_nulls: number;
    }>;

    const counts = rows[0];
    const emailNulls = counts?.email_nulls ?? 0;
    const phoneNulls = counts?.phone_nulls ?? 0;
    const partyContactValueNulls = counts?.party_contact_value_nulls ?? 0;

    if (emailNulls > 0 || phoneNulls > 0 || partyContactValueNulls > 0) {
      throw new Error(
        'Migración 148: no se puede restaurar NOT NULL; hay filas con NULL en ' +
          `subscribers.email_encrypted (${emailNulls}), ` +
          `subscribers.phone_encrypted (${phoneNulls}) y ` +
          `party_contact.value (${partyContactValueNulls}). ` +
          'Completa los datos faltantes antes de revertir.',
      );
    }

    await queryRunner.query(`
      ALTER TABLE subscribers
        ALTER COLUMN email_encrypted SET NOT NULL,
        ALTER COLUMN phone_encrypted SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE party_contact
        ALTER COLUMN value SET NOT NULL
    `);
  }
}
