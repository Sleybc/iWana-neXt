import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración tenant 187 — aviso de contrato pendiente de firma (cierre de venta, bloque F;
 * ADR-109 D3, spec G5, CA-5).
 *
 * 1. Siembra `crm.contracts.pending_signature.notify` en el catálogo y lo concede por defecto
 *    a las plantillas estándar Contable (ACCOUNTANT) y NOC, más Administración (la plantilla
 *    ADMIN recibe todo permiso asignable). Configurable por rol como cualquier otra clave.
 * 2. Crea `contract_pending_signature_alerts`: libro de avisos enviados, uno por contrato y
 *    umbral (`threshold_hours`), que hace idempotente el trabajo diario. Sin PII: solo ids,
 *    umbral, fecha y cantidad de destinatarios.
 *
 * down: la clave es nueva, así que retira catálogo y asignaciones; borra el libro. Perder el
 * libro solo provoca que un aviso se repita una vez; no hay dato de negocio que reconstruir.
 */
export class ContractPendingSignatureNotify1870000000187 implements MigrationInterface {
  name = 'ContractPendingSignatureNotify1870000000187';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $migration$
      DECLARE
        tenant_schema TEXT := current_schema();
        canonical_tenant_id UUID;
        tenant_count INTEGER;
      BEGIN
        IF tenant_schema IS NULL OR tenant_schema !~ '^tenant_[a-z][a-z0-9_]{0,54}$' THEN
          RAISE EXCEPTION 'La migración 187 solo puede ejecutarse sobre un schema tenant válido';
        END IF;

        PERFORM set_config('search_path', quote_ident(tenant_schema), true);
        SELECT COUNT(*) INTO tenant_count
        FROM public.tenants
        WHERE schema_name = tenant_schema;
        IF tenant_count <> 1 THEN
          RAISE EXCEPTION 'Se esperaba exactamente un tenant canónico para el schema actual';
        END IF;
        SELECT id INTO canonical_tenant_id
        FROM public.tenants
        WHERE schema_name = tenant_schema;

        INSERT INTO access_permission_catalog
          (tenant_id, permission_key, module_key, action, description, catalog_version,
           availability, is_system, is_active)
        VALUES
          (canonical_tenant_id, 'crm.contracts.pending_signature.notify', 'crm',
           'pending_signature.notify',
           'Recibir el aviso de contratos con servicio activo pendientes de firma',
           'MOD00_ACCESS_V2', 'ASSIGNABLE', true, true)
        ON CONFLICT (tenant_id, permission_key) DO UPDATE
          SET module_key = EXCLUDED.module_key,
              action = EXCLUDED.action,
              description = EXCLUDED.description,
              catalog_version = EXCLUDED.catalog_version,
              availability = EXCLUDED.availability,
              is_system = true,
              is_active = true;

        INSERT INTO access_profile_permissions (tenant_id, profile_id, permission_key)
        SELECT canonical_tenant_id, profile.id, 'crm.contracts.pending_signature.notify'
        FROM access_profiles profile
        WHERE profile.tenant_id = canonical_tenant_id
          AND profile.is_system = true
          AND profile.deleted_at IS NULL
          AND (profile.name, profile.base_role_constraint) IN (
            ('Administrador general', 'ADMIN'),
            ('Acceso estándar Contable', 'ACCOUNTANT'),
            ('Acceso estándar NOC', 'NOC')
          )
        ON CONFLICT (tenant_id, profile_id, permission_key) DO NOTHING;
      END
      $migration$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contract_pending_signature_alerts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        contract_id uuid NOT NULL REFERENCES contracts (id) ON DELETE CASCADE,
        threshold_hours smallint NOT NULL,
        recipients_count integer NOT NULL,
        notified_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_cpsa_threshold CHECK (threshold_hours > 0),
        CONSTRAINT chk_cpsa_recipients CHECK (recipients_count >= 0),
        CONSTRAINT uq_cpsa_contract_threshold UNIQUE (tenant_id, contract_id, threshold_hours)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS contract_pending_signature_alerts`);
    await queryRunner.query(`
      DO $rollback$
      DECLARE
        tenant_schema TEXT := current_schema();
        canonical_tenant_id UUID;
      BEGIN
        SELECT id INTO canonical_tenant_id
        FROM public.tenants
        WHERE schema_name = tenant_schema;
        IF canonical_tenant_id IS NULL THEN
          RETURN;
        END IF;

        DELETE FROM access_profile_permissions
        WHERE tenant_id = canonical_tenant_id
          AND permission_key = 'crm.contracts.pending_signature.notify';

        DELETE FROM access_permission_catalog
        WHERE tenant_id = canonical_tenant_id
          AND permission_key = 'crm.contracts.pending_signature.notify';
      END
      $rollback$
    `);
  }
}
