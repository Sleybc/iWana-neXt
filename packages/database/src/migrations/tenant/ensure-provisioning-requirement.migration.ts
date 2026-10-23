import type { QueryRunner } from 'typeorm';

export type ProvisioningMigrationNumber = '163' | '164';

/** Amplía el CHECK y publica una copia de la última versión publicada si falta PROVISIONING. */
export async function ensureProvisioningRequirement(
  queryRunner: QueryRunner,
  migrationNumber: ProvisioningMigrationNumber,
): Promise<void> {
  await queryRunner.query(`
    DO $migration$
    DECLARE
      tenant_schema TEXT := current_schema();
      v_tenant_id UUID;
      v_template_id UUID;
      latest_version INTEGER;
      next_version INTEGER;
      v_source_version_id UUID;
      v_target_version_id UUID;
    BEGIN
      IF tenant_schema IS NULL OR tenant_schema !~ '^tenant_[a-z][a-z0-9_]{0,54}$' THEN
        RAISE EXCEPTION 'La migración ${migrationNumber} solo puede ejecutarse en un schema tenant válido';
      END IF;

      PERFORM set_config('search_path', quote_ident(tenant_schema), true);
      SELECT id INTO v_tenant_id FROM public.tenants WHERE schema_name = tenant_schema;
      IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'La migración ${migrationNumber} no encontró tenant para el schema %', tenant_schema;
      END IF;

      SELECT id INTO v_template_id
        FROM execution_order_templates
       WHERE tenant_id = v_tenant_id
         AND key = 'INSTALACION_ESTANDAR'
         AND status = 'PUBLISHED';
      IF v_template_id IS NULL THEN
        RAISE NOTICE 'Migración ${migrationNumber} omitida en %: no existe plantilla canónica publicada', tenant_schema;
        RETURN;
      END IF;

      SELECT version.id, version.version
        INTO v_source_version_id, latest_version
        FROM execution_order_template_versions version
       WHERE version.tenant_id = v_tenant_id
         AND version.template_id = v_template_id
         AND version.status = 'PUBLISHED'
       ORDER BY version.version DESC
       LIMIT 1;
      IF latest_version IS NULL THEN
        RAISE NOTICE 'Migración ${migrationNumber} omitida en %: la plantilla no tiene versión publicada', tenant_schema;
        RETURN;
      END IF;

      IF EXISTS (
        SELECT 1 FROM execution_order_template_requirements requirement
         WHERE requirement.tenant_id = v_tenant_id
           AND requirement.version_id = v_source_version_id
           AND requirement.kind = 'PROVISIONING'
      ) THEN
        RAISE NOTICE 'Migración ${migrationNumber} sin efecto en %: la última versión ya exige aprovisionamiento', tenant_schema;
        RETURN;
      END IF;

      ALTER TABLE execution_order_template_requirements
        DROP CONSTRAINT IF EXISTS chk_execution_order_template_requirements_kind;
      ALTER TABLE execution_order_template_requirements
        ADD CONSTRAINT chk_execution_order_template_requirements_kind
        CHECK (kind IN ('FIELD','ACTIVITY','MEASUREMENT','EVIDENCE','MATERIAL','COMPLIANCE','PROVISIONING'));

      SELECT COALESCE(MAX(version), latest_version) + 1
        INTO next_version
        FROM execution_order_template_versions
       WHERE tenant_id = v_tenant_id AND template_id = v_template_id;

      v_target_version_id := md5(concat_ws(chr(31), 'iwana', 'migration-${migrationNumber}', v_tenant_id::TEXT))::UUID;
      IF EXISTS (
        SELECT 1 FROM execution_order_template_versions
         WHERE id = v_target_version_id AND tenant_id = v_tenant_id
      ) THEN
        RAISE EXCEPTION 'La migración ${migrationNumber} ya creó una versión que no es la última publicada de %', tenant_schema;
      END IF;

      INSERT INTO execution_order_template_versions (
        id, tenant_id, template_id, template_key, version, label, status,
        reason_catalogs, published_at, created_at
      )
      SELECT v_target_version_id, v_tenant_id, v_template_id, 'INSTALACION_ESTANDAR', next_version,
             'Instalación estándar v' || next_version::TEXT, 'PUBLISHED',
             reason_catalogs, NOW(), NOW()
        FROM execution_order_template_versions
       WHERE id = v_source_version_id AND tenant_id = v_tenant_id;

      INSERT INTO execution_order_template_requirements (
        id, tenant_id, version_id, key, label, required, kind, config, sort_order, created_at
      )
      SELECT md5(concat_ws(chr(31), 'iwana', 'migration-${migrationNumber}', v_tenant_id::TEXT, requirement.key))::UUID,
             v_tenant_id, v_target_version_id, requirement.key, requirement.label,
             requirement.required, requirement.kind, requirement.config,
             requirement.sort_order, NOW()
        FROM execution_order_template_requirements requirement
       WHERE requirement.tenant_id = v_tenant_id
         AND requirement.version_id = v_source_version_id;

      INSERT INTO execution_order_template_requirements (
        id, tenant_id, version_id, key, label, required, kind, config, sort_order, created_at
      )
      SELECT md5(concat_ws(chr(31), 'iwana', 'migration-${migrationNumber}', v_tenant_id::TEXT, 'service-provisioning'))::UUID,
             v_tenant_id, v_target_version_id, 'service-provisioning',
             'Aprovisionamiento certificado', TRUE, 'PROVISIONING', '{}'::jsonb,
             COALESCE(MAX(sort_order), -1) + 1, NOW()
        FROM execution_order_template_requirements requirement
       WHERE requirement.tenant_id = v_tenant_id
         AND requirement.version_id = v_target_version_id;
    END
    $migration$;
  `);
}

