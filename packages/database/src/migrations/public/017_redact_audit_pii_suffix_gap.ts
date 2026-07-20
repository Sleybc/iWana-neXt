import { MigrationInterface, QueryRunner } from 'typeorm';

import {
  CREATE_PII_PREDICATE_SQL,
  CREATE_PII_REDACTOR_SQL,
  DROP_PII_FUNCTIONS_SQL,
  redactColumnSql,
} from '../shared/audit-pii-redaction.sql';

/**
 * Migración 017: cierra el hueco de sufijos PII en `public.platform_audit_logs`.
 *
 * La 016 ya hizo un barrido, pero copió el predicado del `AuditInterceptor`
 * **incluido su defecto**: el patrón de sufijos era `(email|encrypted)$` y nada
 * más. No había `phone$`, `address$`, `document_number$` ni ningún sufijo de
 * nombre. La consecuencia, medida sobre datos reales, era una asimetría dentro
 * del mismo DTO:
 *
 *     OMITIDO  purchasingContactEmail
 *     FILTRA   purchasingContactPhone   <- con forma de telefono
 *
 * Esta migración reejecuta el barrido con el predicado corregido
 * (`../shared/audit-pii-redaction.sql`, el mismo que usa la tenant 078).
 *
 * ### Lo que deliberadamente NO redacta
 *
 * - `actorName` — sujeto del asiento, no PII de un titular. `user_id` ya
 *   identifica a la persona en su propia columna, así que redactarlo no aporta
 *   privacidad; y el timeline del expediente lo lee de vuelta.
 * - `piiaAccess` — su valor es el *nombre* del campo accedido, no el dato.
 * - `schemaName`, `categoryName`, `fileName`, `productName`, `unit`… — un
 *   sufijo `name$` o `nit$` sin normalizar los habría vaciado. `schemaName` es
 *   lo que permite trazar qué tenant se aprovisionó: perderlo sería cambiar una
 *   fuga por un agujero de trazabilidad.
 *
 * El razonamiento completo está en el módulo compartido; aquí queda la nota
 * para quien audite esta migración dentro de un año y se pregunte por qué esas
 * claves sobrevivieron a un barrido de PII.
 *
 * **Redacta, no borra**: la fila conserva quién/qué/cuándo. Idempotente:
 * reejecutar no cambia filas ya redactadas.
 *
 * Escotilla 014: `SET LOCAL iwana.audit_maintenance = 'on'` en la misma
 * transacción para atravesar `reject_audit_mutation`.
 */
export class RedactAuditPiiSuffixGap1784419206000 implements MigrationInterface {
  name = 'RedactAuditPiiSuffixGap1784419206000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL iwana.audit_maintenance = 'on'`);

    await queryRunner.query(CREATE_PII_PREDICATE_SQL);
    await queryRunner.query(CREATE_PII_REDACTOR_SQL);

    await queryRunner.query(redactColumnSql('public.platform_audit_logs', 'new_value'));
    await queryRunner.query(redactColumnSql('public.platform_audit_logs', 'old_value'));

    for (const sql of DROP_PII_FUNCTIONS_SQL) {
      await queryRunner.query(sql);
    }
  }

  public async down(): Promise<void> {
    // Sin reversión posible ni deseable: el valor original era PII.
    // No lanza para no bloquear el revert de la cadena.
  }
}
