import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { BILLING_TERMINATED_LOOKBACK_DAYS } from '@iwana/shared';
import { DataSource, EntityManager } from 'typeorm';
import { createFiscalDocumentCrypto } from '../../../common/crypto/fiscal-document.util';
import type {
  BillableContract,
  BillableContractStatus,
  ContractVatSnapshot,
} from '../../billing/ports/billing-contract-read.port';
import { BillingContractReadPort } from '../../billing/ports/billing-contract-read.port';
import { SettingsPriorityTenantReadPort } from '../../tenant/ports/settings-priority-tenant-read.port';

type BillingContractRow = {
  contract_id: string;
  subscriber_id: string;
  party_id: string | null;
  status: BillableContractStatus;
  status_reason_code: string | null;
  terminated_at: Date | string | null;
  cycle_day: number | null;
  cutoff_day: number | null;
  start_date: Date | string | null;
  end_date: Date | string | null;
  plan_name: string | null;
  monthly_price: string | null;
  vat_snapshot: unknown;
  unbilled_additional_count: number;
  installation_fee?: string | null;
  permanence_discount?: string | null;
  display_name: string | null;
  document_type: string | null;
  address: string | null;
  rut_responsibilities: unknown;
  has_document_number: boolean;
  document_number_encrypted?: string | null;
  legacy_document_number?: string | null;
  anonymized_at: Date | string | null;
  anonymized_request_id: string | null;
};

const BILLABLE_CONTRACT_SELECT = `
  SELECT c.id::text AS contract_id,
         c.subscriber_id::text AS subscriber_id,
         s.party_id::text AS party_id,
         c.status,
         c.status_reason_code,
         c.terminated_at,
         c.billing_cycle_day AS cycle_day,
         bc.cutoff_day,
         c.start_date,
         c.end_date,
         COALESCE(c.plan_snapshot_json->>'name', c.plan_snapshot_json->>'planName') AS plan_name,
         COALESCE(c.plan_snapshot_json->>'monthlyPrice', c.plan_snapshot_json->>'basePrice') AS monthly_price,
         c.vat_snapshot,
         (CASE WHEN jsonb_typeof(c.additional_product_ids) = 'array'
               THEN jsonb_array_length(c.additional_product_ids) ELSE 0 END
          + CASE WHEN jsonb_typeof(c.additional_service_ids) = 'array'
                 THEN jsonb_array_length(c.additional_service_ids) ELSE 0 END)::int
           AS unbilled_additional_count,
         c.installation_fee::text AS installation_fee,
         (SELECT cp.discounted_amount::text
            FROM contract_permanence cp
           WHERE cp.contract_id = c.id AND cp.tenant_id = c.tenant_id AND cp.accepted = true)
           AS permanence_discount,
         COALESCE(NULLIF(c.fiscal_name, ''), NULLIF(s.business_name, ''),
                  NULLIF(concat_ws(' ', s.first_name, s.last_name), '')) AS display_name,
         s.document_type,
         COALESCE(NULLIF(c.fiscal_address, ''), NULLIF(s.address, '')) AS address,
         s.rut_responsibilities,
         (NULLIF(c.fiscal_document_encrypted, '') IS NOT NULL
          OR NULLIF(c.fiscal_document, '') IS NOT NULL) AS has_document_number,
         s.anonymized_at,
         s.anonymized_request_id`;

const READABLE_CONTRACT_FROM = `
  FROM contracts c
  JOIN subscribers s ON s.id = c.subscriber_id AND s.tenant_id = c.tenant_id
  LEFT JOIN crm_billing_cycles bc ON bc.cycle_day = c.billing_cycle_day`;

function asCivilDate(value: Date | string | null, timezone: string): string | null {
  if (value == null) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)) return value;
  const instant = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (type: string) => parts.find((candidate) => candidate.type === type)?.value;
  const year = part('year');
  const month = part('month');
  const day = part('day');
  return year && month && day ? `${year}-${month}-${day}` : null;
}

/** Las columnas PostgreSQL `date` ya son fechas civiles y no requieren zona horaria. */
function asStoredCivilDate(value: Date | string | null): string | null {
  if (value == null) return null;
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function mapVatSnapshot(value: unknown): ContractVatSnapshot | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record['treatment'] !== 'string' ||
    typeof record['legalBasis'] !== 'string' ||
    (record['ratePercent'] !== 0 && record['ratePercent'] !== 19) ||
    typeof record['requiresAccountantReview'] !== 'boolean' ||
    typeof record['resolvedAt'] !== 'string'
  ) {
    return null;
  }
  return {
    treatment: record['treatment'],
    legalBasis: record['legalBasis'],
    ratePercent: record['ratePercent'],
    requiresAccountantReview: record['requiresAccountantReview'],
    resolvedAt: record['resolvedAt'],
  };
}

