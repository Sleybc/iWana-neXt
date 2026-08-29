import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 119 — Convergencia RBAC granular MOD00_ACCESS_V2
 *
 * Alcance Fase 1 (PRD §4.3.4 / HLD §6.6 / ADR-083):
 *  - Up: asegura catálogo V2 (6 nuevas ASSIGNABLE + 6 promovidas con descripción sin "en fase futura",
 *    4 billing RESERVED, 2 crm.customers deprecadas a is_active=false), crea 9 plantillas estándar
 *    ("Administrador general" + 8 "Acceso estándar {Categoria}") con permisos de la matriz V2,
 *    y asigna set-based la plantilla estándar a usuarios ACTIVE no-ADMIN sin perfiles activos.
 *  - Down: elimina SOLO asignaciones creadas por esta migración (provenance), desactiva plantillas
 *    estándar creadas, revierte filas V2 al estado V1.
 *
 * Idempotente y reversible. Provenance para asignaciones en tabla `access_v2_seed_119`.
 * Schema: tenant (search_path)
 */
export class SeedMod00AccessV21190000000000 implements MigrationInterface {
  name = 'SeedMod00AccessV21190000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS access_v2_seed_119 (
        user_id     UUID NOT NULL,
        profile_id  UUID NOT NULL,
        tenant_id   UUID NOT NULL,
        CONSTRAINT pk_access_v2_seed_119 PRIMARY KEY (user_id, profile_id)
      )
    `);

    await queryRunner.query(`
      DO $migration$
      DECLARE
        tenant_schema       TEXT := current_schema();
        canonical_tenant_id UUID;
        tenant_count        INTEGER;
        catalog_count       INTEGER;
        inserted_assignments INTEGER := 0;
      BEGIN
        IF tenant_schema IS NULL OR tenant_schema !~ '^tenant_[a-z][a-z0-9_]{0,54}$' THEN
          RAISE EXCEPTION 'La migración 119 solo puede ejecutarse sobre un schema tenant válido; schema actual: %', tenant_schema;
        END IF;

        PERFORM set_config('search_path', quote_ident(tenant_schema), true);

        SELECT COUNT(*) INTO tenant_count FROM public.tenants WHERE schema_name = tenant_schema;
        IF tenant_count <> 1 THEN
          RAISE EXCEPTION 'Se esperaba exactamente un tenant canónico para el schema %, encontrados: %', tenant_schema, tenant_count;
        END IF;

        SELECT id INTO canonical_tenant_id FROM public.tenants WHERE schema_name = tenant_schema;

        -- ── Catálogo V2: insert/upsert 39 filas (35 ASSIGNABLE V2 + 4 RESERVED billing) ──
        -- Usamos ON CONFLICT DO UPDATE para promover descripciones y availability.
        INSERT INTO access_permission_catalog
          (tenant_id, permission_key, module_key, action, description, catalog_version, availability, is_system, is_active)
        VALUES
          (canonical_tenant_id, 'settings.read', 'settings', 'read', 'Ver centro de Configuración', 'MOD00_ACCESS_V2', 'ASSIGNABLE', true, true),
          (canonical_tenant_id, 'settings.manage', 'settings', 'manage', 'Administrar la configuración general', 'MOD00_ACCESS_V2', 'ASSIGNABLE', true, true),
          (canonical_tenant_id, 'organization.sites.read', 'organization', 'read', 'Ver sedes de la empresa', 'MOD00_ACCESS_V2', 'ASSIGNABLE', true, true),
          (canonical_tenant_id, 'organization.sites.manage', 'organization', 'manage', 'Crear, editar, activar/desactivar y eliminar sedes', 'MOD00_ACCESS_V2', 'ASSIGNABLE', true, true),
          (canonical_tenant_id, 'organization.hours.manage', 'organization', 'manage', 'Gestionar horarios institucionales de sedes', 'MOD00_ACCESS_V2', 'ASSIGNABLE', true, true),
          (canonical_tenant_id, 'organization.assignments.manage', 'organization', 'manage', 'Gestionar asignaciones y responsables de sedes', 'MOD00_ACCESS_V2', 'ASSIGNABLE', true, true),
          (canonical_tenant_id, 'users.read', 'users', 'read', 'Ver usuarios internos de la empresa', 'MOD00_ACCESS_V2', 'ASSIGNABLE', true, true),
          (canonical_tenant_id, 'users.manage', 'users', 'manage', 'Crear, editar y desactivar usuarios internos', 'MOD00_ACCESS_V2', 'ASSIGNABLE', true, true),
          (canonical_tenant_id, 'access.permissions.read', 'access', 'read', 'Ver los accesos disponibles para cada perfil', 'MOD00_ACCESS_V2', 'ASSIGNABLE', true, true),
          (canonical_tenant_id, 'access.profiles.read', 'access', 'read', 'Ver perfiles de acceso', 'MOD00_ACCESS_V2', 'ASSIGNABLE', true, true),
          (canonical_tenant_id, 'access.profiles.manage', 'access', 'manage', 'Crear, editar y desactivar perfiles de acceso', 'MOD00_ACCESS_V2', 'ASSIGNABLE', true, true),
          (canonical_tenant_id, 'access.assignments.manage', 'access', 'manage', 'Asignar perfiles de acceso a usuarios de la empresa', 'MOD00_ACCESS_V2', 'ASSIGNABLE', true, true),
          (canonical_tenant_id, 'wfm.schedule.read', 'wfm', 'read', 'Ver agenda de visitas', 'MOD00_ACCESS_V2', 'ASSIGNABLE', true, true),
          (canonical_tenant_id, 'wfm.schedule.manage', 'wfm', 'manage', 'Gestionar agenda de visitas', 'MOD00_ACCESS_V2', 'ASSIGNABLE', true, true),
          (canonical_tenant_id, 'wfm.work_orders.execute', 'wfm', 'execute', 'Ejecutar órdenes de trabajo asignadas', 'MOD00_ACCESS_V2', 'ASSIGNABLE', true, true),
          (canonical_tenant_id, 'operations.execution_orders.read', 'operations', 'read', 'Consultar órdenes de ejecución asignadas y supervisadas', 'MOD00_ACCESS_V2', 'ASSIGNABLE', true, true),
          (canonical_tenant_id, 'operations.execution_orders.execute', 'operations', 'execute', 'Ejecutar actividades, evidencias y cierre de órdenes asignadas', 'MOD00_ACCESS_V2', 'ASSIGNABLE', true, true),
          (canonical_tenant_id, 'operations.execution_orders.supervise', 'operations', 'supervise', 'Asignar y supervisar órdenes de ejecución', 'MOD00_ACCESS_V2', 'ASSIGNABLE', true, true),
          (canonical_tenant_id, 'operations.execution_order_templates.read', 'operations', 'read', 'Consultar plantillas de ejecución', 'MOD00_ACCESS_V2', 'ASSIGNABLE', true, true),
          (canonical_tenant_id, 'operations.execution_order_templates.manage', 'operations', 'manage', 'Administrar versiones de plantillas de ejecución', 'MOD00_ACCESS_V2', 'ASSIGNABLE', true, true),
          (canonical_tenant_id, 'operations.execution_events.redrive', 'operations', 'redrive', 'Reintentar eventos fallidos de ejecución con ticket operativo', 'MOD00_ACCESS_V2', 'ASSIGNABLE', true, true),
          (canonical_tenant_id, 'operations.tasks.read', 'operations', 'read', 'Ver tareas operativas de la empresa', 'MOD00_ACCESS_V2', 'ASSIGNABLE', true, true),
          (canonical_tenant_id, 'operations.tasks.manage', 'operations', 'manage', 'Crear, asignar y actualizar tareas operativas', 'MOD00_ACCESS_V2', 'ASSIGNABLE', true, true),
          -- Nuevas V2
          (canonical_tenant_id, 'crm.subscribers.read', 'crm', 'read', 'Ver Suscriptores', 'MOD00_ACCESS_V2', 'ASSIGNABLE', true, true),
          (canonical_tenant_id, 'crm.subscribers.manage', 'crm', 'manage', 'Crear y editar Suscriptores', 'MOD00_ACCESS_V2', 'ASSIGNABLE', true, true),
          (canonical_tenant_id, 'crm.expedientes.read', 'crm', 'read', 'Ver Oportunidades', 'MOD00_ACCESS_V2', 'ASSIGNABLE', true, true),
          (canonical_tenant_id, 'crm.expedientes.manage', 'crm', 'manage', 'Gestionar Oportunidades', 'MOD00_ACCESS_V2', 'ASSIGNABLE', true, true),
          (canonical_tenant_id, 'inventory.purchasing.read', 'inventory', 'read', 'Ver compras y cotizaciones', 'MOD00_ACCESS_V2', 'ASSIGNABLE', true, true),
          (canonical_tenant_id, 'inventory.purchasing.manage', 'inventory', 'manage', 'Gestionar compras y cotizaciones', 'MOD00_ACCESS_V2', 'ASSIGNABLE', true, true),
          -- Promovidas con descripción sin "en fase futura"
          (canonical_tenant_id, 'commercial.catalog.read', 'commercial', 'read', 'Ver catálogo comercial', 'MOD00_ACCESS_V2', 'ASSIGNABLE', true, true),
          (canonical_tenant_id, 'commercial.catalog.manage', 'commercial', 'manage', 'Gestionar catálogo comercial', 'MOD00_ACCESS_V2', 'ASSIGNABLE', true, true),
          (canonical_tenant_id, 'assurance.tickets.read', 'assurance', 'read', 'Ver tickets y PQR', 'MOD00_ACCESS_V2', 'ASSIGNABLE', true, true),
          (canonical_tenant_id, 'assurance.tickets.manage', 'assurance', 'manage', 'Gestionar tickets y PQR', 'MOD00_ACCESS_V2', 'ASSIGNABLE', true, true),
          (canonical_tenant_id, 'inventory.stock.read', 'inventory', 'read', 'Ver inventario', 'MOD00_ACCESS_V2', 'ASSIGNABLE', true, true),
          (canonical_tenant_id, 'inventory.stock.manage', 'inventory', 'manage', 'Gestionar inventario', 'MOD00_ACCESS_V2', 'ASSIGNABLE', true, true),
          -- Billing permanece RESERVED V2
          (canonical_tenant_id, 'billing.payments.read', 'billing', 'read', 'Ver recaudos futuros', 'MOD00_ACCESS_V2', 'RESERVED', true, true),
          (canonical_tenant_id, 'billing.payments.register', 'billing', 'register', 'Registrar recaudo futuro', 'MOD00_ACCESS_V2', 'RESERVED', true, true),
          (canonical_tenant_id, 'billing.invoices.read', 'billing', 'read', 'Ver facturas futuras', 'MOD00_ACCESS_V2', 'RESERVED', true, true),
          (canonical_tenant_id, 'billing.invoices.manage', 'billing', 'manage', 'Gestionar facturación futura', 'MOD00_ACCESS_V2', 'RESERVED', true, true)
        ON CONFLICT (tenant_id, permission_key) DO UPDATE
          SET module_key = EXCLUDED.module_key,
              action = EXCLUDED.action,
              description = EXCLUDED.description,
              catalog_version = EXCLUDED.catalog_version,
              availability = EXCLUDED.availability,
              is_system = true,
              is_active = EXCLUDED.is_active;

        -- Deprecar crm.customers.* -> is_active false
        UPDATE access_permission_catalog
          SET is_active = false,
              catalog_version = 'MOD00_ACCESS_V2'
          WHERE tenant_id = canonical_tenant_id
            AND permission_key IN ('crm.customers.read', 'crm.customers.manage')
            AND is_active = true;

        -- Verificación mínima de catálogo ASSIGNABLE
        SELECT COUNT(*) INTO catalog_count
          FROM access_permission_catalog
          WHERE tenant_id = canonical_tenant_id
            AND is_active = true
            AND catalog_version = 'MOD00_ACCESS_V2'
            AND availability = 'ASSIGNABLE';
        IF catalog_count <> 35 THEN
          RAISE EXCEPTION 'Catálogo V2 incompleto: % ASSIGNABLE de 35', catalog_count;
        END IF;

        -- ── 9 plantillas estándar (IDs deterministas por tenant+rol) ──
        INSERT INTO access_profiles (id, tenant_id, name, description, base_role_constraint, scope_site_id, is_system, is_active)
        VALUES
          (md5(concat_ws(chr(31), 'iwana', 'migration-119', canonical_tenant_id::text, 'profile', 'ADMIN'))::uuid, canonical_tenant_id, 'Administrador general', 'Plantilla estándar para administración general (MOD00_ACCESS_V2).', 'ADMIN', NULL, true, true),
          (md5(concat_ws(chr(31), 'iwana', 'migration-119', canonical_tenant_id::text, 'profile', 'NOC'))::uuid, canonical_tenant_id, 'Acceso estándar NOC', 'Plantilla estándar NOC (MOD00_ACCESS_V2).', 'NOC', NULL, true, true),
          (md5(concat_ws(chr(31), 'iwana', 'migration-119', canonical_tenant_id::text, 'profile', 'SUPPORT'))::uuid, canonical_tenant_id, 'Acceso estándar Soporte', 'Plantilla estándar Soporte (MOD00_ACCESS_V2).', 'SUPPORT', NULL, true, true),
          (md5(concat_ws(chr(31), 'iwana', 'migration-119', canonical_tenant_id::text, 'profile', 'SALES'))::uuid, canonical_tenant_id, 'Acceso estándar Comercial', 'Plantilla estándar Comercial (MOD00_ACCESS_V2).', 'SALES', NULL, true, true),
          (md5(concat_ws(chr(31), 'iwana', 'migration-119', canonical_tenant_id::text, 'profile', 'TECHNICIAN'))::uuid, canonical_tenant_id, 'Acceso estándar Técnico', 'Plantilla estándar Técnico (MOD00_ACCESS_V2).', 'TECHNICIAN', NULL, true, true),
          (md5(concat_ws(chr(31), 'iwana', 'migration-119', canonical_tenant_id::text, 'profile', 'ACCOUNTANT'))::uuid, canonical_tenant_id, 'Acceso estándar Contable', 'Plantilla estándar Contable (MOD00_ACCESS_V2).', 'ACCOUNTANT', NULL, true, true),
          (md5(concat_ws(chr(31), 'iwana', 'migration-119', canonical_tenant_id::text, 'profile', 'HR'))::uuid, canonical_tenant_id, 'Acceso estándar RRHH', 'Plantilla estándar RRHH (MOD00_ACCESS_V2).', 'HR', NULL, true, true),
          (md5(concat_ws(chr(31), 'iwana', 'migration-119', canonical_tenant_id::text, 'profile', 'CONTRACTOR'))::uuid, canonical_tenant_id, 'Acceso estándar Contratista', 'Plantilla estándar Contratista (MOD00_ACCESS_V2).', 'CONTRACTOR', NULL, true, true),
          (md5(concat_ws(chr(31), 'iwana', 'migration-119', canonical_tenant_id::text, 'profile', 'AUDITOR'))::uuid, canonical_tenant_id, 'Acceso estándar Auditoría', 'Plantilla estándar Auditoría (MOD00_ACCESS_V2).', 'AUDITOR', NULL, true, true)
        ON CONFLICT (tenant_id, name) WHERE deleted_at IS NULL DO UPDATE
          SET description = EXCLUDED.description,
              base_role_constraint = EXCLUDED.base_role_constraint,
              scope_site_id = NULL,
              is_system = true,
              is_active = true;

        -- Asegurar permisos de plantillas V2 (limpia y reinserta set-based por perfil)
        -- ADMIN: 35 ASSIGNABLE
        PERFORM 1;
        -- Para cada plantilla, reemplazamos permisos con los de la matriz V2 correspondiente.
        -- Hacemos DELETE + INSERT por cada perfil para garantizar idempotencia.
        DELETE FROM access_profile_permissions
          WHERE tenant_id = canonical_tenant_id
            AND profile_id IN (
              SELECT id FROM access_profiles
              WHERE tenant_id = canonical_tenant_id
                AND name IN ('Administrador general','Acceso estándar NOC','Acceso estándar Soporte','Acceso estándar Comercial','Acceso estándar Técnico','Acceso estándar Contable','Acceso estándar RRHH','Acceso estándar Contratista','Acceso estándar Auditoría')
                AND is_system = true
            );

        -- Inserta permisos según matriz V2 exacta (PRD §4.3.4)
        -- ADMIN = todos ASSIGNABLE V2
        INSERT INTO access_profile_permissions (tenant_id, profile_id, permission_key)
          SELECT canonical_tenant_id, p.id, perm.permission_key
          FROM access_profiles p
          CROSS JOIN (SELECT permission_key FROM access_permission_catalog WHERE tenant_id = canonical_tenant_id AND catalog_version='MOD00_ACCESS_V2' AND availability='ASSIGNABLE' AND is_active=true) perm
          WHERE p.tenant_id = canonical_tenant_id AND p.name='Administrador general' AND p.is_system=true;

        -- NOC
        INSERT INTO access_profile_permissions (tenant_id, profile_id, permission_key)
        SELECT canonical_tenant_id, p.id, perm.key FROM access_profiles p CROSS JOIN (VALUES
          ('settings.read'),('organization.sites.read'),('wfm.schedule.read'),
          ('operations.execution_orders.read'),('operations.execution_orders.supervise'),
          ('operations.tasks.read'),('operations.tasks.manage'),
          ('crm.subscribers.read'),('crm.expedientes.read'),
          ('assurance.tickets.read'),('assurance.tickets.manage'),
          ('inventory.stock.read'),('inventory.stock.manage'),
          ('inventory.purchasing.read'),('inventory.purchasing.manage'),
          ('commercial.catalog.read')
        ) AS perm(key) WHERE p.tenant_id=canonical_tenant_id AND p.name='Acceso estándar NOC' AND p.is_system=true;

        -- SUPPORT
        INSERT INTO access_profile_permissions (tenant_id, profile_id, permission_key)
        SELECT canonical_tenant_id, p.id, perm.key FROM access_profiles p CROSS JOIN (VALUES
          ('settings.read'),('organization.sites.read'),('users.read'),('wfm.schedule.read'),
          ('operations.execution_orders.read'),('operations.tasks.read'),('operations.tasks.manage'),
          ('crm.subscribers.read'),('crm.subscribers.manage'),('crm.expedientes.read'),('crm.expedientes.manage'),
          ('assurance.tickets.read'),('assurance.tickets.manage'),
          ('inventory.stock.read'),('inventory.stock.manage'),
          ('inventory.purchasing.read'),('inventory.purchasing.manage'),
          ('commercial.catalog.read')
        ) AS perm(key) WHERE p.tenant_id=canonical_tenant_id AND p.name='Acceso estándar Soporte' AND p.is_system=true;

        -- SALES
        INSERT INTO access_profile_permissions (tenant_id, profile_id, permission_key)
        SELECT canonical_tenant_id, p.id, perm.key FROM access_profiles p CROSS JOIN (VALUES
          ('settings.read'),('organization.sites.read'),('operations.tasks.read'),('operations.tasks.manage'),
          ('crm.subscribers.read'),('crm.subscribers.manage'),('crm.expedientes.read'),('crm.expedientes.manage'),
          ('commercial.catalog.read')
        ) AS perm(key) WHERE p.tenant_id=canonical_tenant_id AND p.name='Acceso estándar Comercial' AND p.is_system=true;

        -- TECHNICIAN
        INSERT INTO access_profile_permissions (tenant_id, profile_id, permission_key)
        SELECT canonical_tenant_id, p.id, perm.key FROM access_profiles p CROSS JOIN (VALUES
          ('settings.read'),('organization.sites.read'),('wfm.schedule.read'),('wfm.work_orders.execute'),
          ('operations.execution_orders.read'),('operations.execution_orders.execute'),
          ('operations.tasks.read'),('operations.tasks.manage'),
          ('crm.subscribers.read'),('assurance.tickets.read'),('inventory.stock.read')
        ) AS perm(key) WHERE p.tenant_id=canonical_tenant_id AND p.name='Acceso estándar Técnico' AND p.is_system=true;

        -- ACCOUNTANT
        INSERT INTO access_profile_permissions (tenant_id, profile_id, permission_key)
        SELECT canonical_tenant_id, p.id, perm.key FROM access_profiles p CROSS JOIN (VALUES
          ('settings.read'),('organization.sites.read'),
          ('crm.subscribers.read'),('crm.subscribers.manage'),
          ('commercial.catalog.read'),('commercial.catalog.manage')
        ) AS perm(key) WHERE p.tenant_id=canonical_tenant_id AND p.name='Acceso estándar Contable' AND p.is_system=true;

        -- HR
        INSERT INTO access_profile_permissions (tenant_id, profile_id, permission_key)
        SELECT canonical_tenant_id, p.id, perm.key FROM access_profiles p CROSS JOIN (VALUES
          ('settings.read'),('organization.sites.read'),('users.read')
        ) AS perm(key) WHERE p.tenant_id=canonical_tenant_id AND p.name='Acceso estándar RRHH' AND p.is_system=true;

        -- CONTRACTOR
        INSERT INTO access_profile_permissions (tenant_id, profile_id, permission_key)
        SELECT canonical_tenant_id, p.id, perm.key FROM access_profiles p CROSS JOIN (VALUES
          ('settings.read'),('organization.sites.read'),('wfm.schedule.read'),('wfm.work_orders.execute'),
          ('operations.execution_orders.read'),('operations.execution_orders.execute'),('operations.tasks.read'),
          ('assurance.tickets.read')
        ) AS perm(key) WHERE p.tenant_id=canonical_tenant_id AND p.name='Acceso estándar Contratista' AND p.is_system=true;

        -- AUDITOR
        INSERT INTO access_profile_permissions (tenant_id, profile_id, permission_key)
        SELECT canonical_tenant_id, p.id, perm.key FROM access_profiles p CROSS JOIN (VALUES
          ('settings.read'),('organization.sites.read'),('users.read'),('access.permissions.read'),('access.profiles.read'),
          ('crm.subscribers.read'),('crm.expedientes.read'),('assurance.tickets.read'),('inventory.stock.read'),('inventory.purchasing.read'),('commercial.catalog.read')
        ) AS perm(key) WHERE p.tenant_id=canonical_tenant_id AND p.name='Acceso estándar Auditoría' AND p.is_system=true;

        -- ── Asignación set-based a usuarios ACTIVE no-ADMIN sin perfiles activos ──
        INSERT INTO user_access_profiles (tenant_id, user_id, profile_id, valid_from, valid_to, is_active)
        SELECT canonical_tenant_id, u.id, p.id, CURRENT_DATE, NULL, true
        FROM users u
        JOIN access_profiles p ON p.tenant_id = canonical_tenant_id AND p.name = CASE u.role
          WHEN 'NOC' THEN 'Acceso estándar NOC'
          WHEN 'SUPPORT' THEN 'Acceso estándar Soporte'
          WHEN 'SALES' THEN 'Acceso estándar Comercial'
          WHEN 'TECHNICIAN' THEN 'Acceso estándar Técnico'
          WHEN 'ACCOUNTANT' THEN 'Acceso estándar Contable'
          WHEN 'HR' THEN 'Acceso estándar RRHH'
          WHEN 'CONTRACTOR' THEN 'Acceso estándar Contratista'
          WHEN 'AUDITOR' THEN 'Acceso estándar Auditoría'
          WHEN 'ADMIN' THEN 'Administrador general'
          ELSE NULL END
        WHERE u.tenant_id = canonical_tenant_id
          AND u.status = 'ACTIVE'
          AND u.deleted_at IS NULL
          AND u.role <> 'ADMIN'
          AND u.role IN ('NOC','SUPPORT','SALES','TECHNICIAN','ACCOUNTANT','HR','CONTRACTOR','AUDITOR')
          AND NOT EXISTS (
            SELECT 1 FROM user_access_profiles uap
            WHERE uap.tenant_id = canonical_tenant_id AND uap.user_id = u.id AND uap.is_active = true
          )
        ON CONFLICT (tenant_id, user_id, profile_id) WHERE is_active = true DO NOTHING;

        -- Registrar provenance para down idempotente
        INSERT INTO access_v2_seed_119 (user_id, profile_id, tenant_id)
        SELECT uap.user_id, uap.profile_id, uap.tenant_id
        FROM user_access_profiles uap
        WHERE uap.tenant_id = canonical_tenant_id
          AND uap.is_active = true
          AND uap.profile_id IN (
            SELECT id FROM access_profiles WHERE tenant_id = canonical_tenant_id AND is_system = true
              AND name IN ('Administrador general','Acceso estándar NOC','Acceso estándar Soporte','Acceso estándar Comercial','Acceso estándar Técnico','Acceso estándar Contable','Acceso estándar RRHH','Acceso estándar Contratista','Acceso estándar Auditoría')
          )
          AND uap.user_id IN (
            SELECT id FROM users WHERE tenant_id = canonical_tenant_id AND status='ACTIVE' AND deleted_at IS NULL AND role <> 'ADMIN'
          )
          AND NOT EXISTS (SELECT 1 FROM access_v2_seed_119 s WHERE s.user_id = uap.user_id AND s.profile_id = uap.profile_id)
        ON CONFLICT (user_id, profile_id) DO NOTHING;

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
        PERFORM set_config('search_path', quote_ident(tenant_schema), true);
        SELECT id INTO canonical_tenant_id FROM public.tenants WHERE schema_name = tenant_schema;

        -- Eliminar solo asignaciones creadas por esta migración (provenance)
        DELETE FROM user_access_profiles
        WHERE tenant_id = canonical_tenant_id
          AND (user_id, profile_id) IN (SELECT user_id, profile_id FROM access_v2_seed_119 WHERE tenant_id = canonical_tenant_id);

        DELETE FROM access_v2_seed_119 WHERE tenant_id = canonical_tenant_id;

        -- Desactivar plantillas estándar V2 creadas por esta migración (no borrar legacy)
        UPDATE access_profiles SET is_active = false
        WHERE tenant_id = canonical_tenant_id
          AND is_system = true
          AND name IN ('Acceso estándar NOC','Acceso estándar Soporte','Acceso estándar Comercial','Acceso estándar Técnico','Acceso estándar Contable','Acceso estándar RRHH','Acceso estándar Contratista','Acceso estándar Auditoría');

        -- ADMIN plantilla no se desactiva en down; solo se revertirán sus permisos si corresponde.

        -- Revertir permisos de plantillas V2 al estado previo (limpia)
        DELETE FROM access_profile_permissions
        WHERE tenant_id = canonical_tenant_id
          AND profile_id IN (
            SELECT id FROM access_profiles WHERE tenant_id = canonical_tenant_id AND name IN ('Administrador general','Acceso estándar NOC','Acceso estándar Soporte','Acceso estándar Comercial','Acceso estándar Técnico','Acceso estándar Contable','Acceso estándar RRHH','Acceso estándar Contratista','Acceso estándar Auditoría')
          );

        -- Revertir catálogo: eliminar 6 claves nuevas
        DELETE FROM access_permission_catalog
        WHERE tenant_id = canonical_tenant_id
          AND permission_key IN ('crm.subscribers.read','crm.subscribers.manage','crm.expedientes.read','crm.expedientes.manage','inventory.purchasing.read','inventory.purchasing.manage')
          AND catalog_version = 'MOD00_ACCESS_V2';

        -- Revertir promociones a RESERVED + descripción antigua
        UPDATE access_permission_catalog SET availability='RESERVED', description='Ver catálogo comercial en fase futura', catalog_version='MOD00_ACCESS_V1'
          WHERE tenant_id=canonical_tenant_id AND permission_key='commercial.catalog.read';
        UPDATE access_permission_catalog SET availability='RESERVED', description='Gestionar catálogo comercial en fase futura', catalog_version='MOD00_ACCESS_V1'
          WHERE tenant_id=canonical_tenant_id AND permission_key='commercial.catalog.manage';
        UPDATE access_permission_catalog SET availability='RESERVED', description='Ver tickets/PQR en fase futura', catalog_version='MOD00_ACCESS_V1'
          WHERE tenant_id=canonical_tenant_id AND permission_key='assurance.tickets.read';
        UPDATE access_permission_catalog SET availability='RESERVED', description='Gestionar tickets/PQR en fase futura', catalog_version='MOD00_ACCESS_V1'
          WHERE tenant_id=canonical_tenant_id AND permission_key='assurance.tickets.manage';
        UPDATE access_permission_catalog SET availability='RESERVED', description='Ver inventario futuro', catalog_version='MOD00_ACCESS_V1'
          WHERE tenant_id=canonical_tenant_id AND permission_key='inventory.stock.read';
        UPDATE access_permission_catalog SET availability='RESERVED', description='Gestionar inventario futuro', catalog_version='MOD00_ACCESS_V1'
          WHERE tenant_id=canonical_tenant_id AND permission_key='inventory.stock.manage';

        -- Reactivar deprecadas con estado V1
        UPDATE access_permission_catalog SET is_active=true, availability='RESERVED', description='Ver expedientes CRM en fase futura', catalog_version='MOD00_ACCESS_V1'
          WHERE tenant_id=canonical_tenant_id AND permission_key='crm.customers.read';
        UPDATE access_permission_catalog SET is_active=true, availability='RESERVED', description='Gestionar expedientes CRM en fase futura', catalog_version='MOD00_ACCESS_V1'
          WHERE tenant_id=canonical_tenant_id AND permission_key='crm.customers.manage';

        -- Revertir billing a V1
        UPDATE access_permission_catalog SET catalog_version='MOD00_ACCESS_V1'
          WHERE tenant_id=canonical_tenant_id AND permission_key IN ('billing.payments.read','billing.payments.register','billing.invoices.read','billing.invoices.manage');

        -- Limpiar tabla provenance si queda vacía
        -- (se mantiene para idempotencia de re-ejecuciones)
      END
      $rollback$
    `);

    // Drop provenance table if empty across all tenants? Keep for idempotence.
    // Intentionally not dropping to preserve idempotencia en re-ejecuciones.
  }
}
