import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/** Roles asignables a un usuario creado desde UISP: `UserRole` sin SUBSCRIBER, PARTNER ni INVESTOR. */
const IMPORTABLE_ROLES_SQL =
  "'ADMIN','NOC','SUPPORT','SALES','TECHNICIAN','ACCOUNTANT','HR','CONTRACTOR','AUDITOR'";

/**
 * Migración 211 — usuarios del personal desde la API de UISP (ADR-110 v1.2 D15; spec
 * 2026-11-15 «importación UISP: usuarios», §2.1–§2.5 y §3).
 *
 * - `migration_source_connections`: una conexión por tenant y sistema de origen, con la
 *   dirección https, la clave de aplicación cifrada con la clave PII (AES-256-GCM, inventario
 *   K2) y la huella SHA-256 fijada del certificado. `id` existe para el recifrado K2, que
 *   recorre cada objetivo por su columna `id`.
 * - `migration_uisp_users`: una fila de revisión por número de usuario de UISP. Nombre y correo
 *   van cifrados (+ HMAC del correo para la coincidencia) solo mientras la fila está
 *   `PENDIENTE`; al enlazar, crear o descartar se purgan (CHECK). Una fila `SIN_DATOS` (número
 *   visto en un lote y no en la API) nunca lleva PII. `proposed_role` excluye SUBSCRIBER,
 *   PARTNER e INVESTOR.
 * - `migration_mappings`: `chk_migration_mappings_kind` admite `USUARIO` (manteniendo
 *   `TITULAR`); una equivalencia `USUARIO` lleva el número de UISP como valor y nunca etiqueta
 *   (sin PII). `chk_migration_mappings_action_kind` no cambia: `USUARIO` solo admite `EQUIVALE`.
 *
 * `down()` borra las dos tablas, las equivalencias `USUARIO` y los CHECK nuevos, y restaura el
 * CHECK de la 210. Si hay conexión, filas de revisión o equivalencias `USUARIO`, lo bloquea
 * salvo `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true`: no hay backfill que las reconstruya (la
 * clave de UISP habría que volver a pedirla y los usuarios de iWana creados no se tocan).
 */