@Injectable()
export class BillingContractReadAdapter extends BillingContractReadPort {
  private readonly fiscalDocumentCrypto;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    configService: ConfigService,
    private readonly tenantSettingsReadPort: SettingsPriorityTenantReadPort,
  ) {
    super();
    this.fiscalDocumentCrypto = createFiscalDocumentCrypto(configService);
  }

  async findBillableForDate(
    localDate: string,
    page: { afterContractId?: string; limit: number },
  ): Promise<BillableContract[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const { timezone } = await this.tenantSettingsReadPort.getSnapshot({ tenantId });
    const limit = Math.max(1, Math.min(200, Math.trunc(page.limit)));
    return this.withTenant(schemaName, async (manager) => {
      const rows = (await manager.query(
        `${BILLABLE_CONTRACT_SELECT}${READABLE_CONTRACT_FROM}
          WHERE c.tenant_id = $1
            AND s.tenant_id = $1
            AND c.deleted_at IS NULL
            AND s.deleted_at IS NULL
            AND s.anonymized_at IS NULL
            AND s.anonymized_request_id IS NULL
            AND c.status IN ('ACTIVE', 'SUSPENDED', 'TERMINATED', 'ARCHIVED')
            AND (c.terminated_at IS NULL OR (c.terminated_at AT TIME ZONE $5::text)::date >=
              ($2::date - $6::int))
            AND ($3::uuid IS NULL OR c.id > $3::uuid)
          ORDER BY c.id ASC
          LIMIT $4`,
        [
          tenantId,
          localDate,
          page.afterContractId ?? null,
          limit,
          timezone,
          BILLING_TERMINATED_LOOKBACK_DAYS,
        ],
      )) as BillingContractRow[];
      return rows.map((row) => this.mapRow(row, 'none', timezone));
    });
  }

  async findByContractId(
    contractId: string,
    options: { revealDocument?: boolean } = {},
  ): Promise<BillableContract | null> {
    const revealDocument = options.revealDocument ?? false;
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const { timezone } = await this.tenantSettingsReadPort.getSnapshot({ tenantId });
    return this.withTenant(schemaName, async (manager) => {
      const rows = (await manager.query(
        `${BILLABLE_CONTRACT_SELECT},
                c.fiscal_document_encrypted AS document_number_encrypted,
                c.fiscal_document AS legacy_document_number
           ${READABLE_CONTRACT_FROM}
          WHERE c.id = $1::uuid AND c.tenant_id = $2 AND s.tenant_id = $2
            AND c.deleted_at IS NULL AND s.deleted_at IS NULL
          LIMIT 1`,
        [contractId, tenantId],
      )) as BillingContractRow[];
      const row = rows[0];
      if (!row || this.isAnonymized(row)) return null;
      return this.mapRow(row, revealDocument ? 'eager' : 'lazy', timezone);
    });
  }

  async findBillingCycleByContractId(
    contractId: string,
  ): Promise<{ cycleDay: number | null; cutoffDay: number | null } | null> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return this.withTenant(schemaName, async (manager) => {
      const rows = (await manager.query(
        `SELECT c.billing_cycle_day AS cycle_day, bc.cutoff_day
           FROM contracts c
           JOIN subscribers s ON s.id = c.subscriber_id AND s.tenant_id = c.tenant_id
           LEFT JOIN crm_billing_cycles bc ON bc.cycle_day = c.billing_cycle_day
          WHERE c.id = $1::uuid AND c.tenant_id = $2 AND s.tenant_id = $2
            AND c.deleted_at IS NULL AND s.deleted_at IS NULL
            AND s.anonymized_at IS NULL AND s.anonymized_request_id IS NULL
          LIMIT 1`,
        [contractId, tenantId],
      )) as Array<{ cycle_day: number | null; cutoff_day: number | null }>;
      const row = rows[0];
      return row ? { cycleDay: row.cycle_day, cutoffDay: row.cutoff_day } : null;
    });
  }

  async listBillingCycles(): Promise<Array<{ cycleDay: number; cutoffDay: number }>> {
    const { schemaName } = TenantContext.getOrThrow();
    return this.withTenant(schemaName, async (manager) => {
      const rows = (await manager.query(
        `SELECT cycle_day, cutoff_day
           FROM crm_billing_cycles
          WHERE active = true
          ORDER BY cycle_day ASC`,
      )) as Array<{ cycle_day: number; cutoff_day: number }>;
      return rows.map(({ cycle_day, cutoff_day }) => ({
        cycleDay: cycle_day,
        cutoffDay: cutoff_day,
      }));
    });
  }

  async findTitularRefs(
    subscriberIds: string[],
  ): Promise<Array<{ subscriberId: string; partyId: string | null; anonymized: boolean }>> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    if (subscriberIds.length > 200) throw new RangeError('Máximo 200 suscriptores');
    if (subscriberIds.length === 0) return [];
    return this.withTenant(schemaName, async (manager) => {
      const rows = (await manager.query(
        `SELECT id::text AS subscriber_id, party_id::text AS party_id,
                anonymized_at, anonymized_request_id
           FROM subscribers
          WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
        [tenantId, subscriberIds],
      )) as Array<{
        subscriber_id: string;
        party_id: string | null;
        anonymized_at: Date | string | null;
        anonymized_request_id: string | null;
      }>;
      return rows.map((row) => ({
        subscriberId: row.subscriber_id,
        partyId: row.party_id,
        anonymized: this.isAnonymized(row),
      }));
    });
  }

  async findTitularDisplayNames(
    subscriberIds: string[],
  ): Promise<Array<{ subscriberId: string; displayName: string | null }>> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    if (subscriberIds.length > 200) throw new RangeError('Máximo 200 suscriptores');
    if (subscriberIds.length === 0) return [];
    return this.withTenant(schemaName, async (manager) => {
      const rows = (await manager.query(
        `SELECT id::text AS subscriber_id,
                CASE WHEN anonymized_at IS NOT NULL OR anonymized_request_id IS NOT NULL THEN NULL
                     ELSE COALESCE(NULLIF(business_name, ''),
                                    NULLIF(concat_ws(' ', first_name, last_name), '')) END AS display_name
           FROM subscribers
          WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
        [tenantId, subscriberIds],
      )) as Array<{ subscriber_id: string; display_name: string | null }>;
      return rows.map((row) => ({
        subscriberId: row.subscriber_id,
        displayName: row.display_name,
      }));
    });
  }

  async hasImpersonationSuspension(subscriberId: string): Promise<boolean> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return this.withTenant(schemaName, async (manager) => {
      const rows = (await manager.query(
        `SELECT 1
           FROM contracts
          WHERE tenant_id = $1 AND subscriber_id = $2::uuid
            AND status = 'SUSPENDED' AND status_reason_code = 'SUPLANTACION'
            AND deleted_at IS NULL
          LIMIT 1`,
        [tenantId, subscriberId],
      )) as Array<Record<string, number>>;
      return rows.length > 0;
    });
  }

  async lockTitularForBillingWrite(
    subscriberId: string,
    ctx: { manager: EntityManager },
  ): Promise<{ exists: boolean; partyId: string | null; anonymized: boolean }> {
    const { tenantId } = TenantContext.getOrThrow();
    const rows = (await ctx.manager.query(
      `SELECT party_id::text AS party_id,
              anonymized_at,
              anonymized_request_id
         FROM subscribers
        WHERE id = $1::uuid AND tenant_id = $2
        FOR SHARE`,
      [subscriberId, tenantId],
    )) as Array<{
      party_id: string | null;
      anonymized_at: Date | string | null;
      anonymized_request_id: string | null;
    }>;
    const row = rows[0];
    return {
      exists: row !== undefined,
      partyId: row?.party_id ?? null,
      anonymized: row?.anonymized_at != null || row?.anonymized_request_id != null,
    };
  }

  private async withTenant<T>(
    schemaName: string,
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return runInTenantSchema(this.dataSource, schemaName, (queryRunner) =>
      work(queryRunner.manager),
    );
  }

  private mapRow(
    row: BillingContractRow,
    document: 'none' | 'lazy' | 'eager',
    timezone: string,
  ): BillableContract {
    const rutResponsibilities = Array.isArray(row.rut_responsibilities)
      ? row.rut_responsibilities.filter((item): item is string => typeof item === 'string')
      : [];
    const readDocumentNumber = (): string | null =>
      row.document_number_encrypted
        ? this.fiscalDocumentCrypto.decrypt(row.document_number_encrypted)
        : (row.legacy_document_number ?? null);
    const documentNumber = document === 'eager' ? readDocumentNumber() : null;

    return {
      contractId: row.contract_id,
      subscriberId: row.subscriber_id,
      partyId: row.party_id,
      status: row.status,
      statusReasonCode: row.status_reason_code,
      terminatedAt: asCivilDate(row.terminated_at, timezone),
      cycleDay: row.cycle_day,
      cutoffDay: row.cutoff_day,
      activatedAt: asStoredCivilDate(row.start_date),
      endDate: asStoredCivilDate(row.end_date),
      planName: row.plan_name,
      monthlyPrice: row.monthly_price,
      vatSnapshot: mapVatSnapshot(row.vat_snapshot),
      unbilledAdditionalCount: row.unbilled_additional_count,
      installationFee: row.installation_fee ?? null,
      permanenceDiscount: row.permanence_discount ?? null,
      buyer: {
        displayName: row.display_name ?? 'Titular',
        documentType: row.document_type,
        documentNumber,
        hasDocumentNumber: row.has_document_number === true,
        ...(document === 'lazy' ? { revealDocumentNumber: readDocumentNumber } : {}),
        address: row.address,
        rutResponsibilities: rutResponsibilities.length > 0 ? rutResponsibilities : ['R-99-PN'],
      },
    };
  }

  private isAnonymized(row: Pick<BillingContractRow, 'anonymized_at' | 'anonymized_request_id'>) {
    return row.anonymized_at != null || row.anonymized_request_id != null;
  }
}
