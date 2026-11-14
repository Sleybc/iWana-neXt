import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  AuditAction,
  BILLING_ERROR_CODES,
  BillingContractPolicyUpdateSchema,
  BillingContractPolicySchema,
  type BillingContractPolicyResponse,
  BillingPolicySchema,
  BillingPolicyPreviewRequestSchema,
  BillingPolicyUpdateSchema,
  nextBillingDates,
  type BillingContractPolicyUpdate,
  type BillingPolicy,
  type BillingPolicyPreview,
  type BillingPolicyUpdate,
} from '@iwana/shared';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { BillingContractReadPort } from '../ports/billing-contract-read.port';
import { SettingsPriorityTenantReadPort } from '../../tenant/ports/settings-priority-tenant-read.port';

type PolicyRow = {
  tenant_id: string;
  period_timing: string;
  generation_lead_days: number;
  cutoff_mode: string;
  payment_term_days: number;
  grace_days: number;
  cutoff_enabled: boolean;
  minimum_unpaid_for_cutoff: string;
  proration_method: string;
  first_period_mode: string;
  automatic_generation: boolean;
  approval_mode: string;
  auto_apply_credit: boolean;
  generation_hour: number;
  document_prefix: string;
  updated_by: string | null;
  updated_at: string;
};

type ContractPolicyRow = {
  contract_id: string;
  tenant_id: string;
  period_timing: string | null;
  generation_lead_days: number | null;
  payment_term_days: number | null;
  grace_days: number | null;
  cutoff_enabled: boolean | null;
  first_period_mode: string | null;
  billing_start_date: string | null;
  updated_by: string | null;
  updated_at: string;
};

const POLICY_COLUMNS = `tenant_id::text, period_timing, generation_lead_days, cutoff_mode,
  payment_term_days, grace_days, cutoff_enabled, minimum_unpaid_for_cutoff::text,
  proration_method, first_period_mode, automatic_generation, approval_mode,
  auto_apply_credit, generation_hour, document_prefix, updated_by::text,
  to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at`;

const CONTRACT_POLICY_COLUMNS = `contract_id::text, tenant_id::text, period_timing,
  generation_lead_days, payment_term_days, grace_days, cutoff_enabled,
  first_period_mode, billing_start_date::text, updated_by::text,
  to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at`;

function toPolicy(row: PolicyRow): BillingPolicy {
  return BillingPolicySchema.parse({
    tenantId: row.tenant_id,
    periodTiming: row.period_timing,
    generationLeadDays: row.generation_lead_days,
    cutoffMode: row.cutoff_mode,
    paymentTermDays: row.payment_term_days,
    graceDays: row.grace_days,
    cutoffEnabled: row.cutoff_enabled,
    minimumUnpaidForCutoff: row.minimum_unpaid_for_cutoff,
    prorationMethod: row.proration_method,
    firstPeriodMode: row.first_period_mode,
    automaticGeneration: row.automatic_generation,
    approvalMode: row.approval_mode,
    autoApplyCredit: row.auto_apply_credit,
    generationHour: row.generation_hour,
    documentPrefix: row.document_prefix,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  });
}

function toContractPolicy(row: ContractPolicyRow | undefined, contractId: string) {
  return BillingContractPolicySchema.parse({
    contractId,
    periodTiming: row?.period_timing ?? null,
    generationLeadDays: row?.generation_lead_days ?? null,
    paymentTermDays: row?.payment_term_days ?? null,
    graceDays: row?.grace_days ?? null,
    cutoffEnabled: row?.cutoff_enabled ?? null,
    firstPeriodMode: row?.first_period_mode ?? null,
    billingStartDate: row?.billing_start_date ?? null,
    updatedBy: row?.updated_by ?? null,
    updatedAt: row?.updated_at ?? null,
  });
}

function validationError(error: { issues: Array<{ message: string }> }): never {
  if (
    error.issues.some((issue) =>
      issue.message.includes(BILLING_ERROR_CODES.BILLING_POLICY_INCOMPATIBLE),
    )
  ) {
    throw new UnprocessableEntityException({
      code: BILLING_ERROR_CODES.BILLING_POLICY_INCOMPATIBLE,
      message: 'La combinación de momento de cobro y modo de corte no es compatible.',
    });
  }
  throw new BadRequestException({
    code: 'VALIDATION_ERROR',
    message: 'Revisa los datos enviados.',
  });
}

