import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * NO REVERTIR EL TIMESTAMP DE ESTA CLASE (renumerada 2026-07-19).
 *
 * Esta migracion nacio con el sufijo `1700000000016`, MENOR que el de las
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
 * Migración 016: redacta PII/secretos residuales en `public.platform_audit_logs`.
 *
 * Tras ampliar la denylist del `AuditInterceptor` (SEC-05 / SWEEP), quedaron
 * filas históricas con claves sensibles en `new_value` (y eventualmente
 * `old_value`). Contraparte de la 012 (solo `temporaryPassword`): aquí se
 * cubre el predicado alineado a `ALWAYS_OMITTED_KEYS` + sufijos `*Email` /
 * `*Encrypted` + patrón de secretos, de forma recursiva.
 *
 * **Redacta, no borra**: la fila conserva quién/qué/cuándo; el valor pasa a
 * `"[REDACTADO]"`. Idempotente: re-ejecutar no cambia filas ya redactadas.
 *
 * Escotilla 014: `SET LOCAL iwana.audit_maintenance = 'on'` en la misma
 * transacción para atravesar `reject_audit_mutation`.
 *
 * Inventario lab (2026-07-19, sin PII): **8** filas en `platform_audit_logs`
 * con valores string sensibles residuales (Users UPDATE ×4, Tenant CREATE ×2–3,
 * PlatformUsers UPDATE ×1). Un conteo ~53 por regex de texto era falso positivo
 * (p. ej. nombres de campo en `changedFields` de otras tablas).
 */
export class RedactResidualAuditPii1784419205000 implements MigrationInterface {
  name = 'RedactResidualAuditPii1784419205000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL iwana.audit_maintenance = 'on'`);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.iwana_is_sensitive_audit_key(key text)
      RETURNS boolean
      LANGUAGE sql
      IMMUTABLE
      AS $fn$
        SELECT
          lower(key) IN (
            'email', 'value', 'whatsapp', 'nit', 'nitdv', 'nit_dv', 'fullname',
            'businessname', 'business_name', 'razonsocial', 'razon_social',
            'firstname', 'first_name', 'lastname', 'last_name',
            'displayname', 'display_name', 'legalname', 'legal_name',
            'address', 'birthdate', 'birth_date',
            'contactphone', 'contact_phone', 'contactname', 'contact_name',
            'altcontactphone', 'alt_contact_phone',
            'adminemail', 'admin_email', 'contactemail', 'contact_email',
            'emailprimary', 'email_primary', 'emailsecondary', 'email_secondary',
            'documentnumber', 'document_number', 'nationalid', 'national_id',
            'identification', 'identificacion', 'cedula', 'cédula',
            'phone', 'mobile', 'telefono', 'teléfono', 'celular',
            'phonenumber', 'phone_number', 'mobilenumber', 'mobile_number',
            'sitecontactphone', 'site_contact_phone',
            'phoneprimary', 'phone_primary', 'phonesecondary', 'phone_secondary',
            'temporarypassword', 'ciphertext'
          )
          OR lower(key) ~ '(email|encrypted)$'
          OR key ~* '(password|secret|token|credential|apikey|api.?key|private.?key|authorization|otp|qr|seed|recovery|backup|ciphertext)'
      $fn$
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.iwana_redact_sensitive_audit_jsonb(data jsonb)
      RETURNS jsonb
      LANGUAGE plpgsql
      IMMUTABLE
      AS $fn$
      DECLARE
        result jsonb := '{}'::jsonb;
        arr jsonb := '[]'::jsonb;
        k text;
        v jsonb;
        i int;
        scalar text;
      BEGIN
        IF data IS NULL THEN
          RETURN NULL;
        END IF;

        IF jsonb_typeof(data) = 'array' THEN
          IF jsonb_array_length(data) IS NULL OR jsonb_array_length(data) = 0 THEN
            RETURN arr;
          END IF;
          FOR i IN 0 .. jsonb_array_length(data) - 1 LOOP
            arr := arr || jsonb_build_array(
              public.iwana_redact_sensitive_audit_jsonb(data -> i)
            );
          END LOOP;
          RETURN arr;
        END IF;

        IF jsonb_typeof(data) <> 'object' THEN
          RETURN data;
        END IF;

        FOR k, v IN SELECT * FROM jsonb_each(data) LOOP
          IF jsonb_typeof(v) = 'string' AND public.iwana_is_sensitive_audit_key(k) THEN
            scalar := v #>> '{}';
            IF scalar IS DISTINCT FROM '[REDACTADO]' THEN
              result := result || jsonb_build_object(k, to_jsonb('[REDACTADO]'::text));
            ELSE
              result := result || jsonb_build_object(k, v);
            END IF;
          ELSIF jsonb_typeof(v) IN ('object', 'array') THEN
            result := result || jsonb_build_object(
              k,
              public.iwana_redact_sensitive_audit_jsonb(v)
            );
          ELSE
            result := result || jsonb_build_object(k, v);
          END IF;
        END LOOP;

        RETURN result;
      END;
      $fn$
    `);

    await queryRunner.query(`
      UPDATE public.platform_audit_logs
      SET new_value = public.iwana_redact_sensitive_audit_jsonb(new_value)
      WHERE new_value IS NOT NULL
        AND new_value IS DISTINCT FROM public.iwana_redact_sensitive_audit_jsonb(new_value)
    `);

    await queryRunner.query(`
      UPDATE public.platform_audit_logs
      SET old_value = public.iwana_redact_sensitive_audit_jsonb(old_value)
      WHERE old_value IS NOT NULL
        AND old_value IS DISTINCT FROM public.iwana_redact_sensitive_audit_jsonb(old_value)
    `);

    await queryRunner.query(
      `DROP FUNCTION IF EXISTS public.iwana_redact_sensitive_audit_jsonb(jsonb)`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS public.iwana_is_sensitive_audit_key(text)`);
  }

  public async down(): Promise<void> {
    // Sin reversión posible ni deseable: el valor original era PII/secreto.
    // No lanza para no bloquear el revert de la cadena.
  }
}
