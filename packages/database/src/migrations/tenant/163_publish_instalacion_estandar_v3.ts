import { MigrationInterface, QueryRunner } from 'typeorm';

const TEMPLATE_KEY = 'INSTALACION_ESTANDAR';

/** Publica la v3 sin alterar plantillas ni snapshots de órdenes existentes. */
export class PublishInstalacionV3163000000000 implements MigrationInterface {
  name = 'PublishInstalacionV3163000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $migration$
      DECLARE
        tenant_schema TEXT := current_schema();
        v_tenant_id UUID;
        v_template_id UUID;
        latest_version INTEGER;
        v_source_version_id UUID;
        v_target_version_id UUID;
      BEGIN
        IF tenant_schema IS NULL OR tenant_schema !~ '^tenant_[a-z][a-z0-9_]{0,54}$' THEN
          RAISE EXCEPTION 'La migración 163 solo puede ejecutarse en un schema tenant válido';
        END IF;

        PERFORM set_config('search_path', quote_ident(tenant_schema), true);
        SELECT id INTO v_tenant_id FROM public.tenants WHERE schema_name = tenant_schema;
        IF v_tenant_id IS NULL THEN
          RAISE EXCEPTION 'La migración 163 no encontró tenant para el schema %', tenant_schema;
        END IF;

        SELECT id INTO v_template_id
          FROM execution_order_templates
         WHERE tenant_id = v_tenant_id AND key = '${TEMPLATE_KEY}' AND status = 'PUBLISHED';
        IF v_template_id IS NULL THEN
          RAISE NOTICE 'Migración 163 omitida en %: no existe plantilla canónica publicada', tenant_schema;
          RETURN;
        END IF;

        SELECT MAX(version) INTO latest_version
          FROM execution_order_template_versions
         WHERE tenant_id = v_tenant_id AND template_id = v_template_id;
        IF latest_version >= 3 THEN
          RAISE NOTICE 'Migración 163 omitida en %: la plantilla ya alcanzó v%', tenant_schema, latest_version;
          RETURN;
        END IF;
        IF latest_version <> 2 THEN
          RAISE EXCEPTION 'Migración 163 requiere la v2 publicada de %; versión actual: %', TEMPLATE_KEY, latest_version;
        END IF;

        SELECT id INTO v_source_version_id
          FROM execution_order_template_versions
         WHERE tenant_id = v_tenant_id AND template_id = v_template_id AND version = 2;
        v_target_version_id := md5(concat_ws(chr(31), 'iwana', 'migration-163', v_tenant_id::TEXT, 'version-3'))::UUID;

        INSERT INTO execution_order_template_versions (
          id, tenant_id, template_id, template_key, version, label, status,
          reason_catalogs, published_at, created_at
        )
        SELECT v_target_version_id, v_tenant_id, v_template_id, '${TEMPLATE_KEY}', 3,
               'Instalación estándar v3', 'PUBLISHED', reason_catalogs, NOW(), NOW()
          FROM execution_order_template_versions
         WHERE id = v_source_version_id AND tenant_id = v_tenant_id;

        INSERT INTO execution_order_template_requirements (
          id, tenant_id, version_id, key, label, required, kind, config, sort_order, created_at
        )
        SELECT md5(concat_ws(chr(31), 'iwana', 'migration-163', v_tenant_id::TEXT, requirement.key))::UUID,
               v_tenant_id, v_target_version_id, requirement.key, requirement.label,
               requirement.required, requirement.kind, requirement.config,
               requirement.sort_order, NOW()
          FROM execution_order_template_requirements requirement
         WHERE requirement.tenant_id = v_tenant_id AND requirement.version_id = v_source_version_id;

        INSERT INTO execution_order_template_requirements (
          id, tenant_id, version_id, key, label, required, kind, config, sort_order, created_at
        )
        SELECT md5(concat_ws(chr(31), 'iwana', 'migration-163', v_tenant_id::TEXT, 'service-provisioning'))::UUID,
               v_tenant_id, v_target_version_id, 'service-provisioning',
               'Aprovisionamiento certificado', TRUE, 'PROVISIONING', '{}'::jsonb,
               COALESCE(MAX(sort_order), -1) + 1, NOW()
          FROM execution_order_template_requirements requirement
         WHERE requirement.tenant_id = v_tenant_id AND requirement.version_id = v_target_version_id;
      END
      $migration$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $rollback$
      DECLARE
        tenant_schema TEXT := current_schema();
        v_tenant_id UUID;
        v_version_id UUID;
        referencing_orders INTEGER;
      BEGIN
        IF tenant_schema IS NULL OR tenant_schema !~ '^tenant_[a-z][a-z0-9_]{0,54}$' THEN
          RAISE EXCEPTION 'El rollback 163 solo puede ejecutarse en un schema tenant válido';
        END IF;

        PERFORM set_config('search_path', quote_ident(tenant_schema), true);
        SELECT id INTO v_tenant_id FROM public.tenants WHERE schema_name = tenant_schema;
        IF v_tenant_id IS NULL THEN
          RAISE EXCEPTION 'El rollback 163 no encontró tenant para el schema %', tenant_schema;
        END IF;
        v_version_id := md5(concat_ws(chr(31), 'iwana', 'migration-163', v_tenant_id::TEXT, 'version-3'))::UUID;

        IF NOT EXISTS (
          SELECT 1 FROM execution_order_template_versions
           WHERE id = v_version_id AND tenant_id = v_tenant_id
             AND template_key = '${TEMPLATE_KEY}' AND version = 3
        ) THEN
          RAISE NOTICE 'Rollback 163 sin efecto en %: la v3 no está presente', tenant_schema;
          RETURN;
        END IF;

        SELECT COUNT(*) INTO referencing_orders
          FROM execution_orders
         WHERE tenant_id = v_tenant_id AND template_version_id = v_version_id;
        IF referencing_orders > 0 THEN
          RAISE EXCEPTION 'No se puede revertir la migración 163: % OT referencian la v3', referencing_orders;
        END IF;

        DELETE FROM execution_order_template_requirements
         WHERE tenant_id = v_tenant_id AND version_id = v_version_id;
        DELETE FROM execution_order_template_versions
         WHERE id = v_version_id AND tenant_id = v_tenant_id
           AND template_key = '${TEMPLATE_KEY}' AND version = 3;
      END
      $rollback$;
    `);
  }
}