function policyIncompatible(): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: BILLING_ERROR_CODES.BILLING_POLICY_INCOMPATIBLE,
    message: 'La combinación de momento de cobro y modo de corte no es compatible.',
  });
}

function assertEffectivePolicyCompatible(policy: BillingPolicy): void {
  if (policy.cutoffMode === 'DIA_FIJO_CICLO' && policy.periodTiming === 'VENCIDO') {
    throw policyIncompatible();
  }
}

function tenantLocalDate(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((candidate) => candidate.type === type)?.value;
  const year = part('year');
  const month = part('month');
  const day = part('day');
  if (!year || !month || !day)
    throw new RangeError('No se pudo resolver la fecha civil del tenant.');
  return `${year}-${month}-${day}`;
}

function isForeignKeyViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('driverError' in error)) return false;
  const driverError = (error as { driverError?: unknown }).driverError;
  return (
    typeof driverError === 'object' &&
    driverError !== null &&
    'code' in driverError &&
    driverError.code === '23503'
  );
}

@Injectable()
export class BillingPolicyService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    @Inject(BillingContractReadPort)
    private readonly billingContractReadPort: BillingContractReadPort,
    @Inject(SettingsPriorityTenantReadPort)
    private readonly tenantSettingsReadPort: SettingsPriorityTenantReadPort,
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  async getPolicy(): Promise<BillingPolicy> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const rows = (await qr.query(
        `SELECT ${POLICY_COLUMNS} FROM billing_policy WHERE tenant_id = $1`,
        [tenantId],
      )) as PolicyRow[];
      const row = rows[0];
      if (!row) {
        throw new NotFoundException({
          code: 'BILLING_POLICY_NOT_FOUND',
          message: 'No hay una política de facturación configurada para esta empresa.',
        });
      }
      return toPolicy(row);
    });
  }

  async updatePolicy(input: unknown, actorId: string): Promise<BillingPolicy> {
    const parsed = BillingPolicyUpdateSchema.safeParse(input);
    if (!parsed.success) validationError(parsed.error);
    const update: BillingPolicyUpdate = parsed.data;
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    const result = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const beforeRows = (await qr.query(
        `SELECT ${POLICY_COLUMNS} FROM billing_policy WHERE tenant_id = $1 FOR UPDATE`,
        [tenantId],
      )) as PolicyRow[];
      const before = beforeRows[0];
      if (!before) {
        throw new NotFoundException({
          code: 'BILLING_POLICY_NOT_FOUND',
          message: 'No hay una política de facturación configurada para esta empresa.',
        });
      }
      if (before.updated_at !== update.expectedUpdatedAt) {
        throw this.policyChanged();
      }

      // ADR-103 D4, regla 1: DIA_FIJO_CICLO exige ANTICIPADO también en las sobrescrituras.
      if (update.cutoffMode === 'DIA_FIJO_CICLO') {
        const overridden = (await qr.query(
          `SELECT 1 FROM billing_contract_policy
            WHERE tenant_id = $1 AND period_timing = 'VENCIDO' LIMIT 1`,
          [tenantId],
        )) as unknown[];
        if (overridden.length > 0) throw policyIncompatible();
      }

      const [afterRows] = (await qr.query(
        `UPDATE billing_policy
            SET period_timing = $1,
                generation_lead_days = $2,
                cutoff_mode = $3,
                payment_term_days = $4,
                grace_days = $5,
                cutoff_enabled = $6,
                minimum_unpaid_for_cutoff = $7,
                proration_method = $8,
                first_period_mode = $9,
                automatic_generation = $10,
                approval_mode = $11,
                auto_apply_credit = $12,
                generation_hour = $13,
                document_prefix = $14,
                updated_by = $15,
                updated_at = clock_timestamp()
          WHERE tenant_id = $16
          RETURNING ${POLICY_COLUMNS}`,
        [
          update.periodTiming,
          update.generationLeadDays,
          update.cutoffMode,
          update.paymentTermDays,
          update.graceDays,
          update.cutoffEnabled,
          update.minimumUnpaidForCutoff,
          update.prorationMethod,
          update.firstPeriodMode,
          update.automaticGeneration,
          update.approvalMode,
          update.autoApplyCredit,
          update.generationHour,
          update.documentPrefix,
          actorId,
          tenantId,
        ],
      )) as [PolicyRow[], number];
      const after = afterRows[0];
      if (!after) throw this.policyChanged();

      await this.audit.logWithin(
        {
          action: AuditAction.UPDATE,
          entityType: 'BillingPolicy',
          entityId: tenantId,
          userId: actorId,
          oldValue: toPolicy(before),
          newValue: toPolicy(after),
        },
        qr.manager,
      );
      return toPolicy(after);
    });
    await this.events?.emitAsync('billing.policy.changed', { tenantId });
    return result;
  }

  async getContractPolicy(contractId: string): Promise<BillingContractPolicyResponse> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const rows = (await qr.query(
        `SELECT ${CONTRACT_POLICY_COLUMNS} FROM billing_contract_policy WHERE contract_id = $1 AND tenant_id = $2`,
        [contractId, tenantId],
      )) as ContractPolicyRow[];
      return { data: toContractPolicy(rows[0], contractId) };
    });
  }

  async updateContractPolicy(
    contractId: string,
    input: unknown,
    actorId: string,
  ): Promise<BillingContractPolicyResponse> {
    const parsed = BillingContractPolicyUpdateSchema.safeParse(input);
    if (!parsed.success) validationError(parsed.error);
    const update: BillingContractPolicyUpdate = parsed.data;
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    try {
      return await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
        const policyRows = (await qr.query(
          `SELECT ${POLICY_COLUMNS} FROM billing_policy WHERE tenant_id = $1`,
          [tenantId],
        )) as PolicyRow[];
        const policyRow = policyRows[0];
        if (!policyRow) {
          throw new NotFoundException({
            code: 'BILLING_POLICY_NOT_FOUND',
            message: 'No hay una política de facturación configurada para esta empresa.',
          });
        }
        const beforeRows = (await qr.query(
          `SELECT ${CONTRACT_POLICY_COLUMNS} FROM billing_contract_policy WHERE contract_id = $1 AND tenant_id = $2 FOR UPDATE`,
          [contractId, tenantId],
        )) as ContractPolicyRow[];
        const before = beforeRows[0];
        if (update.expectedUpdatedAt && before?.updated_at !== update.expectedUpdatedAt) {
          throw this.policyChanged();
        }
        const effectivePeriodTiming =
          update.periodTiming === undefined
            ? (before?.period_timing ?? toPolicy(policyRow).periodTiming)
            : (update.periodTiming ?? toPolicy(policyRow).periodTiming);
        const effective = {
          ...toPolicy(policyRow),
          periodTiming: effectivePeriodTiming,
        } as BillingPolicy;
        assertEffectivePolicyCompatible(effective);

        const afterRows = (await qr.query(
          `INSERT INTO billing_contract_policy (
           contract_id, tenant_id, period_timing, generation_lead_days, payment_term_days,
           grace_days, cutoff_enabled, first_period_mode, billing_start_date, updated_by, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, clock_timestamp())
         ON CONFLICT (contract_id) DO UPDATE SET
           tenant_id = EXCLUDED.tenant_id,
           period_timing = EXCLUDED.period_timing,
           generation_lead_days = EXCLUDED.generation_lead_days,
           payment_term_days = EXCLUDED.payment_term_days,
           grace_days = EXCLUDED.grace_days,
           cutoff_enabled = EXCLUDED.cutoff_enabled,
           first_period_mode = EXCLUDED.first_period_mode,
           billing_start_date = EXCLUDED.billing_start_date,
           updated_by = EXCLUDED.updated_by,
           updated_at = EXCLUDED.updated_at
         RETURNING ${CONTRACT_POLICY_COLUMNS}`,
          [
            contractId,
            tenantId,
            update.periodTiming !== undefined
              ? update.periodTiming
              : (before?.period_timing ?? null),
            update.generationLeadDays !== undefined
              ? update.generationLeadDays
              : (before?.generation_lead_days ?? null),
            update.paymentTermDays !== undefined
              ? update.paymentTermDays
              : (before?.payment_term_days ?? null),
            update.graceDays !== undefined ? update.graceDays : (before?.grace_days ?? null),
            update.cutoffEnabled !== undefined
              ? update.cutoffEnabled
              : (before?.cutoff_enabled ?? null),
            update.firstPeriodMode !== undefined
              ? update.firstPeriodMode
              : (before?.first_period_mode ?? null),
            update.billingStartDate !== undefined
              ? update.billingStartDate
              : (before?.billing_start_date ?? null),
            actorId,
          ],
        )) as ContractPolicyRow[];
        const after = afterRows[0];
        if (!after) throw new Error('La sobrescritura de política no fue guardada.');

        await this.audit.logWithin(
          {
            action: AuditAction.UPDATE,
            entityType: 'BillingContractPolicy',
            entityId: contractId,
            userId: actorId,
            oldValue: before ? toContractPolicy(before, contractId) : null,
            newValue: toContractPolicy(after, contractId),
          },
          qr.manager,
        );
        return { data: toContractPolicy(after, contractId) };
      });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new NotFoundException({
          code: 'BILLING_CONTRACT_NOT_FOUND',
          message: 'No se encontró el contrato.',
        });
      }
      throw error;
    }
  }

  async preview(input: unknown): Promise<BillingPolicyPreview> {
    const parsed = BillingPolicyPreviewRequestSchema.safeParse(input);
    if (!parsed.success) validationError(parsed.error);
    const request = parsed.data;
    const { tenantId } = TenantContext.getOrThrow();

    const contractCycle = request.contractId
      ? await this.billingContractReadPort.findBillingCycleByContractId(request.contractId)
      : null;
    if (request.contractId && !contractCycle) {
      throw new NotFoundException({
        code: 'BILLING_CONTRACT_NOT_FOUND',
        message: 'No se encontró el contrato.',
      });
    }

    const basePolicy = await this.getPolicy();
    const contractPolicy = request.contractId
      ? (await this.getContractPolicy(request.contractId)).data
      : null;
    const effectivePolicyResult = BillingPolicySchema.safeParse({
      ...basePolicy,
      periodTiming: contractPolicy?.periodTiming ?? basePolicy.periodTiming,
      generationLeadDays: contractPolicy?.generationLeadDays ?? basePolicy.generationLeadDays,
      paymentTermDays: contractPolicy?.paymentTermDays ?? basePolicy.paymentTermDays,
      graceDays: contractPolicy?.graceDays ?? basePolicy.graceDays,
      cutoffEnabled: contractPolicy?.cutoffEnabled ?? basePolicy.cutoffEnabled,
      ...request.policy,
    });
    if (!effectivePolicyResult.success) validationError(effectivePolicyResult.error);
    const effectivePolicy = effectivePolicyResult.data;
    assertEffectivePolicyCompatible(effectivePolicy);

    const cycles = request.contractId
      ? contractCycle?.cycleDay != null && contractCycle.cutoffDay != null
        ? [{ cycleDay: contractCycle.cycleDay, cutoffDay: contractCycle.cutoffDay }]
        : []
      : await this.billingContractReadPort.listBillingCycles();
    if (cycles.length === 0) return { cycles: [] };

    const { timezone } = await this.tenantSettingsReadPort.getSnapshot({ tenantId });
    const today = tenantLocalDate(new Date(), timezone);
    const previewPolicy = {
      periodTiming: effectivePolicy.periodTiming,
      generationLeadDays: effectivePolicy.generationLeadDays,
      cutoffMode: effectivePolicy.cutoffMode,
      paymentTermDays: effectivePolicy.paymentTermDays,
      graceDays: effectivePolicy.graceDays,
      cutoffEnabled: effectivePolicy.cutoffEnabled,
    };

    return {
      cycles: cycles.map(({ cycleDay, cutoffDay }) => ({
        cycleDay,
        cutoffDay,
        items: nextBillingDates({ cycleDay, cutoffDay, policy: previewPolicy, today }, 3),
      })),
    };
  }

  private policyChanged(): ConflictException {
    return new ConflictException({
      code: BILLING_ERROR_CODES.BILLING_POLICY_CHANGED,
      message:
        'Otra persona modificó la política hace un momento. Recarga la página e intenta de nuevo.',
    });
  }
}