/** Revierte solo la versión creada por esta migración y restaura el CHECK original. */
export async function revertProvisioningRequirement(
  queryRunner: QueryRunner,
  migrationNumber: ProvisioningMigrationNumber,
): Promise<void> {
  await queryRunner.query(`
    DO $rollback$
    DECLARE
      tenant_schema TEXT := current_schema();
      v_tenant_id UUID;
      v_version_id UUID;
      referencing_orders INTEGER;
    BEGIN
      IF tenant_schema IS NULL OR tenant_schema !~ '^tenant_[a-z][a-z0-9_]{0,54}$' THEN
        RAISE EXCEPTION 'El rollback ${migrationNumber} solo puede ejecutarse en un schema tenant válido';
      END IF;

      PERFORM set_config('search_path', quote_ident(tenant_schema), true);
      SELECT id INTO v_tenant_id FROM public.tenants WHERE schema_name = tenant_schema;
      IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'El rollback ${migrationNumber} no encontró tenant para el schema %', tenant_schema;
      END IF;

      v_version_id := md5(concat_ws(chr(31), 'iwana', 'migration-${migrationNumber}', v_tenant_id::TEXT))::UUID;
      IF NOT EXISTS (
        SELECT 1 FROM execution_order_template_versions
         WHERE id = v_version_id AND tenant_id = v_tenant_id
      ) THEN
        ${
          migrationNumber === '163'
            ? `v_version_id := md5(concat_ws(chr(31), 'iwana', 'migration-163', v_tenant_id::TEXT, 'version-3'))::UUID;
        IF NOT EXISTS (
          SELECT 1 FROM execution_order_template_versions
           WHERE id = v_version_id AND tenant_id = v_tenant_id
        ) THEN
          RAISE NOTICE 'Rollback ${migrationNumber} sin efecto en %: la versión publicada no está presente', tenant_schema;
          RETURN;
        END IF;`
            : `RAISE NOTICE 'Rollback ${migrationNumber} sin efecto en %: la versión publicada no está presente', tenant_schema;
        RETURN;`
        }
      END IF;

      SELECT COUNT(*) INTO referencing_orders
        FROM execution_orders
       WHERE tenant_id = v_tenant_id AND template_version_id = v_version_id;
      IF referencing_orders > 0 THEN
        RAISE EXCEPTION 'No se puede revertir la migración ${migrationNumber}: % OT referencian la versión publicada', referencing_orders;
      END IF;

      DELETE FROM execution_order_template_requirements
       WHERE tenant_id = v_tenant_id AND version_id = v_version_id;
      DELETE FROM execution_order_template_versions
       WHERE id = v_version_id AND tenant_id = v_tenant_id;

      IF EXISTS (
        SELECT 1 FROM execution_order_template_requirements
         WHERE tenant_id = v_tenant_id AND kind = 'PROVISIONING'
      ) THEN
        RAISE EXCEPTION 'No se puede restaurar el CHECK: aún existen requisitos PROVISIONING';
      END IF;

      ALTER TABLE execution_order_template_requirements
        DROP CONSTRAINT IF EXISTS chk_execution_order_template_requirements_kind;
      ALTER TABLE execution_order_template_requirements
        ADD CONSTRAINT chk_execution_order_template_requirements_kind
        CHECK (kind IN ('FIELD','ACTIVITY','MEASUREMENT','EVIDENCE','MATERIAL','COMPLIANCE'));
    END
    $rollback$;
  `);
}
