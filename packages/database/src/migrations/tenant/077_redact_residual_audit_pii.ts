import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 077: redacta PII/secretos residuales en `<schema>.audit_logs`.
 *
 * Contraparte tenant de la pública 016. Mismo predicado que la denylist del
 * `AuditInterceptor` (`ALWAYS_OMITTED_KEYS` + sufijos `*Email`/`*Encrypted` +
 * patrón de secretos), más `fullName`/`ciphertext` vistos en el inventario lab.
 *
 * **Redacta, no borra.** Idempotente. Escotilla 075/014:
 * `SET LOCAL iwana.audit_maintenance = 'on'` en la misma transacción.
 *
 * Inventario lab (2026-07-19, `tenant_iwana`, sin PII): **14** filas con
 * valores string sensibles en `new_value` (Expedientes, Purchasing, Users,
 * TenantProfile, ExpedienteRecord) y **1** en `old_value` (TenantProfile).
 * Un barrido por regex de texto (~55) inflaba el conteo con nombres de campo
 * en `changedFields` de ExpedienteRecord, sin valores PII.
 */
export class RedactResidualAuditPii0770000000000 implements MigrationInterface {
  name = 'RedactResidualAuditPii0770000000000';

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
      UPDATE audit_logs
      SET new_value = public.iwana_redact_sensitive_audit_jsonb(new_value)
      WHERE new_value IS NOT NULL
        AND new_value IS DISTINCT FROM public.iwana_redact_sensitive_audit_jsonb(new_value)
    `);

    await queryRunner.query(`
      UPDATE audit_logs
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
    // El valor original era PII/secreto: destruirlo es el objetivo.
    // No lanza para no bloquear el revert de la cadena.
  }
}
