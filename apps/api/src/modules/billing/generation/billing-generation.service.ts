import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  addDays,
  computeBillingPeriod,
  computeGenerationDate,
  computeDueAndCutoff,
  diffInDays,
  resolveCatalogItemVat,
  resolveGenerationTarget,
  shiftLateDueAndCutoff,
  type BillingBlockingReason,
  type BillingProrationMethod,
  type BillingGenerationSummary,
} from '@iwana/shared';
import { IPrivacyMarksReadPort } from '../../privacy/ports/privacy-marks-read.port';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { DataSource, EntityManager } from 'typeorm';
import { AuditAction } from '@iwana/shared';
import { AuditService } from '../../audit/audit.service';
import { SettingsPriorityTenantReadPort } from '../../tenant/ports/settings-priority-tenant-read.port';
import {
  BillingContractReadPort,
  type BillableContract,
} from '../ports/billing-contract-read.port';
import { BillingDocumentsService } from '../documents/billing-documents.service';
import type { PeriodEvent } from '../payments/billing-payments.service';
import {
  buildAdditionalLine,
  buildInstallationLine,
  buildPlanLine,
  type BillingLineValue,
} from './billing-generation.math';

interface BillingPolicyRow {
  period_timing: 'ANTICIPADO' | 'VENCIDO';
  generation_lead_days: number;
  cutoff_mode: 'DIA_FIJO_CICLO' | 'VENCIMIENTO_MAS_GRACIA';
  payment_term_days: number;
  grace_days: number;
  cutoff_enabled: boolean;
  proration_method: BillingProrationMethod;
  first_period_mode: 'SEPARADO' | 'JUNTO_AL_SIGUIENTE';
  automatic_generation: boolean;
  approval_mode: 'BORRADOR' | 'AUTOMATICA';
  generation_hour: number;
  document_prefix: string;
}

interface ContractPolicyRow {
  period_timing: 'ANTICIPADO' | 'VENCIDO' | null;
  generation_lead_days: number | null;
  payment_term_days: number | null;
  grace_days: number | null;
  cutoff_enabled: boolean | null;
  first_period_mode: 'SEPARADO' | 'JUNTO_AL_SIGUIENTE' | null;
  billing_start_date: string | null;
}

const PAGE_SIZE = 200;
const CATCH_UP_MAX_PERIODS = 24;

function emptySummary(): BillingGenerationSummary {
  return {
    generated: 0,
    failed: 0,
    notDue: 0,
    existing: 0,
    omittedImpersonation: 0,
    omittedTermination: 0,
    blocked: 0,
    withoutCycle: 0,
    unbilledAdditionalDocuments: 0,
  };
}

function money(value: number): string {
  return (Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2);
}

function civilDate(value: string | Date): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

/** Inicio del periodo inmediatamente anterior al que arranca en `periodStart` (día de ciclo 1-28). */
function previousPeriodStart(cycleDay: number, periodStart: string): string {
  const year = Number(periodStart.slice(0, 4));
  const month = Number(periodStart.slice(5, 7));
  return month === 1
    ? computeBillingPeriod(cycleDay, year - 1, 12).periodStart
    : computeBillingPeriod(cycleDay, year, month - 1).periodStart;
}

/** Motivo que impide emitir el borrador de este contrato (RF-FAC-15); null si se puede emitir. */
export function draftBlockingReason(contract: BillableContract): BillingBlockingReason | null {
  return !contract.monthlyPrice
    ? 'SIN_PRECIO'
    : !contract.vatSnapshot
      ? 'SIN_TRATAMIENTO_IVA'
      : !contract.buyer.displayName ||
          !contract.buyer.documentType ||
          !contract.buyer.hasDocumentNumber
        ? 'SIN_DATOS_FISCALES'
        : null;
}

/** Periodo del ciclo que contiene la fecha civil `date` (día de ciclo 1-28). */
export function periodContaining(cycleDay: number, date: string) {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  if (day >= cycleDay) return computeBillingPeriod(cycleDay, year, month);
  return month === 1
    ? computeBillingPeriod(cycleDay, year - 1, 12)
    : computeBillingPeriod(cycleDay, year, month - 1);
}

