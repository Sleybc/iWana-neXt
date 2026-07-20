import { MigrationInterface, QueryRunner } from 'typeorm';

import {
  CREATE_PII_PREDICATE_SQL,
  CREATE_PII_REDACTOR_SQL,
  DROP_PII_FUNCTIONS_SQL,
  redactColumnSql,
} from '../shared/audit-pii-redaction.sql';

/**
 * Migración 078: cierra el hueco de sufijos PII en `<schema>.audit_logs`.
 *
 * Contraparte tenant de la pública 017, con el mismo predicado (módulo
 * compartido `../shared/audit-pii-redaction.sql`) para que public y tenant no
 * puedan divergir — que es justo lo que pasó con la 016/077: ambas copiaron a
 * mano la denylist del `AuditInterceptor` y heredaron su hueco de sufijos.
 *
 * Evidencia sobre `tenant_iwana` (498 filas, inventario sin exponer valores):
 *
 *     purchasingContactPhone   3 apariciones, con forma de telefono
 *     altContactName           5
 *     purchasingContactName    3
 *
 * frente a `purchasingContactEmail`, que la 077 sí había redactado. Misma
 * entidad, mismo DTO, distinto trato.
 *
 * ### Lo que deliberadamente NO redacta
 *
 * - `actorName` — sujeto del asiento, no PII de un titular de datos. `user_id`
 *   ya identifica a la persona; redactarlo no aporta privacidad y sí rompe el
 *   timeline del expediente, que lo lee de vuelta
 *   (`expediente.service.ts`, resolución del actor).
 * - `piiaAccess` — su valor es el *nombre* del campo accedido
 *   (p. ej. `'documentNumber'`), no su contenido; `expediente.service.ts` lo
 *   lee para distinguir un acceso PII de una edición de sección.
 * - `categoryName` y compañía — el sufijo `name` a secas no redacta nada: los
 *   nombres solo caen cualificados por persona.
 *
 * **Redacta, no borra.** Idempotente. Escotilla 075/014:
 * `SET LOCAL iwana.audit_maintenance = 'on'` en la misma transacción.
 *
 * La tabla va sin calificar: el runner fija `search_path` al schema del tenant.
 */
export class RedactAuditPiiSuffixGap0780000000000 implements MigrationInterface {
  name = 'RedactAuditPiiSuffixGap0780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL iwana.audit_maintenance = 'on'`);

    await queryRunner.query(CREATE_PII_PREDICATE_SQL);
    await queryRunner.query(CREATE_PII_REDACTOR_SQL);

    await queryRunner.query(redactColumnSql('audit_logs', 'new_value'));
    await queryRunner.query(redactColumnSql('audit_logs', 'old_value'));

    // Andamiaje, no API estable. Las funciones viven en `public` y las
    // comparten todos los schemas; eliminarlas aquí es seguro porque el runner
    // tenant serializa las cadenas con un advisory lock, así que no hay dos
    // aplicándose a la vez.
    for (const sql of DROP_PII_FUNCTIONS_SQL) {
      await queryRunner.query(sql);
    }
  }

  public async down(): Promise<void> {
    // Sin reversión posible ni deseable: el valor original era PII.
    // No lanza para no bloquear el revert de la cadena.
  }
}
