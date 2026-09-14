import { MigrationInterface, QueryRunner } from 'typeorm';

const TEMPLATE_KEY = 'INSTALACION_ESTANDAR';

/**
 * Migración 131 — Publica `INSTALACION_ESTANDAR` v2 (MOD11 T1 B2, ADR-088).
 *
 * Spec: `docs/specs/2026-09-14-mod11-acta-instalacion-design.md` §4.2 (Aprobada
 * por el CTO) + §4.4 (política de migración). Plan:
 * `docs/plans/2026-09-14-mod11-acta-instalacion.md` §3.2 B2.
 *
 * Consume el contrato v1.2 de B1 (`finalDisposition` opcional en MATERIAL) y el
 * copy literal de B4. Publica la v2 como **versión nueva sobre la plantilla
 * canónica**, sin tocar filas existentes:
 *
 * | # | key | label (copy B4 literal) | kind / config |
 * | --- | --- | --- | --- |
 * | 1 | `installed-equipment` | Equipos instalados en el sitio del cliente | `MATERIAL` `{"itemCategory":"CPE","finalDisposition":"INSTALLED_AT_CUSTOMER"}` |
 * | 2 | `service-test` | Prueba de servicio en el sitio | `EVIDENCE` `{"evidenceType":"PHOTO"}` |
 * | 3 | `work-photo` | Fotos del trabajo realizado | `EVIDENCE` `{"evidenceType":"PHOTO"}` |
 * | 4 | `CUSTOMER_SIGNATURE` | Acta de conformidad firmada por el cliente | `EVIDENCE` `{"evidenceType":"SIGNATURE"}` |
 * | 5 | `installation-activity` | Registro de la actividad en bitácora (NO requerido) | `ACTIVITY` `{"activityType":"INSTALLATION"}`, no requerido |
 *
 * Decisiones fijadas en el documento de política
 * (`docs/informes/INFORME-MOD11-MIGRACION-PLANTILLA-V2-v1.0.md`):
 *
 * - `itemCategory: "CPE"` — código canónico de equipos en sitio de cliente
 *   (familia 047/052 de inventario); el evaluador lo resuelve contra el
 *   catálogo real, nunca desde input.
 * - Requisito 2 como `EVIDENCE PHOTO` — es el medio de captura probado en v1
 *   (`work-photo`); un `MEASUREMENT` requerido sería una OT incerrable
 *   (ADR-088 R4) y `DOCUMENT` no tiene ruta ejercitada en portal.
 * - Claves `work-photo`, `CUSTOMER_SIGNATURE` e `installation-activity`
 *   reutilizadas de v1 para no romper la continuidad de evidencias y bitácora.
 * - La v1 **no se retira ni se modifica**: convive como fila publicada y las OT
 *   nuevas resuelven la v2 por `version DESC` (`getActiveVersionForWorkType`).
 * - **Ningún `UPDATE`/`DELETE` sobre `execution_orders`**: publicar no
 *   re-snapshotea OT vivas ni no iniciadas (spec §4.4). Solo OT creadas
 *   después adoptan la v2.
 * - Alcance canónico: solo la plantilla con `key = 'INSTALACION_ESTANDAR'`.
 *   Un tenant con definición propia activa la conserva; la migración lo
 *   declara con `NOTICE` y no la clobbera (misma filosofía que la 118).
 *
 * - Transaccional (solo DML) e idempotente: re-ejecución sin efecto cuando la
 *   v2 ya existe; uuids deterministas por tenant para reintentos seguros.
 * - Reversible: `down()` elimina solo la v2 sembrada aquí y falla cerrado si
 *   hay OT abiertas referenciándola (mismo guarda que la 118).
 */
export class PublishInstalacionEstandarV2131000000000 implements MigrationInterface {
  name = 'PublishInstalacionEstandarV2131000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $migration$
      DECLARE
        tenant_schema           TEXT := current_schema();
        canonical_tenant_id     UUID;
        tenant_count            INTEGER;
        canonical_template_id   UUID;
        canonical_template_stat TEXT;
        max_version             INTEGER;
        seed_version_id         UUID;
      BEGIN
        IF tenant_schema IS NULL
           OR tenant_schema !~ '^tenant_[a-z][a-z0-9_]{0,54}$'
        THEN
          RAISE EXCEPTION
            'La migracion 131 solo puede ejecutarse sobre un schema tenant valido; schema actual: %',
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

        SELECT id, status
        INTO canonical_template_id, canonical_template_stat
        FROM execution_order_templates
        WHERE tenant_id = canonical_tenant_id
          AND key = '${TEMPLATE_KEY}';

        IF NOT FOUND THEN
          RAISE NOTICE
            'Migracion 131 omitida en %: sin plantilla canonica %; la definicion del tenant se conserva intacta.',
            tenant_schema,
            '${TEMPLATE_KEY}';
          RETURN;
        END IF;

        IF canonical_template_stat <> 'PUBLISHED' THEN
          RAISE NOTICE
            'Migracion 131 omitida en %: la plantilla canonica no esta publicada (estado %); no se publica v2 sobre un borrador.',
            tenant_schema,
            canonical_template_stat;
          RETURN;
        END IF;

        SELECT MAX(version)
        INTO max_version
        FROM execution_order_template_versions
        WHERE tenant_id = canonical_tenant_id
          AND template_id = canonical_template_id;

