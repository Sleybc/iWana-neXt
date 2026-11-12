import { DataSource } from 'typeorm';
import { createBillingTenantFixture } from '../../../../../packages/database/src/migrations/tenant/billing-migration.integration-helpers';
import { BillingCore1730000000173 } from '../../../../../packages/database/src/migrations/tenant/173_billing_core';
import { BillingLineKindInstallation1930000000193 } from '../../../../../packages/database/src/migrations/tenant/193_billing_line_kind_installation';
import { BillingImportedDocuments1970000000197 } from '../../../../../packages/database/src/migrations/tenant/197_billing_imported_documents';
import { BillingAdditionalLines2020000000202 } from '../../../../../packages/database/src/migrations/tenant/202_billing_additional_lines';
import { BillingCourtesies2030000000203 } from '../../../../../packages/database/src/migrations/tenant/203_billing_courtesies';

/** Billing siempre se crea con la 173 real (más 193 y 197); las tablas mínimas de CRM son del fixture del adaptador. */
export async function createBillingSchema(dataSource: DataSource) {
  const fixture = await createBillingTenantFixture(dataSource, 'tenant_billing173');
  const qr = fixture.queryRunner;
  try {
    await qr.startTransaction();
    await qr.query(`SET LOCAL search_path TO "${fixture.schemaName}", public`);
    await qr.query(`
        CREATE TABLE subscribers (
          id uuid PRIMARY KEY,
          tenant_id uuid NOT NULL,
          party_id uuid NULL,
          person_type varchar(20) NOT NULL,
          document_type varchar(20) NULL,
          first_name varchar(300) NULL,
          last_name varchar(300) NULL,
          business_name varchar(300) NULL,
          address varchar(500) NULL,
          rut_responsibilities text[] NOT NULL DEFAULT '{}',
          anonymized_at timestamptz NULL,
          anonymized_request_id uuid NULL,
          deleted_at timestamptz NULL
        );
        CREATE TABLE crm_billing_cycles (
          cycle_day smallint PRIMARY KEY,
          cutoff_day smallint NOT NULL,
          active boolean NOT NULL DEFAULT true
        );
        INSERT INTO crm_billing_cycles (cycle_day, cutoff_day) VALUES (5, 20), (15, 30), (1, 15);
        CREATE TABLE contracts (
          id uuid PRIMARY KEY,
          tenant_id uuid NOT NULL,
          subscriber_id uuid NOT NULL,
          status varchar(20) NOT NULL,
          status_reason_code varchar(40) NULL,
          terminated_at timestamptz NULL,
          billing_cycle_day smallint NULL,
          start_date date NULL,
          end_date date NULL,
          plan_snapshot_json jsonb NOT NULL,
          vat_snapshot jsonb NULL,
          fiscal_name varchar(200) NULL,
          fiscal_address varchar(255) NULL,
          fiscal_document varchar(30) NULL,
          fiscal_document_encrypted varchar(500) NULL,
          additional_product_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
          additional_service_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
          installation_fee numeric(14,2) NULL,
          installation_vat_snapshot jsonb NULL,
          additional_vat_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
          customer_segment varchar(20) NULL,
          deleted_at timestamptz NULL
        );
        -- Mínimo del catálogo MOD06 que lee el relleno de la 202 (bloque C).
        CREATE TABLE catalog_items (
          id uuid PRIMARY KEY, tenant_id uuid NOT NULL, type varchar(20) NOT NULL,
          name varchar(200) NOT NULL
        );
        CREATE TABLE catalog_price_history (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(), item_id uuid NOT NULL,
          tenant_id uuid NOT NULL, customer_segment varchar(30) NOT NULL,
          base_price numeric(14,2) NOT NULL, is_current boolean NOT NULL DEFAULT true,
          valid_from timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE contract_permanence (
          contract_id uuid PRIMARY KEY REFERENCES contracts(id) ON DELETE CASCADE,
          tenant_id uuid NOT NULL,
          accepted boolean NOT NULL,
          months smallint NULL,
          connection_fee numeric(14,2) NULL,
          discounted_amount numeric(14,2) NULL
        );
      `);
    await new BillingCore1730000000173().up(qr);
    await new BillingLineKindInstallation1930000000193().up(qr);
    await new BillingImportedDocuments1970000000197().up(qr);
    await new BillingAdditionalLines2020000000202().up(qr);
    // Cortesías (bloque D): el saldo de los documentos resta sus ajustes activos.
    await new BillingCourtesies2030000000203().up(qr);
    await qr.commitTransaction();
  } catch (error) {
    await qr.rollbackTransaction();
    throw error;
  } finally {
    await qr.release();
  }
  return fixture;
}