export function localDateFor(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (key: string) => parts.find((value) => value.type === key)?.value;
  const year = part('year');
  const month = part('month');
  const day = part('day');
  if (!year || !month || !day) throw new RangeError('No se resolvió la fecha civil del tenant.');
  return `${year}-${month}-${day}`;
}

@Injectable()
export class BillingGenerationService {
  private readonly logger = new Logger(BillingGenerationService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly contracts: BillingContractReadPort,
    private readonly tenantSettings: SettingsPriorityTenantReadPort,
    private readonly documents: BillingDocumentsService,
    private readonly audit: AuditService,
    @Inject(IPrivacyMarksReadPort) private readonly privacyMarks: IPrivacyMarksReadPort,
  ) {}

  async generate(
    input: {
      date?: string;
      contractId?: string;
      actorId?: string | null;
      /**
       * Primer cobro por activación (ADR-109 D6): ancla el periodo objetivo en esta
       * fecha civil en lugar del lote del día. Exige `contractId`. Si el contrato ya
       * tiene cualquier periodo, devuelve `existing` (idempotente por contrato y periodo).
       */
      firstChargeFrom?: string;
      /**
       * Puesta al día del primer cobro (spec 2026-11-11 R3): genera el periodo del ciclo que
       * empieza en esta fecha civil sin esperar al lote y sin regenerar uno existente. Exige
       * `contractId`; quien llama decide qué periodos ya vencieron (`pendingCatchUpPeriods`).
       */
      targetPeriodStart?: string;
    } = {},
  ): Promise<BillingGenerationSummary> {
    const context = TenantContext.getOrThrow();
    const settings = await this.tenantSettings.getSnapshot({ tenantId: context.tenantId });
    const localDate = input.date ?? localDateFor(new Date(), settings.timezone);
    const candidates = await this.loadCandidates(localDate, input.contractId);
    const parties = [
      ...new Set(candidates.map(({ partyId }) => partyId).filter((id): id is string => !!id)),
    ];
    const marks = parties.length ? await this.privacyMarks.activeMarks(parties) : {};
    const summary = emptySummary();

    for (const candidate of candidates) {
      if (
        (candidate.status === 'SUSPENDED' && candidate.statusReasonCode === 'SUPLANTACION') ||
        (candidate.partyId && marks[candidate.partyId]?.includes('VICTIMA_FALSEDAD_PERSONAL'))
      ) {
        summary.omittedImpersonation += 1;
        continue;
      }

      try {
        // Puertos fuera de la transacción para no agotar el pool bajo advisory locks.
        // El documento fiscal no se descifra aquí: solo se descifra el que se vaya a emitir.
        const prepared = await this.documents.prepareIssue(candidate.contractId, {
          revealDocument: false,
        });
        const fullContract = prepared.contract ?? candidate;
        const events: PeriodEvent[] = [];
        const outcome = await runInTenantSchema(this.dataSource, context.schemaName, (qr) =>
          this.generateOne(
            qr.manager,
            context.tenantId,
            fullContract,
            localDate,
            input.actorId ?? null,
            !!input.contractId && !input.firstChargeFrom && !input.targetPeriodStart,
            prepared,
            events,
            input.contractId ? input.firstChargeFrom : undefined,
            input.contractId && !input.firstChargeFrom ? input.targetPeriodStart : undefined,
          ),
        );
        await this.documents.publishEvents(events);
        summary[outcome] += 1;
        if (outcome === 'generated' && candidate.unbilledAdditionalCount > 0)
          summary.unbilledAdditionalDocuments += 1;
      } catch {
        summary.failed += 1;
        this.logger.warn('Falló la generación de un contrato; el lote continúa.');
      }
    }
    return summary;
  }

