/**
 * Predicado de PII y redactor recursivo compartidos por la redacción de audit
 * en schema public (017) y en cada schema tenant (078).
 *
 * Vive en un módulo único a propósito: las migraciones 016/077 copiaron a mano
 * la denylist del `AuditInterceptor` y heredaron su defecto —el patrón de
 * sufijos solo cubría `email` y `encrypted`—, de modo que el barrido de PII
 * arrastró exactamente el mismo hueco que pretendía cerrar. Con una sola
 * definición, public y tenant no pueden divergir entre sí.
 *
 * **Espejo de `AuditInterceptor` (`apps/api/src/modules/audit/audit.interceptor.ts`).**
 * Si cambia el predicado allí, cambiarlo aquí. No es lo ideal —son dos
 * lenguajes— pero el interceptor protege lo que entra y esto lo ya escrito.
 */

/** Nombre de la función de predicado; versionado para no chocar con 016/077. */
export const PII_PREDICATE_FN = 'public.iwana_is_pii_audit_key_v2';

/** Nombre del redactor recursivo. */
export const PII_REDACT_FN = 'public.iwana_redact_audit_jsonb_v2';

/**
 * Claves que **nunca** se redactan, aunque otro patrón las empareje.
 *
 * - `actorName` — es el *sujeto* del asiento, no PII de un titular de datos.
 *   Un audit log existe para registrar quién hizo qué, y la identidad del
 *   operador en ejercicio profesional es el registro mismo. Redactarlo no
 *   aportaría privacidad: `user_id` se guarda en su propia columna, así que la
 *   persona sigue identificada. Y sí destruiría información:
 *   `apps/api/src/modules/crm/expedientes/expediente.service.ts` lo lee de
 *   vuelta para pintar el actor en el timeline del expediente.
 * - `piiaAccess` — su valor es el *nombre* del campo accedido (p. ej.
 *   `'documentNumber'`), nunca su contenido. El mismo servicio lo lee para
 *   distinguir un acceso a PII de una edición de sección. Redactarlo rompería
 *   ese filtro sin proteger ningún dato.
 *
 * Es la frontera de la política: se protege la PII de los **titulares de
 * datos**, no la identidad de quien opera el sistema ni los nombres de campo.
 */
export const NEVER_REDACTED_KEYS = ['actorname', 'piiaaccess'] as const;

/**
 * Crea el predicado de PII.
 *
 * La clave se normaliza a snake_case ANTES de aplicar los sufijos, de modo que
 * el sufijo tenga un límite de token real. Sin esa normalización:
 * - `unit` emparejaría `nit$`
 * - `fileName`, `schemaName`, `categoryName` emparejarían `name$`
 *
 * Por eso los nombres solo se redactan **cualificados por persona**
 * (`purchasingContactName`, `technicianName`, …) y nunca por `name` a secas.
 * Un `name$` ciego habría vaciado `schemaName` en `platform_audit_logs`, que es
 * lo que permite trazar qué tenant se aprovisionó, y `categoryName` en tenant.
 */
export const CREATE_PII_PREDICATE_SQL = `
  CREATE OR REPLACE FUNCTION ${PII_PREDICATE_FN}(key text)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  AS $pred$
    WITH norm AS (
      SELECT lower(
        regexp_replace(
          regexp_replace(key, '([a-z0-9])([A-Z])', '\\1_\\2', 'g'),
          '([A-Z]+)([A-Z][a-z])', '\\1_\\2', 'g'
        )
      ) AS k
    )
    SELECT
      -- Exclusiones explícitas: ganan sobre cualquier otro criterio.
      lower(key) NOT IN (${NEVER_REDACTED_KEYS.map((k) => `'${k}'`).join(', ')})
      -- Direcciones tecnicas: identifican una maquina, no un domicilio.
      AND (SELECT k FROM norm) !~ '(^|_)(ip|mac|remote)_address$'
      AND (
        (SELECT k FROM norm) ~ '(^|_)(email|encrypted|phone|document_number|nit|address|(contact|person|customer|holder|owner|subscriber|responsible|technician|uploaded_by|directed_to)_name)$'
        OR lower(key) IN (
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
          'temporarypassword', 'ciphertext',
          'customerdisplayname', 'customer_display_name',
          'expedientefullname', 'expediente_full_name',
          'fiscalname', 'fiscal_name',
          'suggestedpartyname', 'suggested_party_name'
        )
        OR key ~* '(password|secret|token|credential|apikey|api.?key|private.?key|authorization|otp|qr|seed|recovery|backup|ciphertext)'
      )
  $pred$
`;

/**
 * Crea el redactor recursivo. Solo sustituye valores **string**: un número o un
 * booleano bajo una clave PII no transporta el dato y vaciarlo perdería forma.
 * Idempotente por construcción — reescribir un `[REDACTADO]` lo deja igual.
 */
export const CREATE_PII_REDACTOR_SQL = `
  CREATE OR REPLACE FUNCTION ${PII_REDACT_FN}(data jsonb)
  RETURNS jsonb
  LANGUAGE plpgsql
  IMMUTABLE
  AS $redact$
  DECLARE
    result jsonb := '{}'::jsonb;
    arr jsonb := '[]'::jsonb;
    k text;
    v jsonb;
    i int;
    scalar_value text;
  BEGIN
    IF data IS NULL THEN
      RETURN NULL;
    END IF;

    IF jsonb_typeof(data) = 'array' THEN
      IF jsonb_array_length(data) IS NULL OR jsonb_array_length(data) = 0 THEN
        RETURN arr;
      END IF;
      FOR i IN 0 .. jsonb_array_length(data) - 1 LOOP
        arr := arr || jsonb_build_array(${PII_REDACT_FN}(data -> i));
      END LOOP;
      RETURN arr;
    END IF;

    IF jsonb_typeof(data) <> 'object' THEN
      RETURN data;
    END IF;

    FOR k, v IN SELECT * FROM jsonb_each(data) LOOP
      IF jsonb_typeof(v) = 'string' AND ${PII_PREDICATE_FN}(k) THEN
        scalar_value := v #>> '{}';
        IF scalar_value IS DISTINCT FROM '[REDACTADO]' THEN
          result := result || jsonb_build_object(k, to_jsonb('[REDACTADO]'::text));
        ELSE
          result := result || jsonb_build_object(k, v);
        END IF;
      ELSIF jsonb_typeof(v) IN ('object', 'array') THEN
        result := result || jsonb_build_object(k, ${PII_REDACT_FN}(v));
      ELSE
        result := result || jsonb_build_object(k, v);
      END IF;
    END LOOP;

    RETURN result;
  END;
  $redact$
`;

/** Limpieza: las funciones son andamiaje de la migración, no API estable. */
export const DROP_PII_FUNCTIONS_SQL = [
  `DROP FUNCTION IF EXISTS ${PII_REDACT_FN}(jsonb)`,
  `DROP FUNCTION IF EXISTS ${PII_PREDICATE_FN}(text)`,
];

/**
 * UPDATE idempotente sobre una columna jsonb de audit.
 * La guarda `IS DISTINCT FROM redact(...)` hace que reejecutar no toque filas.
 */
export function redactColumnSql(table: string, column: string): string {
  return `
    UPDATE ${table}
    SET ${column} = ${PII_REDACT_FN}(${column})
    WHERE ${column} IS NOT NULL
      AND ${column} IS DISTINCT FROM ${PII_REDACT_FN}(${column})
  `;
}
