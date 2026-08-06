import { MigrationInterface, QueryRunner } from 'typeorm';

import {
  CREATE_PII_PREDICATE_SQL,
  CREATE_PII_REDACTOR_SQL,
  DROP_PII_FUNCTIONS_SQL,
  redactColumnSql,
} from '../shared/audit-pii-redaction.sql';

/**
 * Migración 110 (SEC-P1 / E6): redacción retroactiva de PII residual en audit_logs.
 *
 * Cierra el hueco de `latitude`/`longitude`/`description`/`title`/`sector`/
 * `municipality` (y el predicado ampliado del shared SQL) sobre filas ya
 * escritas. Replica el patrón 077/078 con escotilla:
 * `SET LOCAL iwana.audit_maintenance = 'on'`.
 *
 * **Redacta, no borra.** Idempotente.
 * **down irreversible:** el valor original era PII — no se restaura.
 */
export class RedactAuditPiiCoordsAndFreeText1100000000000 implements MigrationInterface {
  name = 'RedactAuditPiiCoordsAndFreeText1100000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL iwana.audit_maintenance = 'on'`);

    await queryRunner.query(CREATE_PII_PREDICATE_SQL);
    await queryRunner.query(CREATE_PII_REDACTOR_SQL);

    await queryRunner.query(redactColumnSql('audit_logs', 'new_value'));
    await queryRunner.query(redactColumnSql('audit_logs', 'old_value'));

    for (const sql of DROP_PII_FUNCTIONS_SQL) {
      await queryRunner.query(sql);
    }
  }

  public async down(): Promise<void> {
    // Sin reversión posible ni deseable: el valor original era PII (coordenadas /
    // texto libre del domicilio). No lanza para no bloquear el revert de la cadena.
  }
}