  /** El contrato ya tiene al menos un periodo de cobro (spec 2026-11-11 R1). */
  async hasAnyPeriod(contractId: string): Promise<boolean> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const rows = (await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.query('SELECT 1 FROM billing_periods WHERE tenant_id = $1 AND contract_id = $2 LIMIT 1', [
        tenantId,
        contractId,
      ]),
    )) as unknown[];
    return rows.length > 0;
  }

  /**
   * Todos los documentos del contrato siguen en BORRADOR (sin emitidos ni anulados). Los
   * IMPORTADO de UISP (ADR-110 D5) no cuentan: no impiden congelar instalación ni datos
   * fiscales en el primer cobro propio.
   */
  async onlyDraftDocuments(contractId: string): Promise<boolean> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const rows = (await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.query(
        `SELECT 1 FROM billing_documents
          WHERE tenant_id = $1 AND contract_id = $2 AND status NOT IN ('BORRADOR', 'IMPORTADO')
          LIMIT 1`,
        [tenantId, contractId],
      ),
    )) as unknown[];
    return rows.length === 0;
  }

  /**
   * Regulariza los borradores existentes del contrato (spec 2026-11-11 R7/R8):
   * - Un borrador bloqueado por SIN_DATOS_FISCALES se re-evalúa con los datos fiscales actuales
   *   del contrato (misma regla que la generación).
   * - Un periodo sin documentos emitidos cuyo vencimiento es anterior a su fecha de generación
   *   vence en generación + plazo de pago (política congelada) y su corte se corre igual; los
   *   borradores del periodo toman el nuevo vencimiento.
   * Nunca toca documentos emitidos ni anulados. Cada borrador cambiado queda auditado.
   */
  async regularizeDrafts(
    contractId: string,
    actorId: string | null,
  ): Promise<{ unblocked: number; rescheduled: number }> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    // Puerto fuera de la transacción: abre su propia conexión.
    const contract = await this.contracts.findByContractId(contractId, { revealDocument: false });
    const blocking = contract ? draftBlockingReason(contract) : null;
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const rows = (await qr.manager.query(
        `SELECT d.id::text AS document_id, d.blocking_reason, d.due_date::text AS document_due,
                p.id::text AS period_id, p.generation_date::text AS generation_date,
                p.due_date::text AS due_date, p.cutoff_date::text AS cutoff_date,
                p.effective_policy,
                EXISTS (SELECT 1 FROM billing_documents x
                         WHERE x.tenant_id = p.tenant_id AND x.period_id = p.id
                           AND x.status = 'EMITIDO') AS has_issued
           FROM billing_documents d
           JOIN billing_periods p ON p.id = d.period_id AND p.tenant_id = d.tenant_id
          WHERE d.tenant_id = $1 AND d.contract_id = $2 AND d.status = 'BORRADOR'
          ORDER BY p.period_start, d.id
          FOR UPDATE OF d, p`,
        [tenantId, contractId],
      )) as Array<{
        document_id: string;
        blocking_reason: BillingBlockingReason | null;
        document_due: string;
        period_id: string;
        generation_date: string;
        due_date: string;
        cutoff_date: string | null;
        effective_policy: Partial<BillingPolicyRow>;
        has_issued: boolean;
      }>;
      const rescheduledPeriods = new Map<string, { dueDate: string; cutoffDate: string | null }>();
      let unblocked = 0;
      let rescheduled = 0;
      for (const row of rows) {
        let dates = rescheduledPeriods.get(row.period_id);
        if (!dates && !row.has_issued) {
          const shifted = shiftLateDueAndCutoff(
            { dueDate: civilDate(row.due_date), cutoffDate: row.cutoff_date },
            civilDate(row.generation_date),
            Number(row.effective_policy.payment_term_days ?? 0),
          );
          if (shifted.dueDate !== civilDate(row.due_date)) {
            await qr.manager.query(
              `UPDATE billing_periods SET due_date = $3::date, cutoff_date = $4::date
                WHERE tenant_id = $1 AND id = $2`,
              [tenantId, row.period_id, shifted.dueDate, shifted.cutoffDate],
            );
            rescheduledPeriods.set(row.period_id, shifted);
            dates = shifted;
          }
        }
        const nextDue =
          dates && civilDate(row.document_due) !== dates.dueDate ? dates.dueDate : null;
        const nextBlocking =
          contract &&
          row.blocking_reason === 'SIN_DATOS_FISCALES' &&
          blocking !== 'SIN_DATOS_FISCALES'
            ? blocking
            : row.blocking_reason;
        const unblocks = nextBlocking !== row.blocking_reason;
        if (!nextDue && !unblocks) continue;
        await qr.manager.query(
          `UPDATE billing_documents
              SET blocking_reason = $3, due_date = COALESCE($4::date, due_date), updated_at = now()
            WHERE tenant_id = $1 AND id = $2 AND status = 'BORRADOR'`,
          [tenantId, row.document_id, nextBlocking, nextDue],
        );
        await this.audit.logWithin(
          {
            action: AuditAction.UPDATE,
            entityType: 'BillingDocument',
            entityId: row.document_id,
            userId: actorId,
            oldValue: {
              blockingReason: row.blocking_reason,
              dueDate: civilDate(row.document_due),
            },
            newValue: {
              blockingReason: nextBlocking,
              dueDate: nextDue ?? civilDate(row.document_due),
              reason: 'PRIMER_COBRO_CONTRATO_HEREDADO',
            },
          },
          qr.manager,
        );
        if (unblocks) unblocked += 1;
        if (nextDue) rescheduled += 1;
      }
      return { unblocked, rescheduled };
    });
  }

  /**
   * Inicios de los periodos posteriores al último generado del contrato cuya generación ya
   * llegó en `localDate` según la política efectiva (tenant + override del contrato). Sin
   * periodos previos devuelve vacío: el primero lo ancla `firstChargeFrom`.
   */
  async pendingCatchUpPeriods(
    contractId: string,
    cycleDay: number,
    localDate: string,
  ): Promise<string[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const rows = (await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.query(
        `SELECT COALESCE(cp.period_timing, p.period_timing) AS period_timing,
                COALESCE(cp.generation_lead_days, p.generation_lead_days) AS generation_lead_days,
                (SELECT MAX(bp.period_start)::text FROM billing_periods bp
                  WHERE bp.tenant_id = $1 AND bp.contract_id = $2) AS last_start
           FROM billing_policy p
           LEFT JOIN billing_contract_policy cp
             ON cp.tenant_id = p.tenant_id AND cp.contract_id = $2
          WHERE p.tenant_id = $1`,
        [tenantId, contractId],
      ),
    )) as Array<{
      period_timing: 'ANTICIPADO' | 'VENCIDO';
      generation_lead_days: number;
      last_start: string | null;
    }>;
    const row = rows[0];
    if (!row?.last_start) return [];
    const current = resolveGenerationTarget(
      cycleDay,
      { periodTiming: row.period_timing, generationLeadDays: row.generation_lead_days },
      localDate,
    );
    const starts: string[] = [];
    let cursor = periodContaining(cycleDay, civilDate(row.last_start));
    // Tope defensivo: dos años de periodos por invocación.
    for (let guard = 0; guard < CATCH_UP_MAX_PERIODS; guard += 1) {
      const next = periodContaining(cycleDay, addDays(cursor.periodEnd, 1));
      if (next.periodStart > current.periodStart) break;
      starts.push(next.periodStart);
      cursor = next;
    }
    return starts;
  }

  async automaticGenerationEnabled(tenantId: string, schemaName: string): Promise<boolean> {
    const rows = (await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.query('SELECT automatic_generation FROM billing_policy WHERE tenant_id = $1', [tenantId]),
    )) as Array<{ automatic_generation: boolean }>;
    return rows[0]?.automatic_generation === true;
  }

  async getGenerationSchedule(tenantId: string, schemaName: string): Promise<number | null> {
    const rows = (await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.query(
        'SELECT generation_hour, automatic_generation FROM billing_policy WHERE tenant_id = $1',
        [tenantId],
      ),
    )) as Array<{ generation_hour: number; automatic_generation: boolean }>;
    return rows[0]?.generation_hour ?? null;
  }

  private async loadCandidates(
    localDate: string,
    contractId?: string,
  ): Promise<BillableContract[]> {
    if (contractId) {
      const candidate = await this.contracts.findByContractId(contractId, {
        revealDocument: false,
      });
      return candidate ? [candidate] : [];
    }
    const candidates: BillableContract[] = [];
    let afterContractId: string | undefined;
    for (;;) {
      const page = await this.contracts.findBillableForDate(localDate, {
        ...(afterContractId !== undefined ? { afterContractId } : {}),
        limit: PAGE_SIZE,
      });
      candidates.push(...page);
      if (page.length < PAGE_SIZE) return candidates;
      afterContractId = page.at(-1)?.contractId;
      if (!afterContractId) return candidates;
    }
  }

  private async generateOne(
    manager: EntityManager,
    tenantId: string,
    contract: BillableContract,
    localDate: string,
    actorId: string | null,
    manual: boolean,
    prepared: Awaited<ReturnType<BillingDocumentsService['prepareIssue']>>,
    events: PeriodEvent[],
    firstChargeFrom?: string,
    targetPeriodStart?: string,
  ): Promise<
    'generated' | 'existing' | 'omittedTermination' | 'blocked' | 'notDue' | 'withoutCycle'
  > {
    // RS-20: sin ciclo no hay periodo ni documento; se cuenta aparte, no como bloqueo.
    if (!contract.cycleDay) return 'withoutCycle';
    const policyRows = (await manager.query('SELECT * FROM billing_policy WHERE tenant_id = $1', [
      tenantId,
    ])) as BillingPolicyRow[];
    const contractPolicyRows = (await manager.query(
      `SELECT period_timing, generation_lead_days, payment_term_days, grace_days,
                cutoff_enabled, first_period_mode, billing_start_date::text
           FROM billing_contract_policy WHERE tenant_id = $1 AND contract_id = $2`,
      [tenantId, contract.contractId],
    )) as ContractPolicyRow[];
    const basePolicy = policyRows[0];
    if (!basePolicy) throw new Error('No se encontró la política de facturación del tenant.');
    const override = contractPolicyRows[0];
    const policy = {
      ...basePolicy,
      period_timing: override?.period_timing ?? basePolicy.period_timing,
      generation_lead_days: override?.generation_lead_days ?? basePolicy.generation_lead_days,
      payment_term_days: override?.payment_term_days ?? basePolicy.payment_term_days,
      grace_days: override?.grace_days ?? basePolicy.grace_days,
      cutoff_enabled: override?.cutoff_enabled ?? basePolicy.cutoff_enabled,
      first_period_mode: override?.first_period_mode ?? basePolicy.first_period_mode,
    };
    const billingStart = firstChargeFrom
      ? (override?.billing_start_date ?? firstChargeFrom)
      : (override?.billing_start_date ?? contract.activatedAt);
    // Primer cobro por activación: el objetivo es el periodo que contiene el inicio
    // de cobro, sin esperar la fecha de generación del lote (CA-3).
    let target = firstChargeFrom
      ? periodContaining(contract.cycleDay, civilDate(billingStart ?? firstChargeFrom))
      : targetPeriodStart
        ? periodContaining(contract.cycleDay, targetPeriodStart)
        : resolveGenerationTarget(
            contract.cycleDay,
            { periodTiming: policy.period_timing, generationLeadDays: policy.generation_lead_days },
            localDate,
          );
    if (billingStart && billingStart > target.periodEnd) return 'notDue';
    let combinedStart: string | null = null;
    if (
      billingStart &&
      billingStart > target.periodStart &&
      policy.first_period_mode === 'JUNTO_AL_SIGUIENTE'
    ) {
      const next = civilDate(addDays(target.periodEnd, 1));
      const parsed = new Date(`${next}T00:00:00.000Z`);
      target = computeBillingPeriod(
        contract.cycleDay,
        parsed.getUTCFullYear(),
        parsed.getUTCMonth() + 1,
      );
      const nextGenerationDate = computeGenerationDate(
        target,
        policy.period_timing,
        policy.generation_lead_days,
      );
      // En el primer cobro el tramo inicial sale junto al periodo siguiente, ya mismo.
      if (!firstChargeFrom && nextGenerationDate > localDate) return 'notDue';
      combinedStart = billingStart;
      if (contract.terminatedAt && contract.terminatedAt < target.periodStart)
        return 'omittedTermination';
    }
    if (contract.terminatedAt && contract.terminatedAt < target.periodStart) {
      return 'omittedTermination';
    }
    if (
      billingStart &&
      billingStart < target.periodStart &&
      policy.first_period_mode === 'JUNTO_AL_SIGUIENTE'
    ) {
      // RF-FAC-13: el tramo inicial solo cubre el alta del periodo inmediatamente anterior;
      // un alta más antigua no genera cobro retroactivo (cubre desde el inicio del objetivo).
      const previousStart = previousPeriodStart(contract.cycleDay, target.periodStart);
      if (billingStart >= previousStart) {
        const prior = (await manager.query(
          'SELECT id FROM billing_periods WHERE tenant_id=$1 AND contract_id=$2 LIMIT 1',
          [tenantId, contract.contractId],
        )) as Array<{ id: string }>;
        if (!prior.length) combinedStart = billingStart;
      }
    }

    await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `billing:${contract.contractId}:${target.periodStart}`,
    ]);
    const existing = (await manager.query(
      'SELECT id, effective_policy, covered_start::text, period_end::text FROM billing_periods WHERE contract_id = $1 AND period_start = $2::date AND tenant_id=$3 LIMIT 1',
      [contract.contractId, target.periodStart, tenantId],
    )) as Array<{
      id: string;
      effective_policy: BillingPolicyRow;
      covered_start: string;
      period_end: string;
    }>;
    if (firstChargeFrom) {
      // Idempotencia del primer cobro: cualquier periodo previo del contrato (por este
      // evento repetido, por el lote o por generación manual) significa que ya existe.
      const anyPeriod = (await manager.query(
        'SELECT id FROM billing_periods WHERE tenant_id=$1 AND contract_id=$2 LIMIT 1',
        [tenantId, contract.contractId],
      )) as Array<{ id: string }>;
      if (anyPeriod.length) return 'existing';
    }
    if (existing.length) {
      const live = (await manager.query(
        "SELECT id FROM billing_documents WHERE tenant_id=$1 AND period_id=$2 AND status<>'ANULADO' LIMIT 1",
        [tenantId, existing[0]!.id],
      )) as Array<{ id: string }>;
      if (!manual || live.length) return 'existing';
    }

    // RS-18: al reutilizar el periodo, método de prorrateo, aprobación y tramo inicial
    // salen de lo congelado; la política actual no reescribe un periodo ya generado.
    const frozen = existing[0];
    const effectivePolicy: BillingPolicyRow = frozen
      ? { ...policy, ...frozen.effective_policy }
      : policy;
    const coveredStart = frozen
      ? civilDate(frozen.covered_start)
      : (combinedStart ??
        (billingStart && billingStart > target.periodStart ? billingStart : target.periodStart));
    const coveredEnd =
      contract.terminatedAt && contract.terminatedAt < target.periodEnd
        ? contract.terminatedAt
        : target.periodEnd;
    const periodDays = diffInDays(target.periodStart, target.periodEnd) + 1;
    const coveredDays = diffInDays(coveredStart, coveredEnd) + 1;
    const issueDate = localDate;
    // R8 (spec 2026-11-11): un periodo cobrado tarde no nace vencido; vence en la generación
    // más el plazo de pago y el corte se corre los mismos días.
    const dueAndCutoff = shiftLateDueAndCutoff(
      computeDueAndCutoff(
        target,
        {
          // RS-18: al reutilizar el periodo, el vencimiento sale de la política congelada.
          cutoffMode: effectivePolicy.cutoff_mode,
          paymentTermDays: effectivePolicy.payment_term_days,
          graceDays: effectivePolicy.grace_days,
          cutoffEnabled: effectivePolicy.cutoff_enabled,
        },
        issueDate,
        contract.cutoffDay,
      ),
      issueDate,
      effectivePolicy.payment_term_days,
    );

    const blockingReason = draftBlockingReason(contract);
    const hasTax = contract.vatSnapshot !== null;
    const line =
      contract.monthlyPrice && hasTax
        ? buildPlanLine({
            price: contract.monthlyPrice,
            coveredDays,
            periodDays,
            method: effectivePolicy.proration_method,
            treatment: contract.vatSnapshot!.treatment,
            ratePercent: contract.vatSnapshot!.ratePercent,
            legalBasis: contract.vatSnapshot!.legalBasis,
            description: contract.planName ?? 'Plan de servicio',
          })
        : null;
    // Bloque D (CA-4/CA-5): la instalación va solo en el primer documento del contrato. Su IVA
    // es el congelado en el contrato (spec MOD14 2026-11-12 R2, sustituye D-F1); sin él,
    // STANDARD 19 % (D2).
    const installationVat = contract.installationVat ?? resolveCatalogItemVat(null, null);
    const installation =
      hasTax && (await this.isFirstChargeWithoutInstallation(manager, tenantId, contract, target))
        ? buildInstallationLine({
            fee: contract.installationFee,
            permanenceDiscount: contract.permanenceDiscount,
            treatment: installationVat.treatment,
            ratePercent: installationVat.ratePercent,
            legalBasis: installationVat.legalBasis,
          })
        : null;
    // Bloque C (spec MOD14 2026-11-12 D3/R3): adicionales con su IVA congelado.
    const additionalLines = hasTax
      ? await this.buildAdditionalLines(manager, tenantId, contract, {
          coveredDays,
          periodDays,
          method: effectivePolicy.proration_method,
        })
      : [];
    const lines: BillingLineValue[] = [line, installation, ...additionalLines].filter(
      (value): value is BillingLineValue => value !== null,
    );
    const subtotal = lines.reduce((acc, value) => acc + Number(value.baseAmount), 0);
    const tax = lines.reduce((acc, value) => acc + Number(value.taxAmount), 0);
    const periodRows = existing.length
      ? existing
      : ((await manager.query(
          `INSERT INTO billing_periods
         (tenant_id, contract_id, subscriber_id, period_start, period_end, covered_start,
          generation_date, due_date, cutoff_date, effective_policy)
       VALUES ($1,$2,$3,$4::date,$5::date,$6::date,$7::date,$8::date,$9::date,$10::jsonb)
       RETURNING id::text`,
          [
            tenantId,
            contract.contractId,
            contract.subscriberId,
            target.periodStart,
            target.periodEnd,
            coveredStart,
            localDate,
            dueAndCutoff.dueDate,
            dueAndCutoff.cutoffDate,
            JSON.stringify(policy),
          ],
        )) as Array<{ id: string }>);
    const periodId = periodRows[0]?.id;
    if (!periodId) throw new Error('No se pudo crear el periodo de facturación.');
    const buyerSnapshot = {
      displayName: contract.buyer.displayName,
      documentType: contract.buyer.documentType,
      address: contract.buyer.address,
      rutResponsibilities: contract.buyer.rutResponsibilities,
    };
    const documentRows = (await manager.query(
      `INSERT INTO billing_documents
         (tenant_id, period_id, contract_id, subscriber_id, status, due_date,
          subtotal, tax_total, total, blocking_reason, buyer_snapshot, unbilled_additional_count, created_by)
       VALUES ($1,$2,$3,$4,'BORRADOR',$5::date,$6,$7,$8,$9,$10::jsonb,$11,$12)
       RETURNING id::text`,
      [
        tenantId,
        periodId,
        contract.contractId,
        contract.subscriberId,
        dueAndCutoff.dueDate,
        money(subtotal),
        money(tax),
        money(subtotal + tax),
        blockingReason,
        JSON.stringify(buyerSnapshot),
        contract.unbilledAdditionalCount,
        actorId,
      ],
    )) as Array<{ id: string }>;
    const documentId = documentRows[0]?.id;
    if (!documentId) throw new Error('No se pudo crear el borrador de facturación.');
    for (const value of lines) {
      await manager.query(
        `INSERT INTO billing_document_lines
           (tenant_id, document_id, kind, description, quantity, unit_price, base_amount,
            tax_amount, total, vat_treatment, vat_rate, vat_legal_basis, position,
            additional_item_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          tenantId,
          documentId,
          value.kind,
          value.description,
          value.quantity,
          value.unitPrice,
          value.baseAmount,
          value.taxAmount,
          value.total,
          value.vatTreatment,
          value.vatRate,
          value.vatLegalBasis,
          value.position,
          value.additionalItemId ?? null,
        ],
      );
    }
    await this.audit.logWithin(
      {
        action: AuditAction.CREATE,
        entityType: 'BillingDocument',
        entityId: documentId,
        userId: actorId,
        newValue: { status: 'BORRADOR', periodId, blockingReason },
      },
      manager,
    );
    if (effectivePolicy.approval_mode === 'AUTOMATICA' && !blockingReason) {
      await this.documents.issueWithinManager(
        manager,
        tenantId,
        [documentId],
        actorId,
        prepared,
        events,
      );
    }
    if (contract.unbilledAdditionalCount > 0) {
      this.logger.warn('Documento generado con adicionales sin cobrar.');
    }
    return blockingReason ? 'blocked' : 'generated';
  }

  /**
   * Líneas de adicionales del documento (bloque C, R3/CA-2). Servicio: cada periodo, prorrateado
   * como el plan (la idempotencia por periodo la da el documento vivo del periodo). Producto: una
   * sola vez por contrato: se omite si un documento vivo del contrato ya trae su línea. El candado
   * por contrato serializa la generación de periodos distintos del mismo contrato.
   */
  private async buildAdditionalLines(
    manager: EntityManager,
    tenantId: string,
    contract: BillableContract,
    period: {
      coveredDays: number;
      periodDays: number;
      method: BillingPolicyRow['proration_method'];
    },
  ): Promise<BillingLineValue[]> {
    const additionals = contract.additionals ?? [];
    if (additionals.length === 0) return [];
    const productIds = additionals
      .filter((item) => item.itemType === 'PRODUCT')
      .map((item) => item.itemId);
    let charged = new Set<string>();
    if (productIds.length) {
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `billing:additional-products:${contract.contractId}`,
      ]);
      const rows = (await manager.query(
        `SELECT DISTINCT l.additional_item_id
           FROM billing_document_lines l
           JOIN billing_documents d ON d.id = l.document_id AND d.tenant_id = l.tenant_id
          WHERE d.tenant_id = $1 AND d.contract_id = $2 AND d.status <> 'ANULADO'
            AND l.kind = 'ADICIONAL' AND l.additional_item_id = ANY($3::text[])`,
        [tenantId, contract.contractId, productIds],
      )) as Array<{ additional_item_id: string }>;
      charged = new Set(rows.map((row) => row.additional_item_id));
    }
    const lines: BillingLineValue[] = [];
    for (const item of additionals) {
      if (item.itemType === 'PRODUCT' && charged.has(item.itemId)) continue;
      const built = buildAdditionalLine({
        itemId: item.itemId,
        itemType: item.itemType,
        name: item.name,
        unitPrice: item.unitPrice,
        coveredDays: period.coveredDays,
        periodDays: period.periodDays,
        method: period.method,
        treatment: item.vat.treatment,
        ratePercent: item.vat.ratePercent,
        legalBasis: item.vat.legalBasis,
        position: 2 + lines.length,
      });
      if (built) lines.push(built);
    }
    return lines;
  }

  /**
   * Idempotencia de la instalación: el periodo objetivo es el primero del contrato (no hay
   * periodos anteriores) y ningún documento vivo del contrato trae ya la línea.
   */
  private async isFirstChargeWithoutInstallation(
    manager: EntityManager,
    tenantId: string,
    contract: BillableContract,
    target: { periodStart: string },
  ): Promise<boolean> {
    if (!contract.installationFee || Number(contract.installationFee) === 0) return false;
    const earlier = (await manager.query(
      'SELECT id FROM billing_periods WHERE tenant_id=$1 AND contract_id=$2 AND period_start < $3::date LIMIT 1',
      [tenantId, contract.contractId, target.periodStart],
    )) as Array<{ id: string }>;
    if (earlier.length) return false;
    const charged = (await manager.query(
      `SELECT l.id FROM billing_document_lines l
         JOIN billing_documents d ON d.id = l.document_id AND d.tenant_id = l.tenant_id
        WHERE d.tenant_id = $1 AND d.contract_id = $2 AND d.status <> 'ANULADO'
          AND l.kind = 'INSTALACION'
        LIMIT 1`,
      [tenantId, contract.contractId],
    )) as Array<{ id: string }>;
    return charged.length === 0;
  }
}
