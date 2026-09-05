import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 120 — Hotfix lockout plantillas V1 → V2
 *
 * Tenants que ya pasaron 119 y/o `listProfiles` pueden tener las 5 plantillas V1
 * (`Monitoreo operativo`, `Soporte inicial`, `Técnico de campo`, `Contratista`,
 * `Auditor`) inactivas con `user_access_profiles` aún activos. Los efectivos
 * filtran `AccessProfile.isActive = true`, así que esas asignaciones quedan en 0.
 *
 * Up: INSERT…SELECT set-based de asignaciones V1 activas → plantilla V2 del mismo
 * `baseRoleConstraint`; desactiva asignaciones V1 y las 5 filas V1 si esta
 * migración las encontró activas. Provenance para down exacto.
 * Down: elimina solo asignaciones V2 insertadas; restaura asignaciones V1 y
 * `is_active` de las plantillas V1 que esta migración desactivó.
 *
 * Idempotente. Schema: tenant (search_path).
 */
export class RemapMod00AccessV1ToV21200000000000 implements MigrationInterface {
  name = 'RemapMod00AccessV1ToV21200000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS access_v1_remap_120_v2_assignments (
        assignment_id UUID NOT NULL,
        user_id       UUID NOT NULL,
        profile_id    UUID NOT NULL,
        tenant_id     UUID NOT NULL,
        CONSTRAINT pk_access_v1_remap_120_v2_assignments PRIMARY KEY (assignment_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS access_v1_remap_120_v1_assignments (
        assignment_id      UUID NOT NULL,
        tenant_id          UUID NOT NULL,
        previous_valid_to DATE,
        CONSTRAINT pk_access_v1_remap_120_v1_assignments PRIMARY KEY (assignment_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS access_v1_remap_120_v1_profiles (
        profile_id UUID NOT NULL,
        tenant_id  UUID NOT NULL,
        CONSTRAINT pk_access_v1_remap_120_v1_profiles PRIMARY KEY (profile_id)
      )
    `);

    await queryRunner.query(`
      DO $migration$
      DECLARE
        tenant_schema       TEXT := current_schema();
        canonical_tenant_id UUID;
        tenant_count        INTEGER;
      BEGIN
        IF tenant_schema IS NULL OR tenant_schema !~ '^tenant_[a-z][a-z0-9_]{0,54}$' THEN
          RAISE EXCEPTION 'La migración 120 solo puede ejecutarse sobre un schema tenant válido; schema actual: %', tenant_schema;
        END IF;

        PERFORM set_config('search_path', quote_ident(tenant_schema), true);

        SELECT COUNT(*) INTO tenant_count FROM public.tenants WHERE schema_name = tenant_schema;
        IF tenant_count <> 1 THEN
          RAISE EXCEPTION 'Se esperaba exactamente un tenant canónico para el schema %, encontrados: %', tenant_schema, tenant_count;
        END IF;

        SELECT id INTO canonical_tenant_id FROM public.tenants WHERE schema_name = tenant_schema;

        -- Asignaciones V2 insertadas por este remap (RETURNING ignora ON CONFLICT)
        WITH inserted AS (
          INSERT INTO user_access_profiles (tenant_id, user_id, profile_id, valid_from, valid_to, is_active)
          SELECT uap.tenant_id, uap.user_id, v2.id, CURRENT_DATE, NULL, true
          FROM user_access_profiles uap
          INNER JOIN access_profiles v1
            ON v1.id = uap.profile_id
           AND v1.tenant_id = uap.tenant_id
           AND v1.is_system = true
           AND v1.deleted_at IS NULL
           AND v1.name IN (
             'Monitoreo operativo',
             'Soporte inicial',
             'Técnico de campo',
             'Contratista',
             'Auditor'
           )
          INNER JOIN access_profiles v2
            ON v2.tenant_id = uap.tenant_id
           AND v2.is_system = true
           AND v2.is_active = true
           AND v2.deleted_at IS NULL
           AND v2.name = CASE v1.name
             WHEN 'Monitoreo operativo' THEN 'Acceso estándar NOC'
             WHEN 'Soporte inicial' THEN 'Acceso estándar Soporte'
             WHEN 'Técnico de campo' THEN 'Acceso estándar Técnico'
             WHEN 'Contratista' THEN 'Acceso estándar Contratista'
             WHEN 'Auditor' THEN 'Acceso estándar Auditoría'
             ELSE NULL
           END
          WHERE uap.tenant_id = canonical_tenant_id
            AND uap.is_active = true
          ON CONFLICT (tenant_id, user_id, profile_id) WHERE is_active = true DO NOTHING
          RETURNING id, user_id, profile_id, tenant_id
        )
        INSERT INTO access_v1_remap_120_v2_assignments (assignment_id, user_id, profile_id, tenant_id)
        SELECT id, user_id, profile_id, tenant_id FROM inserted
        ON CONFLICT (assignment_id) DO NOTHING;

        -- Provenance de asignaciones V1 que vamos a desactivar (solo si hay V2 activa)
        INSERT INTO access_v1_remap_120_v1_assignments (assignment_id, tenant_id, previous_valid_to)
        SELECT uap.id, uap.tenant_id, uap.valid_to
        FROM user_access_profiles uap
        INNER JOIN access_profiles v1
          ON v1.id = uap.profile_id
         AND v1.tenant_id = uap.tenant_id
         AND v1.is_system = true
         AND v1.deleted_at IS NULL
         AND v1.name IN (
           'Monitoreo operativo',
           'Soporte inicial',
           'Técnico de campo',
           'Contratista',
           'Auditor'
         )
        INNER JOIN access_profiles v2
          ON v2.tenant_id = uap.tenant_id
         AND v2.is_system = true
         AND v2.is_active = true
         AND v2.deleted_at IS NULL
         AND v2.name = CASE v1.name
           WHEN 'Monitoreo operativo' THEN 'Acceso estándar NOC'
           WHEN 'Soporte inicial' THEN 'Acceso estándar Soporte'
           WHEN 'Técnico de campo' THEN 'Acceso estándar Técnico'
           WHEN 'Contratista' THEN 'Acceso estándar Contratista'
           WHEN 'Auditor' THEN 'Acceso estándar Auditoría'
           ELSE NULL
         END
        WHERE uap.tenant_id = canonical_tenant_id
          AND uap.is_active = true
        ON CONFLICT (assignment_id) DO NOTHING;

        UPDATE user_access_profiles uap
           SET is_active = false,
               valid_to = COALESCE(uap.valid_to, CURRENT_DATE)
          FROM access_v1_remap_120_v1_assignments p
         WHERE uap.id = p.assignment_id
           AND uap.tenant_id = canonical_tenant_id
           AND uap.is_active = true;

        -- Solo las 5 filas V1 activas cuya V2 canónica también está activa
        INSERT INTO access_v1_remap_120_v1_profiles (profile_id, tenant_id)
        SELECT p.id, p.tenant_id
        FROM access_profiles p
        INNER JOIN access_profiles v2
          ON v2.tenant_id = p.tenant_id
         AND v2.is_system = true
         AND v2.is_active = true
         AND v2.deleted_at IS NULL
         AND v2.name = CASE p.name
           WHEN 'Monitoreo operativo' THEN 'Acceso estándar NOC'
           WHEN 'Soporte inicial' THEN 'Acceso estándar Soporte'
           WHEN 'Técnico de campo' THEN 'Acceso estándar Técnico'
           WHEN 'Contratista' THEN 'Acceso estándar Contratista'
           WHEN 'Auditor' THEN 'Acceso estándar Auditoría'
           ELSE NULL
         END
        WHERE p.tenant_id = canonical_tenant_id
          AND p.is_system = true
          AND p.is_active = true
          AND p.deleted_at IS NULL
          AND p.name IN (
            'Monitoreo operativo',
            'Soporte inicial',
            'Técnico de campo',
            'Contratista',
            'Auditor'
          )
        ON CONFLICT (profile_id) DO NOTHING;

        UPDATE access_profiles p
           SET is_active = false
          FROM access_v1_remap_120_v1_profiles s
         WHERE p.id = s.profile_id
           AND p.tenant_id = canonical_tenant_id
           AND p.is_active = true;
      END
      $migration$
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $rollback$
      DECLARE
        tenant_schema       TEXT := current_schema();
        canonical_tenant_id UUID;
        has_assignment_id   BOOLEAN;
      BEGIN
        IF tenant_schema IS NULL OR tenant_schema !~ '^tenant_[a-z][a-z0-9_]{0,54}$' THEN
          RAISE EXCEPTION 'La migración 120 solo puede revertirse sobre un schema tenant válido; schema actual: %', tenant_schema;
        END IF;

        PERFORM set_config('search_path', quote_ident(tenant_schema), true);
        SELECT id INTO canonical_tenant_id FROM public.tenants WHERE schema_name = tenant_schema;

        IF to_regclass('access_v1_remap_120_v2_assignments') IS NOT NULL THEN
          SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = tenant_schema
              AND table_name = 'access_v1_remap_120_v2_assignments'
              AND column_name = 'assignment_id'
          ) INTO has_assignment_id;

          IF has_assignment_id THEN
            DELETE FROM user_access_profiles
             WHERE tenant_id = canonical_tenant_id
               AND id IN (
                 SELECT assignment_id
                 FROM access_v1_remap_120_v2_assignments
                 WHERE tenant_id = canonical_tenant_id
                   AND assignment_id IS NOT NULL
               );
          ELSE
            DELETE FROM user_access_profiles
             WHERE tenant_id = canonical_tenant_id
               AND (user_id, profile_id) IN (
                 SELECT user_id, profile_id
                 FROM access_v1_remap_120_v2_assignments
                 WHERE tenant_id = canonical_tenant_id
               );
          END IF;
          DELETE FROM access_v1_remap_120_v2_assignments WHERE tenant_id = canonical_tenant_id;
        END IF;

        IF to_regclass('access_v1_remap_120_v1_assignments') IS NOT NULL THEN
          UPDATE user_access_profiles uap
             SET is_active = true,
                 valid_to = p.previous_valid_to
            FROM access_v1_remap_120_v1_assignments p
           WHERE uap.id = p.assignment_id
             AND uap.tenant_id = canonical_tenant_id;
          DELETE FROM access_v1_remap_120_v1_assignments WHERE tenant_id = canonical_tenant_id;
        END IF;

        IF to_regclass('access_v1_remap_120_v1_profiles') IS NOT NULL THEN
          UPDATE access_profiles p
             SET is_active = true
            FROM access_v1_remap_120_v1_profiles s
           WHERE p.id = s.profile_id
             AND p.tenant_id = canonical_tenant_id;
          DELETE FROM access_v1_remap_120_v1_profiles WHERE tenant_id = canonical_tenant_id;
        END IF;
      END
      $rollback$
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS access_v1_remap_120_v1_profiles`);
    await queryRunner.query(`DROP TABLE IF EXISTS access_v1_remap_120_v1_assignments`);
    await queryRunner.query(`DROP TABLE IF EXISTS access_v1_remap_120_v2_assignments`);
  }
}