        IF max_version IS NULL OR max_version < 1 THEN
          RAISE EXCEPTION
            'Migracion 131 bloqueada en %: la plantilla canonica no tiene version publicada desde la cual versionar (max_version %).',
            tenant_schema,
            max_version;
        END IF;

        IF max_version >= 2 THEN
          RAISE NOTICE
            'Migracion 131 omitida en %: la plantilla canonica ya evoluciono a version %; no se clobbera la definicion vigente.',
            tenant_schema,
            max_version;
          RETURN;
        END IF;

        seed_version_id := md5(
          concat_ws(chr(31), 'iwana', 'migration-131', canonical_tenant_id::TEXT, 'version-2')
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
          canonical_template_id,
          '${TEMPLATE_KEY}',
          2,
          'Instalación estándar v2',
          'PUBLISHED',
          '[]'::jsonb,
          NOW(),
          NOW()
        );

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
            md5(concat_ws(chr(31), 'iwana', 'migration-131', canonical_tenant_id::TEXT, 'req-1'))::UUID,
            canonical_tenant_id,
            seed_version_id,
            'installed-equipment',
            'Equipos instalados en el sitio del cliente',
            TRUE,
            'MATERIAL',
            '{"itemCategory":"CPE","finalDisposition":"INSTALLED_AT_CUSTOMER"}'::jsonb,
            0,
            NOW()
          ),
          (
            md5(concat_ws(chr(31), 'iwana', 'migration-131', canonical_tenant_id::TEXT, 'req-2'))::UUID,
            canonical_tenant_id,
            seed_version_id,
            'service-test',
            'Prueba de servicio en el sitio',
            TRUE,
            'EVIDENCE',
            '{"evidenceType":"PHOTO"}'::jsonb,
            1,
            NOW()
          ),
          (
            md5(concat_ws(chr(31), 'iwana', 'migration-131', canonical_tenant_id::TEXT, 'req-3'))::UUID,
            canonical_tenant_id,
            seed_version_id,
            'work-photo',
            'Fotos del trabajo realizado',
            TRUE,
            'EVIDENCE',
            '{"evidenceType":"PHOTO"}'::jsonb,
            2,
            NOW()
          ),
          (
            md5(concat_ws(chr(31), 'iwana', 'migration-131', canonical_tenant_id::TEXT, 'req-4'))::UUID,
            canonical_tenant_id,
            seed_version_id,
            'CUSTOMER_SIGNATURE',
            'Acta de conformidad firmada por el cliente',
            TRUE,
            'EVIDENCE',
            '{"evidenceType":"SIGNATURE"}'::jsonb,
            3,
            NOW()
          ),
          (
            md5(concat_ws(chr(31), 'iwana', 'migration-131', canonical_tenant_id::TEXT, 'req-5'))::UUID,
            canonical_tenant_id,
            seed_version_id,
            'installation-activity',
            'Registro de la actividad en bitácora (NO requerido)',
            FALSE,
            'ACTIVITY',
            '{"activityType":"INSTALLATION"}'::jsonb,
            4,
            NOW()
          );
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
        seeded_version_id   UUID;
        version_found       BOOLEAN;
        dependent_orders    INTEGER;
      BEGIN
        IF tenant_schema IS NULL
           OR tenant_schema !~ '^tenant_[a-z][a-z0-9_]{0,54}$'
        THEN
          RAISE EXCEPTION
            'El rollback de la migracion 131 solo puede ejecutarse sobre un schema tenant valido; schema actual: %',
            tenant_schema;
        END IF;

        PERFORM set_config('search_path', quote_ident(tenant_schema), true);

        SELECT id
        INTO canonical_tenant_id
        FROM public.tenants
        WHERE schema_name = tenant_schema;

        IF NOT FOUND THEN
          RAISE EXCEPTION
            'El rollback de la migracion 131 no encontro tenant canonico para el schema %',
            tenant_schema;
        END IF;

        seeded_version_id := md5(
          concat_ws(chr(31), 'iwana', 'migration-131', canonical_tenant_id::TEXT, 'version-2')
        )::UUID;

        SELECT EXISTS (
          SELECT 1
          FROM execution_order_template_versions
          WHERE tenant_id = canonical_tenant_id
            AND id = seeded_version_id
            AND template_key = '${TEMPLATE_KEY}'
            AND version = 2
        )
        INTO version_found;

        IF NOT version_found THEN
          RAISE NOTICE
            'Rollback de la migracion 131 sin efecto en %: la v2 no esta presente; nada que revertir.',
            tenant_schema;
          RETURN;
        END IF;

        SELECT COUNT(*)
        INTO dependent_orders
        FROM execution_orders
        WHERE tenant_id = canonical_tenant_id
          AND template_version_id = seeded_version_id
          AND status NOT IN ('COMPLETED', 'COMPLETED_WITH_OBSERVATIONS', 'NOT_EXECUTED', 'CANCELLED');

        IF dependent_orders > 0 THEN
          RAISE EXCEPTION
            'No se puede revertir la migracion 131: % OT abiertas referencian la v2 publicada',
            dependent_orders;
        END IF;

        DELETE FROM execution_order_template_requirements
        WHERE tenant_id = canonical_tenant_id
          AND version_id = seeded_version_id;

        DELETE FROM execution_order_template_versions
        WHERE tenant_id = canonical_tenant_id
          AND id = seeded_version_id
          AND template_key = '${TEMPLATE_KEY}'
          AND version = 2;
      END
      $rollback$;
    `);
  }
}
