import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 074: redacta contraseñas temporales filtradas en el audit del tenant.
 *
 * Contraparte de la migración pública 012. El mismo defecto del saneado de
 * `AuditInterceptor` escribió `temporaryPassword` en claro también en
 * `<schema>.audit_logs`, no solo en `public.platform_audit_logs`: el barrido
 * inicial solo miró la tabla de plataforma y se quedó corto.
 *
 * Al correr por schema, esta migración cubre todos los tenants existentes y
 * queda como no-op para los futuros —que ya nacen con el saneado corregido—.
 *
 * Se **redacta**, no se borra: la fila conserva quién hizo qué y cuándo, que es
 * la razón de ser del registro, y solo se destruye el valor del secreto.
 *
 * Se filtra por la clave en vez de enumerar identificadores porque los ids
 * difieren en cada tenant y una migración por schema no puede llevarlos
 * escritos. El filtro es preciso —esa clave solo transporta el secreto— e
 * idempotente.
 */
export class RedactLeakedTemporaryPasswords0740000000000 implements MigrationInterface {
  name = 'RedactLeakedTemporaryPasswords0740000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE audit_logs
      SET new_value = jsonb_set(new_value, '{temporaryPassword}', '"[REDACTADO]"'::jsonb)
      WHERE new_value ? 'temporaryPassword'
        AND new_value->>'temporaryPassword' <> '[REDACTADO]'
    `);

    await queryRunner.query(`
      UPDATE audit_logs
      SET new_value = jsonb_set(
        new_value,
        '{data,temporaryPassword}',
        '"[REDACTADO]"'::jsonb
      )
      WHERE new_value->'data' ? 'temporaryPassword'
        AND new_value->'data'->>'temporaryPassword' <> '[REDACTADO]'
    `);
  }

  public async down(): Promise<void> {
    // El valor original era un secreto: destruirlo es el objetivo, no un efecto
    // colateral. Revertir esta migración es correctamente una operación sin
    // efecto, y no lanza para no bloquear el revert de la cadena.
  }
}