export class MigrationUispUsers2110000000211 implements MigrationInterface {
  name = 'MigrationUispUsers2110000000211';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS migration_source_connections (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        source_system varchar(16) NOT NULL,
        base_url varchar(500) NOT NULL,
        app_key_encrypted text NOT NULL,
        trusted_certificate_sha256 char(64) NULL,
        last_checked_at timestamptz NULL,
        last_check_result varchar(16) NULL,
        created_by uuid NOT NULL,
        updated_by uuid NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_migration_source_connections_source_system
          CHECK (source_system IN ('UISP')),
        CONSTRAINT chk_migration_source_connections_base_url
          CHECK (base_url ~ '^https://[^/@[:space:]]+(/[^@[:space:]]*)?$'),
        CONSTRAINT chk_migration_source_connections_app_key
          CHECK (length(app_key_encrypted) > 0),
        CONSTRAINT chk_migration_source_connections_certificate
          CHECK (trusted_certificate_sha256 IS NULL OR trusted_certificate_sha256 ~ '^[0-9a-f]{64}$'),
        CONSTRAINT chk_migration_source_connections_check_result
          CHECK (last_check_result IS NULL
                 OR last_check_result IN ('OK','UNREACHABLE','UNAUTHORIZED')),
        CONSTRAINT chk_migration_source_connections_check_pair
          CHECK ((last_check_result IS NULL) = (last_checked_at IS NULL)),
        CONSTRAINT uq_migration_source_connections_tenant_source
          UNIQUE (tenant_id, source_system)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS migration_uisp_users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        uisp_user_id integer NOT NULL,
        display_name_encrypted text NULL,
        email_encrypted text NULL,
        email_hash varchar(64) NULL,
        is_active_in_uisp boolean NULL,
        source varchar(12) NOT NULL,
        status varchar(12) NOT NULL DEFAULT 'PENDIENTE',
        matched_user_id uuid NULL,
        target_user_id uuid NULL,
        proposed_role varchar(20) NULL,
        last_fetched_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_migration_uisp_users_uisp_user_id CHECK (uisp_user_id > 0),
        CONSTRAINT chk_migration_uisp_users_source CHECK (source IN ('API','SIN_DATOS')),
        CONSTRAINT chk_migration_uisp_users_status
          CHECK (status IN ('PENDIENTE','ENLAZADO','CREADO','DESCARTADO')),
        CONSTRAINT chk_migration_uisp_users_ciphertext
          CHECK ((display_name_encrypted IS NULL OR length(display_name_encrypted) > 0)
                 AND (email_encrypted IS NULL OR length(email_encrypted) > 0)),
        CONSTRAINT chk_migration_uisp_users_email_hash
          CHECK ((email_encrypted IS NULL) = (email_hash IS NULL)
                 AND (email_hash IS NULL OR email_hash ~ '^[0-9a-f]{64}$')),
        CONSTRAINT chk_migration_uisp_users_pii_purged
          CHECK (status = 'PENDIENTE'
                 OR (display_name_encrypted IS NULL AND email_encrypted IS NULL
                     AND email_hash IS NULL)),
        CONSTRAINT chk_migration_uisp_users_sin_datos
          CHECK (source <> 'SIN_DATOS'
                 OR (display_name_encrypted IS NULL AND email_encrypted IS NULL
                     AND email_hash IS NULL AND is_active_in_uisp IS NULL)),
        CONSTRAINT chk_migration_uisp_users_target
          CHECK ((status IN ('ENLAZADO','CREADO')) = (target_user_id IS NOT NULL)),
        CONSTRAINT chk_migration_uisp_users_proposed_role
          CHECK (proposed_role IS NULL OR proposed_role IN (${IMPORTABLE_ROLES_SQL})),
        CONSTRAINT uq_migration_uisp_users_tenant_uisp_user
          UNIQUE (tenant_id, uisp_user_id)
      )
    `);

    await queryRunner.query(`
      ALTER TABLE migration_mappings
        DROP CONSTRAINT IF EXISTS chk_migration_mappings_kind,
        ADD CONSTRAINT chk_migration_mappings_kind
          CHECK (kind IN ('PLAN','METODO_PAGO','CICLO','ETIQUETA','TITULAR','USUARIO')),
        DROP CONSTRAINT IF EXISTS chk_migration_mappings_usuario,
        ADD CONSTRAINT chk_migration_mappings_usuario
          CHECK (kind <> 'USUARIO'
                 OR (external_label IS NULL AND external_value ~ '^[1-9][0-9]{0,9}$'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
      const [row] = (await queryRunner.query(`
        SELECT
          (CASE WHEN to_regclass('migration_source_connections') IS NULL THEN 0
                ELSE (SELECT COUNT(*) FROM migration_source_connections) END)::int
          + (CASE WHEN to_regclass('migration_uisp_users') IS NULL THEN 0
                  ELSE (SELECT COUNT(*) FROM migration_uisp_users) END)::int
          + (SELECT COUNT(*) FROM migration_mappings WHERE kind = 'USUARIO')::int AS total
      `)) as Array<{ total: number }>;
      if ((row?.total ?? 0) > 0) {
        throw new Error(
          `Migración 211 down bloqueada: hay ${row?.total} conexión(es), fila(s) de usuarios de ` +
            `UISP o equivalencia(s) USUARIO. Para una reversión destructiva, exporte ` +
            `${DESTRUCTIVE_DOWN_ENV_VAR}=true.`,
        );
      }
    }
    await queryRunner.query(`DELETE FROM migration_mappings WHERE kind = 'USUARIO'`);
    await queryRunner.query(`
      ALTER TABLE migration_mappings
        DROP CONSTRAINT IF EXISTS chk_migration_mappings_usuario,
        DROP CONSTRAINT IF EXISTS chk_migration_mappings_kind,
        ADD CONSTRAINT chk_migration_mappings_kind
          CHECK (kind IN ('PLAN','METODO_PAGO','CICLO','ETIQUETA','TITULAR'))
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS migration_uisp_users`);
    await queryRunner.query(`DROP TABLE IF EXISTS migration_source_connections`);
  }
}
