import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * NO REVERTIR EL TIMESTAMP DE ESTA CLASE (renumerada 2026-07-19).
 *
 * Esta migracion nacio con el sufijo `1700000000012`, MENOR que el de las
 * migraciones 001-011 (`1741766400000`..`1746164800000`).
 * TypeORM ordena la cadena por el timestamp del NOMBRE DE CLASE, no por el del
 * fichero ni por el prefijo numerico del nombre de archivo. Sobre una base
 * limpia las 012-016 corrian ANTES de `CreatePublicSchema1741766400000` y
 * `pnpm --filter @iwana/db migration:run` fallaba con
 * `relation "public.platform_audit_logs" does not exist`.
 *
 * En `dbiw` no se notaba porque 001-011 ya estaban aplicadas: el defecto
 * solo aparece en CI limpio, en el bootstrap de staging/prod y en cualquier
 * entorno nuevo — es decir, justo en el camino documentado.
 *
 * El sufijo actual (`17844192xx000`, 2026-07-19) es DELIBERADO y debe
 * quedar por encima del maximo de la cadena previa. Bajarlo reintroduce el fallo.
 * Las cinco migraciones renumeradas son idempotentes, condicion necesaria para
 * renumerar: las bases que ya las tenian registradas con el nombre viejo las
 * vuelven a ejecutar como si fueran nuevas.
 *
 * La cadena tenant no sufre esto: `tenant/runner.ts` usa un array ordenado
 * explicito en vez de delegar el orden en el timestamp.
 */

/**
 * Migración 012: redacta contraseñas temporales filtradas en el audit de plataforma.
 *
 * `AuditInterceptor` persiste la respuesta de cada operación CUD. Su saneado era
 * una denylist literal aplicada solo al primer nivel y no incluía
 * `temporaryPassword`; como los endpoints de credenciales devuelven la
 * contraseña dentro de `{data:{…}}`, el secreto acabó en claro en el registro.
 * Corregido en el commit `06395a8c` (saneado recursivo con predicado + test
 * mecánico) y reforzado con `@SkipAudit()` en los dos endpoints implicados.
 *
 * Esta migración se ocupa de lo ya escrito. **Redacta en vez de borrar**: la
 * fila conserva quién hizo qué y cuándo —que es la razón de ser del registro—
 * y solo se destruye el valor del secreto. Borrar la fila entera perdería
 * trazabilidad para proteger un dato que ya dejó de servir.
 *
 * Se filtra por la clave `temporaryPassword` en lugar de enumerar identificadores:
 * es preciso (esa clave solo transporta el secreto), idempotente, y cubre
 * cualquier fila que se hubiera escrito entre el diagnóstico y la ejecución.
 *
 * Nota de contexto (2026-07-19): el rastreo de exposición no encontró
 * credenciales vivas comprometidas — las filas del 2026-07-10 apuntaban a un
 * usuario que ya completó su primer ingreso y la del 2026-07-19 a un tenant de
 * prueba ya eliminado. La redacción es higiene del registro, no contención de
 * un incidente activo.
 *
 * ⚠️ Hallazgo relacionado, deliberadamente fuera de esta migración: pese a lo
 * que afirman los comentarios de `001_create_public_schema.ts`,
 * `platform_audit_logs` **no es append-only**. La política `pal_insert_only` es
 * `RESTRICTIVE ... USING (TRUE)`, que no restringe nada; el `REVOKE` que el
 * comentario anuncia no existe como sentencia; y RLS está `ENABLE` pero no
 * `FORCE`, con la aplicación conectando como dueña de la tabla. Que esta
 * migración pueda ejecutar un UPDATE es consecuencia de ese hueco. Implementar
 * la inmutabilidad prometida —o retirar la promesa— es una decisión aparte.
 */
export class RedactLeakedTemporaryPasswords1784419201000 implements MigrationInterface {
  name = 'RedactLeakedTemporaryPasswords1784419201000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE public.platform_audit_logs
      SET new_value = jsonb_set(new_value, '{temporaryPassword}', '"[REDACTADO]"'::jsonb)
      WHERE new_value ? 'temporaryPassword'
        AND new_value->>'temporaryPassword' <> '[REDACTADO]'
    `);

    // El envoltorio `{data:{…}}` es la forma real de las respuestas del API; la
    // clave suelta de arriba cubre las filas que se guardaron ya desenvueltas.
    await queryRunner.query(`
      UPDATE public.platform_audit_logs
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
    // Sin reversión posible ni deseable: el valor original era un secreto y su
    // destrucción es el objetivo de la migración, no un efecto colateral.
    // No lanza para no bloquear el revert de la cadena — revertir esta
    // migración es, correctamente, una operación sin efecto.
  }
}
