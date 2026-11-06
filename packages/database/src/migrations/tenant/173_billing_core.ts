import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración tenant 173: tablas base del módulo de Facturación (MOD14, HLD §3.1).
 * Crea el modelo de política, periodos, documentos de cobro, líneas, pagos,
 * aplicaciones y señales de periodo pagado, y siembra la política por defecto
 * aprobada en G0 para el tenant.
 */
export class BillingCore1730000000173 implements MigrationInterface {
  name = 'BillingCore1730000000173';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS billing_policy (
        tenant_id uuid PRIMARY KEY,
        period_timing varchar(12) NOT NULL DEFAULT 'ANTICIPADO' CHECK (period_timing IN ('ANTICIPADO','VENCIDO')),
        generation_lead_days smallint NOT NULL DEFAULT 0 CHECK (generation_lead_days BETWEEN 0 AND 15),
        cutoff_mode varchar(24) NOT NULL DEFAULT 'DIA_FIJO_CICLO' CHECK (cutoff_mode IN ('DIA_FIJO_CICLO','VENCIMIENTO_MAS_GRACIA')),
        payment_term_days smallint NOT NULL DEFAULT 14 CHECK (payment_term_days BETWEEN 0 AND 60),
        grace_days smallint NOT NULL DEFAULT 0 CHECK (grace_days BETWEEN 0 AND 30),
        cutoff_enabled boolean NOT NULL DEFAULT true,
        minimum_unpaid_for_cutoff numeric(14,2) NOT NULL DEFAULT 0 CHECK (minimum_unpaid_for_cutoff >= 0),
        proration_method varchar(12) NOT NULL DEFAULT 'DIAS_REALES' CHECK (proration_method IN ('DIAS_REALES','MES_30')),
        first_period_mode varchar(20) NOT NULL DEFAULT 'SEPARADO' CHECK (first_period_mode IN ('SEPARADO','JUNTO_AL_SIGUIENTE')),
        automatic_generation boolean NOT NULL DEFAULT false,
        approval_mode varchar(12) NOT NULL DEFAULT 'BORRADOR' CHECK (approval_mode IN ('BORRADOR','AUTOMATICA')),
        auto_apply_credit boolean NOT NULL DEFAULT true,
        generation_hour smallint NOT NULL DEFAULT 6 CHECK (generation_hour BETWEEN 0 AND 23),
        document_prefix varchar(10) NOT NULL DEFAULT 'DC',
        updated_by uuid NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK (NOT (cutoff_mode = 'DIA_FIJO_CICLO' AND period_timing = 'VENCIDO'))
      );

      CREATE TABLE IF NOT EXISTS billing_contract_policy (
        contract_id uuid PRIMARY KEY REFERENCES contracts(id) ON DELETE CASCADE,
        tenant_id uuid NOT NULL,
        period_timing varchar(12) NULL CHECK (period_timing IS NULL OR period_timing IN ('ANTICIPADO','VENCIDO')),
        generation_lead_days smallint NULL CHECK (generation_lead_days IS NULL OR generation_lead_days BETWEEN 0 AND 15),
        payment_term_days smallint NULL CHECK (payment_term_days IS NULL OR payment_term_days BETWEEN 0 AND 60),
        grace_days smallint NULL CHECK (grace_days IS NULL OR grace_days BETWEEN 0 AND 30),
        cutoff_enabled boolean NULL,
        first_period_mode varchar(20) NULL CHECK (first_period_mode IS NULL OR first_period_mode IN ('SEPARADO','JUNTO_AL_SIGUIENTE')),
        billing_start_date date NULL,
        updated_by uuid NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS billing_periods (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        contract_id uuid NOT NULL REFERENCES contracts(id),
        subscriber_id uuid NOT NULL,
        period_start date NOT NULL,
        period_end date NOT NULL,
        covered_start date NOT NULL,
        generation_date date NOT NULL,
        due_date date NOT NULL,
        cutoff_date date NULL,
        effective_policy jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (contract_id, period_start)
      );

      CREATE TABLE IF NOT EXISTS billing_documents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        period_id uuid NOT NULL REFERENCES billing_periods(id),
        contract_id uuid NOT NULL,
        subscriber_id uuid NOT NULL,
        status varchar(10) NOT NULL CHECK (status IN ('BORRADOR','EMITIDO','ANULADO')),
        number varchar(30) NULL,
        issue_date date NULL,
        due_date date NOT NULL,
        subtotal numeric(14,2) NOT NULL,
        tax_total numeric(14,2) NOT NULL,
        total numeric(14,2) NOT NULL,
        blocking_reason varchar(60) NULL,
        buyer_snapshot jsonb NULL,
        issuer_snapshot jsonb NULL,
        buyer_document_encrypted varchar(500) NULL,
        unbilled_additional_count smallint NOT NULL DEFAULT 0,
        CONSTRAINT chk_billing_documents_buyer_snapshot_no_document_number
          CHECK (buyer_snapshot IS NULL OR NOT (buyer_snapshot ? 'documentNumber')),
        CONSTRAINT chk_billing_documents_unbilled_additional_count_non_negative
          CHECK (unbilled_additional_count >= 0),
        void_reason_code varchar(40) NULL,
        void_note varchar(500) NULL,
        voided_at timestamptz NULL,
        voided_by uuid NULL,
        created_by uuid NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, number)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_documents_period_live
        ON billing_documents (period_id)
        WHERE status <> 'ANULADO';

