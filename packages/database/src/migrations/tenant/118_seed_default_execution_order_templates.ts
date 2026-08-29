import { MigrationInterface, QueryRunner } from 'typeorm';

const TEMPLATE_KEY = 'INSTALACION_ESTANDAR';

/**
 * Siembra la plantilla publicada de instalación por tenant y congela el snapshot
 * en OTs abiertas que se crearon antes de existir plantilla activa.
 */
export class SeedDefaultExecutionOrderTemplates1180000000000 implements MigrationInterface {
  name = 'SeedDefaultExecutionOrderTemplates1180000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $migration$
      DECLARE
        tenant_schema       TEXT := current_schema();
        canonical_tenant_id UUID;
        tenant_count        INTEGER;
        has_active_template BOOLEAN;
        template_id         UUID;
        seed_version_id     UUID;
        requirements_snapshot JSONB := '[
          {"key":"installation-activity","label":"Actividad de instalación","required":true,"kind":"ACTIVITY","activityType":"INSTALLATION"},
          {"key":"work-photo","label":"Evidencia fotográfica","required":true,"kind":"EVIDENCE","evidenceType":"PHOTO"},
          {"key":"CUSTOMER_SIGNATURE","label":"Firma del cliente","required":true,"kind":"EVIDENCE","evidenceType":"SIGNATURE"}
        ]'::jsonb;
        backfilled_count    INTEGER;
      BEGIN
        IF tenant_schema IS NULL
           OR tenant_schema !~ '^tenant_[a-z][a-z0-9_]{0,54}$'
        THEN
          RAISE EXCEPTION
            'La migracion 118 solo puede ejecutarse sobre un schema tenant valido; schema actual: %',
            tenant_schema;
        END IF;

        PERFORM set_config('search_path', quote_ident(tenant_schema), true);

        SELECT COUNT(*)
        INTO tenant_count
        FROM public.tenants
        WHERE schema_name = tenant_schema;

        IF tenant_count <> 1 THEN
          RAISE EXCEPTION
            'Se esperaba exactamente un tenant canonico para el schema %, encontrados: %',
            tenant_schema,
            tenant_count;
        END IF;

        SELECT id
        INTO canonical_tenant_id
        FROM public.tenants
        WHERE schema_name = tenant_schema;

        SELECT EXISTS (
          SELECT 1
          FROM execution_order_templates AS template
          JOIN execution_order_template_versions AS version
            ON version.template_id = template.id
           AND version.tenant_id = template.tenant_id
          WHERE template.tenant_id = canonical_tenant_id
            AND template.work_type = 'INSTALLATION'
            AND template.status = 'PUBLISHED'
            AND version.status = 'PUBLISHED'
        )
        INTO has_active_template;

        IF NOT has_active_template THEN
          template_id := md5(
            concat_ws(chr(31), 'iwana', 'migration-118', canonical_tenant_id::TEXT, 'template')
          )::UUID;

          INSERT INTO execution_order_templates (
            id,
            tenant_id,
            key,
            label,
            work_type,
            status,
            created_at,
            updated_at
          )
          VALUES (
            template_id,
            canonical_tenant_id,
            '${TEMPLATE_KEY}',
            'Instalación estándar',
            'INSTALLATION',
            'PUBLISHED',
            NOW(),
            NOW()
          )
          ON CONFLICT (tenant_id, key) DO UPDATE
            SET label = EXCLUDED.label,
                work_type = EXCLUDED.work_type,
                status = 'PUBLISHED',
                updated_at = NOW()
          RETURNING id INTO template_id;

          seed_version_id := md5(
            concat_ws(chr(31), 'iwana', 'migration-118', canonical_tenant_id::TEXT, 'version-1')
          )::UUID;

          INSERT INTO execution_order_template_versions (
            id,
            tenant_id,
            template_id,
            template_key,
            version,
            label,
            status,
            reason_catalogs,
            published_at,
            created_at
          )
          VALUES (
            seed_version_id,
            canonical_tenant_id,
            template_id,
            '${TEMPLATE_KEY}',
            1,
            'Instalación estándar v1',
            'PUBLISHED',
            '[]'::jsonb,
            NOW(),
            NOW()
          )
          ON CONFLICT (tenant_id, template_key, version) DO UPDATE
            SET label = EXCLUDED.label,
                status = 'PUBLISHED',
                published_at = NOW()
          RETURNING id INTO seed_version_id;

          DELETE FROM execution_order_template_requirements AS requirement
          WHERE requirement.tenant_id = canonical_tenant_id
            AND requirement.version_id = seed_version_id;

          INSERT INTO execution_order_template_requirements (
            id,
            tenant_id,
            version_id,
            key,
            label,
            required,
            kind,
            config,
            sort_order,
            created_at
          )
          VALUES
            (
              md5(concat_ws(chr(31), 'iwana', 'migration-118', canonical_tenant_id::TEXT, 'req-1'))::UUID,
              canonical_tenant_id,
              seed_version_id,
              'installation-activity',
              'Actividad de instalación',
              TRUE,
              'ACTIVITY',
              '{"activityType":"INSTALLATION"}'::jsonb,
              0,
              NOW()
            ),
            (
              md5(concat_ws(chr(31), 'iwana', 'migration-118', canonical_tenant_id::TEXT, 'req-2'))::UUID,
              canonical_tenant_id,
              seed_version_id,
              'work-photo',
              'Evidencia fotográfica',
              TRUE,
              'EVIDENCE',
              '{"evidenceType":"PHOTO"}'::jsonb,
              1,
              NOW()
            ),
            (
              md5(concat_ws(chr(31), 'iwana', 'migration-118', canonical_tenant_id::TEXT, 'req-3'))::UUID,
              canonical_tenant_id,
              seed_version_id,
              'CUSTOMER_SIGNATURE',
              'Firma del cliente',
              TRUE,
              'EVIDENCE',
              '{"evidenceType":"SIGNATURE"}'::jsonb,
              2,
              NOW()
            );
        END IF;

        WITH active_template AS (
          SELECT
            template.id AS template_id,
            version.id AS version_id,
            template.key AS template_key,
            version.version AS version_number,
            version.label AS version_label
          FROM execution_order_templates AS template
          JOIN execution_order_template_versions AS version
            ON version.template_id = template.id
           AND version.tenant_id = template.tenant_id
          WHERE template.tenant_id = canonical_tenant_id
            AND template.work_type = 'INSTALLATION'
            AND template.status = 'PUBLISHED'
            AND version.status = 'PUBLISHED'
          ORDER BY version.version DESC, template.created_at ASC
          LIMIT 1
        )
        UPDATE execution_orders AS execution_order
        SET
          template_id = active_template.template_id,
          template_version_id = active_template.version_id,
          template_key = active_template.template_key,
          template_version_number = active_template.version_number,
          template_label = active_template.version_label,
          template_requirements_snapshot = requirements_snapshot,
          updated_at = NOW()
        FROM active_template
        WHERE execution_order.tenant_id = canonical_tenant_id
          AND execution_order.work_type = 'INSTALLATION'
          AND execution_order.template_requirements_snapshot IS NULL
          AND execution_order.status NOT IN (
            'COMPLETED',
            'COMPLETED_WITH_OBSERVATIONS',
            'NOT_EXECUTED',
            'CANCELLED'
          );

        GET DIAGNOSTICS backfilled_count = ROW_COUNT;
      END
      $migration$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $rollback$
      DECLARE
        tenant_schema       TEXT := current_schema();
        canonical_tenant_id UUID;
        seeded_template_id  UUID;
        seeded_version_id   UUID;
        dependent_orders    INTEGER;
      BEGIN
        IF tenant_schema IS NULL
           OR tenant_schema !~ '^tenant_[a-z][a-z0-9_]{0,54}$'
        THEN
          RAISE EXCEPTION
            'El rollback de la migracion 118 solo puede ejecutarse sobre un schema tenant valido; schema actual: %',
            tenant_schema;
        END IF;

        PERFORM set_config('search_path', quote_ident(tenant_schema), true);

        SELECT id
        INTO canonical_tenant_id
        FROM public.tenants
        WHERE schema_name = tenant_schema;

        seeded_template_id := md5(
          concat_ws(chr(31), 'iwana', 'migration-118', canonical_tenant_id::TEXT, 'template')
        )::UUID;
        seeded_version_id := md5(
          concat_ws(chr(31), 'iwana', 'migration-118', canonical_tenant_id::TEXT, 'version-1')
        )::UUID;

        SELECT COUNT(*)
        INTO dependent_orders
        FROM execution_orders
        WHERE tenant_id = canonical_tenant_id
          AND template_version_id = seeded_version_id
          AND status NOT IN ('COMPLETED', 'COMPLETED_WITH_OBSERVATIONS', 'NOT_EXECUTED', 'CANCELLED');

        IF dependent_orders > 0 THEN
          RAISE EXCEPTION
            'No se puede revertir la migracion 118: % OT abiertas referencian la plantilla sembrada',
            dependent_orders;
        END IF;

        DELETE FROM execution_order_template_requirements
        WHERE tenant_id = canonical_tenant_id
          AND version_id = seeded_version_id;

        DELETE FROM execution_order_template_versions
        WHERE tenant_id = canonical_tenant_id
          AND id = seeded_version_id
          AND template_key = '${TEMPLATE_KEY}'
          AND version = 1;

        DELETE FROM execution_order_templates
        WHERE tenant_id = canonical_tenant_id
          AND id = seeded_template_id
          AND key = '${TEMPLATE_KEY}';
      END
      $rollback$;
    `);
  }
}
