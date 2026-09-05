import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 121 — Curación P2/P3 del hotfix 120 (tenants que ya aplicaron 120)
 *
 * 120 ya corrida persiste provenance V2 por `(user_id, profile_id)` y no exige
 * `v2.is_active`. Esta migración:
 * 1. Añade `assignment_id` a `access_v1_remap_120_v2_assignments` y lo rellena
 *    desde asignaciones V2 vivas (down de 120 pasa a borrar por id).
 * 2. Remapea residuales V1 activas solo si existe V2 canónica activa.
 *    Provenance propia `access_v1_remap_121_*` con PK `assignment_id`.
 *
 * Idempotente. Schema: tenant (search_path).
 */
export class HardenMod00AccessV1RemapProvenance12100000000000 implements MigrationInterface {
  name = 'HardenMod00AccessV1RemapProvenance12100000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS access_v1_remap_121_v2_assignments (
        assignment_id UUID NOT NULL,
        tenant_id     UUID NOT NULL,
        CONSTRAINT pk_access_v1_remap_121_v2_assignments PRIMARY KEY (assignment_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS access_v1_remap_121_v1_assignments (
        assignment_id      UUID NOT NULL,
        tenant_id          UUID NOT NULL,
        previous_valid_to DATE,
        CONSTRAINT pk_access_v1_remap_121_v1_assignments PRIMARY KEY (assignment_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS access_v1_remap_121_v1_profiles (
        profile_id UUID NOT NULL,
        tenant_id  UUID NOT NULL,
        CONSTRAINT pk_access_v1_remap_121_v1_profiles PRIMARY KEY (profile_id)
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
          RAISE EXCEPTION 'La migración 121 solo puede ejecutarse sobre un schema tenant válido; schema actual: %', tenant_schema;
        END IF;

        PERFORM set_config('search_path', quote_ident(tenant_schema), true);

        SELECT COUNT(*) INTO tenant_count FROM public.tenants WHERE schema_name = tenant_schema;
        IF tenant_count <> 1 THEN
          RAISE EXCEPTION 'Se esperaba exactamente un tenant canónico para el schema %, encontrados: %', tenant_schema, tenant_count;
        END IF;

        SELECT id INTO canonical_tenant_id FROM public.tenants WHERE schema_name = tenant_schema;

        IF to_regclass('access_v1_remap_120_v2_assignments') IS NOT NULL THEN
          ALTER TABLE access_v1_remap_120_v2_assignments
            ADD COLUMN IF NOT EXISTS assignment_id UUID;

          UPDATE access_v1_remap_120_v2_assignments p
             SET assignment_id = uap.id
            FROM user_access_profiles uap
           WHERE p.assignment_id IS NULL
             AND uap.user_id = p.user_id
             AND uap.profile_id = p.profile_id
             AND uap.tenant_id = p.tenant_id
             AND uap.is_active = true;
        END IF;

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
          RETURNING id, tenant_id
        )
        INSERT INTO access_v1_remap_121_v2_assignments (assignment_id, tenant_id)
        SELECT id, tenant_id FROM inserted
        ON CONFLICT (assignment_id) DO NOTHING;

        INSERT INTO access_v1_remap_121_v1_assignments (assignment_id, tenant_id, previous_valid_to)
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
          FROM access_v1_remap_121_v1_assignments p
         WHERE uap.id = p.assignment_id
           AND uap.tenant_id = canonical_tenant_id
           AND uap.is_active = true;

        INSERT INTO access_v1_remap_121_v1_profiles (profile_id, tenant_id)
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
          FROM access_v1_remap_121_v1_profiles s
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
      BEGIN
        IF tenant_schema IS NULL OR tenant_schema !~ '^tenant_[a-z][a-z0-9_]{0,54}$' THEN
          RAISE EXCEPTION 'La migración 121 solo puede revertirse sobre un schema tenant válido; schema actual: %', tenant_schema;
        END IF;

        PERFORM set_config('search_path', quote_ident(tenant_schema), true);
        SELECT id INTO canonical_tenant_id FROM public.tenants WHERE schema_name = tenant_schema;

        IF to_regclass('access_v1_remap_121_v2_assignments') IS NOT NULL THEN
          DELETE FROM user_access_profiles
           WHERE tenant_id = canonical_tenant_id
             AND id IN (
               SELECT assignment_id
               FROM access_v1_remap_121_v2_assignments
               WHERE tenant_id = canonical_tenant_id
             );
          DELETE FROM access_v1_remap_121_v2_assignments WHERE tenant_id = canonical_tenant_id;
        END IF;

        IF to_regclass('access_v1_remap_121_v1_assignments') IS NOT NULL THEN
          UPDATE user_access_profiles uap
             SET is_active = true,
                 valid_to = p.previous_valid_to
            FROM access_v1_remap_121_v1_assignments p
           WHERE uap.id = p.assignment_id
             AND uap.tenant_id = canonical_tenant_id;
          DELETE FROM access_v1_remap_121_v1_assignments WHERE tenant_id = canonical_tenant_id;
        END IF;

        IF to_regclass('access_v1_remap_121_v1_profiles') IS NOT NULL THEN
          UPDATE access_profiles p
             SET is_active = true
            FROM access_v1_remap_121_v1_profiles s
           WHERE p.id = s.profile_id
             AND p.tenant_id = canonical_tenant_id;
          DELETE FROM access_v1_remap_121_v1_profiles WHERE tenant_id = canonical_tenant_id;
        END IF;
      END
      $rollback$
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS access_v1_remap_121_v1_profiles`);
    await queryRunner.query(`DROP TABLE IF EXISTS access_v1_remap_121_v1_assignments`);
    await queryRunner.query(`DROP TABLE IF EXISTS access_v1_remap_121_v2_assignments`);
  }
}
