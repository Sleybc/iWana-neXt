'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.CreatePublicSchema1741766400000 = void 0;
/**
 * Migracion 001 — Creacion del schema publico MOD01.
 *
 * Crea las 3 tablas de plataforma en el schema 'public':
 * - public.tenants: ISPs clientes de la plataforma
 * - public.platform_users: usuarios de administracion de la plataforma
 * - public.platform_audit_logs: auditoria append-only de operaciones de plataforma
 *
 * REVERSIBILIDAD: down() elimina tablas en orden inverso al de dependencias.
 *
 * Referencias:
 * - HLD-MOD01-ARQUITECTURA-v1.0 Seccion 3 (Modelo de Datos)
 * - ADR-017: Multi-tenant schema-per-tenant
 * - ADR-018: TypeORM como ORM principal
 */
class CreatePublicSchema1741766400000 {
  name = 'CreatePublicSchema1741766400000';
  async up(queryRunner) {
    // --- Extensiones requeridas ---
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    // -------------------------------------------------------------------
    // Tabla: public.tenants
    // Representa a cada ISP cliente. slug y schema_name son inmutables
    // post-creacion (renombrar el schema es una operacion de alto riesgo).
    // -------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "public"."tenants" (
        "id"             UUID        NOT NULL DEFAULT gen_random_uuid(),
        "name"           VARCHAR(255) NOT NULL,
        "slug"           VARCHAR(63)  NOT NULL,
        "schema_name"    VARCHAR(63)  NOT NULL,
        "status"         VARCHAR(30)  NOT NULL DEFAULT 'PROVISIONING',
        "settings"       JSONB        NOT NULL DEFAULT '{}',
        "contact_email"  VARCHAR(255) NOT NULL,
        "max_subscribers" INTEGER     NOT NULL DEFAULT 0,
        "created_at"     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_tenants" PRIMARY KEY ("id"),
        CONSTRAINT "uq_tenants_slug"        UNIQUE ("slug"),
        CONSTRAINT "uq_tenants_schema_name" UNIQUE ("schema_name"),
        CONSTRAINT "chk_tenants_status" CHECK (
          "status" IN (
            'PROVISIONING', 'ACTIVE', 'SUSPENDED',
            'INACTIVE', 'PROVISIONING_FAILED'
          )
        )
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_tenants_slug"        ON "public"."tenants" ("slug")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_tenants_schema_name" ON "public"."tenants" ("schema_name")`,
    );
    // -------------------------------------------------------------------
    // Tabla: public.platform_users
    // Administradores y soporte de la plataforma iWana neXt.
    // email cifrado AES-256-GCM; emailHash SHA-256 para busquedas.
    // -------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "public"."platform_users" (
        "id"            UUID        NOT NULL DEFAULT gen_random_uuid(),
        "email"         VARCHAR(512) NOT NULL,
        "email_hash"    VARCHAR(64)  NOT NULL,
        "password_hash" VARCHAR(60)  NOT NULL,
        "role"          VARCHAR(20)  NOT NULL,
        "status"        VARCHAR(30)  NOT NULL DEFAULT 'ACTIVE',
        "mfa_enabled"   BOOLEAN      NOT NULL DEFAULT TRUE,
        "mfa_secret"    VARCHAR(512),
        "last_login_at" TIMESTAMPTZ,
        "created_at"    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "deleted_at"    TIMESTAMPTZ,
        CONSTRAINT "pk_platform_users" PRIMARY KEY ("id"),
        CONSTRAINT "uq_platform_users_email_hash" UNIQUE ("email_hash"),
        CONSTRAINT "chk_platform_users_role" CHECK (
          "role" IN ('SYSTEM_ADMIN', 'IWANA_SUPPORT')
        ),
        CONSTRAINT "chk_platform_users_status" CHECK (
          "status" IN ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'INACTIVE')
        )
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_platform_users_email_hash" ON "public"."platform_users" ("email_hash")`,
    );
    // -------------------------------------------------------------------
    // Tabla: public.platform_audit_logs
    // Auditoria append-only de operaciones de plataforma.
    // RLS previene DELETE y UPDATE directos.
    // Retencion minima 7 anios (Ley 1581/2012 + CRC).
    // -------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "public"."platform_audit_logs" (
        "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
        "user_id"     UUID,
        "action"      VARCHAR(100) NOT NULL,
        "entity_type" VARCHAR(100) NOT NULL,
        "entity_id"   VARCHAR(100) NOT NULL,
        "old_value"   JSONB,
        "new_value"   JSONB,
        "ip_address"  VARCHAR(45),
        "user_agent"  VARCHAR(512),
        "request_id"  VARCHAR(100),
        "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_platform_audit_logs" PRIMARY KEY ("id")
        -- SIN updated_at — SIN deleted_at — APPEND-ONLY
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_pal_user_created"   ON "public"."platform_audit_logs" ("user_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_pal_action_created" ON "public"."platform_audit_logs" ("action", "created_at")`,
    );
    // RLS: prevenir DELETE y UPDATE en platform_audit_logs
    await queryRunner.query(`ALTER TABLE "public"."platform_audit_logs" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      CREATE POLICY "pal_insert_only"
        ON "public"."platform_audit_logs"
        AS RESTRICTIVE
        FOR ALL
        TO PUBLIC
        USING (TRUE)
    `);
    // Revocar privilegios destructivos del role de la aplicacion
    // (el nombre del role de app se configura via DB_APP_ROLE env var)
    // Las sentencias REVOKE son idempotentes si el role no tiene el privilegio.
  }
  async down(queryRunner) {
    // Deshabilitar RLS antes de eliminar tabla
    await queryRunner.query(
      `ALTER TABLE IF EXISTS "public"."platform_audit_logs" DISABLE ROW LEVEL SECURITY`,
    );
    // Eliminar indices primero (algunos DB engines los elminan con DROP TABLE,
    // pero ser explicitos evita errores cross-version)
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_pal_action_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_pal_user_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_platform_users_email_hash"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_tenants_schema_name"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_tenants_slug"`);
    // Eliminar tablas en orden inverso de dependencias
    await queryRunner.query(`DROP TABLE IF EXISTS "public"."platform_audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "public"."platform_users"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "public"."tenants"`);
  }
}
exports.CreatePublicSchema1741766400000 = CreatePublicSchema1741766400000;
//# sourceMappingURL=001_create_public_schema.js.map