      CREATE INDEX IF NOT EXISTS idx_billing_documents_subscriber
        ON billing_documents (subscriber_id, status);

      CREATE TABLE IF NOT EXISTS billing_document_lines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        document_id uuid NOT NULL REFERENCES billing_documents(id) ON DELETE CASCADE,
        kind varchar(16) NOT NULL CHECK (kind IN ('PLAN','ADICIONAL','PRORRATEO')),
        description varchar(200) NOT NULL,
        quantity numeric(10,4) NOT NULL,
        unit_price numeric(14,2) NOT NULL,
        base_amount numeric(14,2) NOT NULL,
        tax_amount numeric(14,2) NOT NULL,
        total numeric(14,2) NOT NULL,
        vat_treatment varchar(16) NOT NULL,
        vat_rate numeric(7,4) NOT NULL,
        vat_legal_basis varchar(60) NULL,
        position smallint NOT NULL
      );

      CREATE TABLE IF NOT EXISTS billing_payments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        subscriber_id uuid NOT NULL,
        method varchar(20) NOT NULL CHECK (method IN ('EFECTIVO','TRANSFERENCIA','CONSIGNACION','DATAFONO','OTRO')),
        amount numeric(14,2) NOT NULL CHECK (amount > 0),
        paid_at date NOT NULL,
        reference varchar(80) NULL,
        note varchar(500) NULL,
        idempotency_key varchar(80) NOT NULL,
        allocations_fingerprint char(64) NULL,
        status varchar(10) NOT NULL DEFAULT 'REGISTRADO' CHECK (status IN ('REGISTRADO','ANULADO')),
        void_reason_code varchar(40) NULL,
        void_note varchar(500) NULL,
        voided_at timestamptz NULL,
        voided_by uuid NULL,
        created_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, idempotency_key)
      );

      CREATE TABLE IF NOT EXISTS billing_payment_allocations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        payment_id uuid NOT NULL REFERENCES billing_payments(id),
        document_id uuid NOT NULL REFERENCES billing_documents(id),
        amount numeric(14,2) NOT NULL CHECK (amount > 0),
        reversed_at timestamptz NULL,
        reversed_by uuid NULL,
        created_by uuid NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_billing_allocations_document
        ON billing_payment_allocations (document_id)
        WHERE reversed_at IS NULL;

      CREATE INDEX IF NOT EXISTS idx_billing_allocations_payment
        ON billing_payment_allocations (payment_id)
        WHERE reversed_at IS NULL;

      CREATE TABLE IF NOT EXISTS billing_period_signals (
        period_id uuid PRIMARY KEY REFERENCES billing_periods(id),
        tenant_id uuid NOT NULL,
        paid boolean NOT NULL,
        changed_at timestamptz NOT NULL DEFAULT now()
      );

      -- Siembra de la política por defecto aprobada en G0 para el tenant actual
      INSERT INTO billing_policy (
        tenant_id, period_timing, generation_lead_days, cutoff_mode,
        payment_term_days, grace_days, cutoff_enabled, minimum_unpaid_for_cutoff,
        proration_method, first_period_mode, automatic_generation, approval_mode,
        auto_apply_credit, generation_hour, document_prefix
      )
      SELECT id, 'ANTICIPADO', 0, 'DIA_FIJO_CICLO', 14, 0, true, 0, 'DIAS_REALES',
             'SEPARADO', false, 'BORRADOR', true, 6, 'DC'
      FROM public.tenants
      WHERE schema_name = current_schema()
      ON CONFLICT (tenant_id) DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS billing_period_signals;
      DROP TABLE IF EXISTS billing_payment_allocations;
      DROP TABLE IF EXISTS billing_payments;
      DROP TABLE IF EXISTS billing_document_lines;
      DROP TABLE IF EXISTS billing_documents;
      DROP TABLE IF EXISTS billing_periods;
      DROP TABLE IF EXISTS billing_contract_policy;
      DROP TABLE IF EXISTS billing_policy;
    `);
  }
}
