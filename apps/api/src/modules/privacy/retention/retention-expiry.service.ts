import { Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { addCalendarMonths, addColombiaBusinessDays, AuditAction } from '@iwana/shared';
import { TenantContext } from '@iwana/db';
import { bogotaCivilDate, toBogotaCivilDate } from '../ports/privacy-tenant-query';
import { ConservationDutyService } from './conservation-duty.service';
import { RetentionAuditPort } from './retention-audit.port';
import {
  IContractStandingReadPort,
  type ProspectDiscardRow,
} from '../requests/ports/contract-standing-read.port';
import { IPersonalDataErasurePort } from '../ports/personal-data-erasure.port';
import { IPqrRetentionReadPort } from '../requests/ports/pqr-retention-read.port';
import { hasPqrConservationDuty } from '../requests/pqr-retention';

/** Versión de reglas del barrido; cambiarla obliga a verificar antes de remediar. */
export const RETENTION_EXPIRY_RULES_VERSION = 1;

/** Objetivos por lote y actor del sistema para corridas sin operador humano. */
export const RETENTION_EXPIRY_BATCH_LIMIT = 100;
export const RETENTION_EXPIRY_SYSTEM_ACTOR = '00000000-0000-0000-0000-000000000000';

const REQUEST_RETENTION_CATEGORY = 'SOLICITUDES_TITULAR';
const PROSPECT_RETENTION_CATEGORY = 'PROSPECTO_SIN_CONTRATO';
const CLASSIFICATION_TASK_KIND = 'CLASIFICAR_DESTINO_TRASLADO';
const CLASSIFICATION_SLA_BUSINESS_DAYS = 5;
const MAX_EXPEDIENTES_PER_OBJECTIVE = 500;

/** Lista cerrada de motivos (conteos y ledger, sin PII). */
export const RETENTION_EXPIRY_REASONS = [
  'OPEN_CONTRACT',
  'CONTRACT_RETENTION',
  'FISCAL_RETENTION',
  'PQR_RETENTION',
  'PROSPECT_UNRECONCILED',
  'REQUEST_ACTIVE_HOLD',
  'REQUEST_CHANGED',
  'MARK_NOT_ACTIVE',
  'MISSING_REQUEST_CLOSURE',
  'MISSING_POLICY',
  'PORT_UNAVAILABLE',
  'UNRECONCILED_SCOPE',
  'ACTIVE_ACCOUNT',
  'SUPPLIER_LINKED',
  'TOO_MANY_CANDIDATES',
  'PARTICIPANT_ERROR',
  'RESIDUAL_MISMATCH',
  'CLASSIFICATION_INVALID',
  'SCHEMA_INCOMPATIBLE',
  'CONTRACT_UNRECONCILED',
  'FISCAL_UNRECONCILED',
] as const;

export type RetentionExpiryReason = (typeof RETENTION_EXPIRY_REASONS)[number];

export type RetentionExpiryPhase = 'TITULAR' | 'PROSPECTO' | 'SOLICITUD';
export type RetentionExpiryBatchStatus = 'CONTINUE' | 'COMPLETE' | 'ATTENTION_REQUIRED';

export interface RetentionExpiryCursor {
  phase: RetentionExpiryPhase;
  eligibleOn: string;
  id: string;
}

export interface RetentionExpiryBatchResult {
  status: RetentionExpiryBatchStatus;
  nextCursor: RetentionExpiryCursor | null;
  counts: { titulares: number; prospectos: number; solicitudes: number; failed: number };
  reasonCounts: Partial<Record<RetentionExpiryReason, number>>;
}

export interface RetentionExpiryPreview {
  scanned: { titulares: number; prospectos: number; solicitudes: number };
  eligible: {
    titulares: Array<{ partyId: string; requestId: string }>;
    prospectos: Array<{ expedienteId: string }>;
    solicitudes: Array<{ requestId: string }>;
  };
  /** B4-R2 B-5: objetivos que el lote dejará en ATTENTION_REQUIRED, con su código. */
  unreconciled: {
    titulares: Array<{ partyId: string; requestId: string; reasonCode: RetentionExpiryReason }>;
    prospectos: Array<{ expedienteId: string; reasonCode: RetentionExpiryReason }>;
    solicitudes: Array<{ requestId: string; reasonCode: RetentionExpiryReason }>;
  };
  generatedAt: string;
}

export interface RetentionExpiryVerification {
  vencidosSinProcesar: number;
  antiguedadMasAntigua: string | null;
  solicitudesVencidasSinMinimizar: number;
  solicitudesSinCierre: number;
  tareasClasificacionVencidas: number;
  mediaPendiente: number;
  ultimaCorridaCompleta: string | null;
  tenantConciliado: boolean;
}

type DbRow = Record<string, unknown>;

/**
 * Motor transaccional del vencimiento de retención (H-EXP B1, §5).
 *
 * API humana, CLI y job usan esta misma evaluación con `manager` explícito.
 * Cada objetivo se procesa en su propio `SAVEPOINT`: un fallo revierte solo
 * ese objetivo y queda en el resumen pendiente sin bloquear a los demás. El
 * ledger `privacy_retention_expiry_runs` (único por tipo, objetivo y versión)
 * hace idempotente el reintento: un acto COMPLETE es no-op.
 *
 * El prospecto se registra como TITULAR con `target_id` del expediente y
 * `request_id` del acto del ledger (no se radica otra solicitud).
 */
@Injectable()
export class RetentionExpiryService {
  constructor(
    private readonly duty: ConservationDutyService,
    private readonly standingPort: IContractStandingReadPort,
    @Optional() private readonly erasurePort?: IPersonalDataErasurePort,
    @Optional() private readonly auditPort?: RetentionAuditPort,
    @Optional() private readonly pqrRetentionPort?: IPqrRetentionReadPort,
  ) {}

  async previewTenant(manager: EntityManager, today?: string): Promise<RetentionExpiryPreview> {
    const civilToday = today ?? bogotaCivilDate(new Date());
    const titulares = await this.selectTitulares(manager, civilToday, null);
    const prospectos = await this.selectProspectos(manager, civilToday, null);
    const solicitudes = await this.selectSolicitudes(manager, civilToday, null);
    return {
      scanned: {
        titulares: titulares.scanned,
        prospectos: prospectos.scanned,
        solicitudes: solicitudes.scanned,
      },
      eligible: {
        titulares: titulares.eligible
          .filter((item) => item.unreconciled === null)
          .map((item) => ({ partyId: item.partyId, requestId: item.requestId })),
        prospectos: prospectos.eligible
          .filter((item) => item.unreconciled === null)
          .map((item) => ({ expedienteId: item.expedienteId })),
        solicitudes: solicitudes.eligible
          .filter((item) => item.unreconciled === null)
          .map((item) => ({ requestId: item.requestId })),
      },
      unreconciled: {
        titulares: titulares.eligible.flatMap((item) =>
          item.unreconciled === null
            ? []
            : [{ partyId: item.partyId, requestId: item.requestId, reasonCode: item.unreconciled }],
        ),
        prospectos: prospectos.eligible.flatMap((item) =>
          item.unreconciled === null
            ? []
            : [{ expedienteId: item.expedienteId, reasonCode: item.unreconciled }],
        ),
        solicitudes: solicitudes.eligible.flatMap((item) =>
          item.unreconciled === null
            ? []
            : [{ requestId: item.requestId, reasonCode: item.unreconciled }],
        ),
      },
      generatedAt: civilToday,
    };
  }

  async runTenantBatch(
    manager: EntityManager,
    input: {
      actorId: string;
      runId: string;
      limit?: number;
      cursor?: RetentionExpiryCursor | null;
      today?: string;
      dryRun?: boolean;
    },
  ): Promise<RetentionExpiryBatchResult> {
    const today = input.today ?? bogotaCivilDate(new Date());
    const limit = input.limit ?? RETENTION_EXPIRY_BATCH_LIMIT;
    const result: RetentionExpiryBatchResult = {
      status: 'COMPLETE',
      nextCursor: null,
      counts: { titulares: 0, prospectos: 0, solicitudes: 0, failed: 0 },
      reasonCounts: {},
    };
    // Exclusión mutua por tenant dentro de la transacción (pgBouncer: xact).
    const lockKey = TenantContext.get()?.tenantId ?? 'sin-contexto';
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`hexp:${lockKey}`]);
    const startCursor = input.cursor ?? (await this.loadCursor(manager, input.runId));
    const remaining = { count: limit };
    const phases: RetentionExpiryPhase[] = ['TITULAR', 'PROSPECTO', 'SOLICITUD'];
    const startPhase = startCursor ? phases.indexOf(startCursor.phase) : 0;
    for (let index = startPhase; index < phases.length && remaining.count > 0; index += 1) {
      const phase = phases[index]!;
      const cursorInPhase = startCursor && startCursor.phase === phase ? startCursor : null;
      const outcome =
        phase === 'TITULAR'
          ? await this.runTitulares(
              manager,
              input.actorId,
              today,
              remaining,
              cursorInPhase,
              input.dryRun === true,
            )
          : phase === 'PROSPECTO'
            ? await this.runProspectos(
                manager,
                input.actorId,
                today,
                remaining,
                cursorInPhase,
                input.dryRun === true,
              )
            : await this.runSolicitudes(
                manager,
                input.actorId,
                today,
                remaining,
                cursorInPhase,
                input.dryRun === true,
              );
      this.mergeOutcome(result, outcome);
      if (outcome.nextCursor) {
        result.status = outcome.needsAttention ? 'ATTENTION_REQUIRED' : 'CONTINUE';
        result.nextCursor = outcome.nextCursor;
        await this.saveCursor(manager, input.runId, outcome.nextCursor);
        return result;
      }
      if (outcome.needsAttention) result.status = 'ATTENTION_REQUIRED';
    }
    if (result.counts.failed > 0 && result.status === 'COMPLETE') {
      result.status = 'ATTENTION_REQUIRED';
    }
    return result;
  }

  async verifyTenant(manager: EntityManager, today?: string): Promise<RetentionExpiryVerification> {
    const civilToday = today ?? bogotaCivilDate(new Date());
    const titulares = await this.selectTitulares(manager, civilToday, null);
    const pendientes = titulares.eligible.filter((item) => !item.alreadyComplete);
    const solicitudes = await this.selectSolicitudes(manager, civilToday, null);
    const vencidas = solicitudes.eligible.filter((item) => item.anchor !== null);
    const sinCierre = solicitudes.sinCierre;
    const tareas = (await manager.query(
      `SELECT COUNT(*)::int AS total FROM data_subject_request_tasks
        WHERE kind = 'CLASIFICAR_DESTINO_TRASLADO' AND done_at IS NULL AND due_at < $1`,
      [civilToday],
    )) as Array<{ total: number }>;
    const corridas = (await manager.query(
      `SELECT max(completed_at)::text AS last FROM privacy_retention_expiry_runs
        WHERE estado = 'COMPLETE'`,
    )) as Array<{ last: string | null }>;
    const counts = {
      vencidosSinProcesar:
        pendientes.length + (await this.countProspectosVencidos(manager, civilToday)),
      antiguedadMasAntigua: this.oldestEligible([
        ...pendientes.map((item) => item.eligibleOn),
        ...(await this.oldestProspectoEligible(manager, civilToday)),
        ...vencidas.map((item) => item.anchor as string),
      ]),
      solicitudesVencidasSinMinimizar: vencidas.length,
      solicitudesSinCierre: sinCierre,
      tareasClasificacionVencidas: tareas[0]?.total ?? 0,
      mediaPendiente: 0,
      ultimaCorridaCompleta: corridas[0]?.last ?? null,
      tenantConciliado: false,
    };
    counts.tenantConciliado =
      counts.vencidosSinProcesar === 0 &&
      counts.solicitudesVencidasSinMinimizar === 0 &&
      counts.solicitudesSinCierre === 0 &&
      counts.tareasClasificacionVencidas === 0;
    return counts;
  }

  // -- Selección (solo lectura) -------------------------------------------

  private async selectTitulares(
    manager: EntityManager,
    today: string,
    cursor: RetentionExpiryCursor | null,
  ): Promise<{
    scanned: number;
    eligible: Array<{
      partyId: string;
      requestId: string;
      hmac: string | null;
      eligibleOn: string;
      alreadyComplete: boolean;
      /** B4-R2 B-5: código saneado si la evaluación falló cerrado. */
      unreconciled: RetentionExpiryReason | null;
    }>;
  }> {
    // Marca vigente = último evento por (party, mark), igual que MarksService.
    const blocked = (await manager.query(
      `SELECT party_id::text AS party_id FROM (
         SELECT party_id, event,
                ROW_NUMBER() OVER (
                  PARTITION BY party_id, mark ORDER BY occurred_at DESC, id DESC
                ) AS rn
           FROM party_privacy_marks WHERE mark = 'DATOS_BLOQUEADOS'
       ) latest WHERE rn = 1 AND event = 'OPEN'`,
    )) as Array<{ party_id: string }>;
    const partyIds = blocked.map((row) => row.party_id);
    if (partyIds.length === 0) return { scanned: 0, eligible: [] };
    const rows = (await manager.query(
      `SELECT r.id::text AS id, r.party_id::text AS party_id,
              r.requester_document_hmac AS hmac, r.legal_basis AS legal_basis
         FROM data_subject_requests r
        WHERE r."right" = 'SUPRIMIR' AND r.status = 'NO_PROCEDENTE'
          AND r.legal_basis IN ('DEBER_LEGAL_CONSERVACION', 'DEBER_CONTRACTUAL')
          AND r.identity_verified_at IS NOT NULL
          AND r.party_id = ANY($1::uuid[])
        ORDER BY r.received_at, r.id`,
      [partyIds],
    )) as Array<{ id: string; party_id: string; hmac: string | null; legal_basis: string }>;
    const eligible: Awaited<ReturnType<RetentionExpiryService['selectTitulares']>>['eligible'] = [];
    for (const row of rows) {
      // La evaluación por fila no oculta a las demás: si el deber falla
      // cerrado aquí, el lote lo reevalúa dentro del savepoint y lo clasifica.
      let evaluation: Awaited<ReturnType<ConservationDutyService['evaluate']>> | null = null;
      let unreconciled: RetentionExpiryReason | null = null;
      try {
        evaluation = await this.duty.evaluate(
          manager,
          row.party_id,
          row.hmac,
          new Date(`${today}T12:00:00-05:00`),
        );
      } catch (error) {
        evaluation = null;
        unreconciled = this.toReasonCode(error);
      }
      if (evaluation?.applies) continue;
      const eligibleOn =
        [evaluation?.clocks.contract?.expiresOn, evaluation?.clocks.fiscal?.expiresOn]
          .filter((value): value is string => typeof value === 'string')
          .sort()
          .pop() ?? today;
      if (
        cursor &&
        (eligibleOn < cursor.eligibleOn ||
          (eligibleOn === cursor.eligibleOn && row.party_id <= cursor.id))
      )
        continue;
      const alreadyComplete = await this.isComplete(manager, 'TITULAR', row.party_id);
      eligible.push({
        partyId: row.party_id,
        requestId: row.id,
        hmac: row.hmac,
        eligibleOn,
        alreadyComplete,
        unreconciled,
      });
    }
    eligible.sort((a, b) =>
      a.eligibleOn === b.eligibleOn
        ? a.partyId < b.partyId
          ? -1
          : 1
        : a.eligibleOn < b.eligibleOn
          ? -1
          : 1,
    );
    return { scanned: rows.length, eligible };
  }

  private async selectProspectos(
    manager: EntityManager,
    today: string,
    cursor: RetentionExpiryCursor | null,
  ): Promise<{
    scanned: number;
    eligible: Array<{
      expedienteId: string;
      eligibleOn: string;
      alreadyComplete: boolean;
      unreconciled: RetentionExpiryReason | null;
    }>;
    prospectPortMissing: boolean;
  }> {
    const listProspectDiscard = this.standingPort.listProspectDiscard?.bind(this.standingPort);
    if (!listProspectDiscard) {
      // Sin el puerto no se puede demostrar el descarte: fallo cerrado
      // con PORT_UNAVAILABLE en el lote.
      return { scanned: 0, eligible: [], prospectPortMissing: true };
    }
    const details: ProspectDiscardRow[] = await listProspectDiscard({ manager });
    const scanned = details.length;
    const years = await this.policyYears(manager, PROSPECT_RETENTION_CATEGORY);
    const eligible: Awaited<ReturnType<RetentionExpiryService['selectProspectos']>>['eligible'] =
      [];
    for (const detail of details) {
      if (detail.hasContract) continue;
      // B4-R2 B-3: un DESCARTADO sin fecha de descarte verificable no se
      // salta en silencio ni se inventa la fecha: entra al lote, cuya
      // revalidación deja ATTENTION_REQUIRED con PROSPECT_UNRECONCILED.
      const unreconciled: RetentionExpiryReason | null = detail.discardedAt
        ? null
        : 'PROSPECT_UNRECONCILED';
      const eligibleOn = detail.discardedAt
        ? addCalendarMonths(toBogotaCivilDate(detail.discardedAt), years * 12)
        : today;
      if (eligibleOn > today) continue;
      if (!unreconciled && (await this.hasProspectDuty(manager, detail.expedienteId, today)))
        continue;
      if (
        cursor &&
        (eligibleOn < cursor.eligibleOn ||
          (eligibleOn === cursor.eligibleOn && detail.expedienteId <= cursor.id))
      )
        continue;
      eligible.push({
        expedienteId: detail.expedienteId,
        eligibleOn,
        alreadyComplete: await this.isComplete(manager, 'TITULAR', detail.expedienteId),
        unreconciled,
      });
    }
    eligible.sort((a, b) =>
      a.eligibleOn === b.eligibleOn
        ? a.expedienteId < b.expedienteId
          ? -1
          : 1
        : a.eligibleOn < b.eligibleOn
          ? -1
          : 1,
    );
    return { scanned, eligible, prospectPortMissing: false };
  }

  private async selectSolicitudes(
    manager: EntityManager,
    today: string,
    cursor: RetentionExpiryCursor | null,
  ): Promise<{
    scanned: number;
    sinCierre: number;
    eligible: Array<{
      requestId: string;
      anchor: string | null;
      eligibleOn: string;
      alreadyComplete: boolean;
      unreconciled: RetentionExpiryReason | null;
    }>;
  }> {
    const rows = (await manager.query(
      `SELECT r.id::text AS id, r.status AS status,
              r.resolved_at AS resolved_at, r.closed_at AS closed_at,
              r.minimized_at AS minimized_at
         FROM data_subject_requests r
        WHERE r.status IN ('RESUELTA', 'NO_PROCEDENTE', 'TRASLADADA', 'DESISTIDA')
          AND r.minimized_at IS NULL
        ORDER BY COALESCE(r.closed_at, r.resolved_at), r.id`,
    )) as Array<{
      id: string;
      status: string;
      resolved_at: Date | string | null;
      closed_at: Date | string | null;
      minimized_at: Date | string | null;
    }>;
    const years = await this.policyYears(manager, REQUEST_RETENTION_CATEGORY);
    const eligible: Awaited<ReturnType<RetentionExpiryService['selectSolicitudes']>>['eligible'] =
      [];
    let sinCierre = 0;
    for (const row of rows) {
      const raw =
        row.status === 'RESUELTA' || row.status === 'NO_PROCEDENTE'
          ? row.resolved_at
          : row.closed_at;
      if (!raw) sinCierre += 1;
      // B4-R2 B-3: una solicitud terminal sin cierre verificable no se
      // minimiza ni se salta en silencio: el lote deja ATTENTION_REQUIRED
      // con MISSING_REQUEST_CLOSURE y nunca inventa la fecha.
      const anchor = raw ? toBogotaCivilDate(new Date(raw).toISOString()) : null;
      const eligibleOn = anchor ? addCalendarMonths(anchor, years * 12) : today;
      if (eligibleOn > today) continue;
      if (
        cursor &&
        (eligibleOn < cursor.eligibleOn ||
          (eligibleOn === cursor.eligibleOn && row.id <= cursor.id))
      )
        continue;
      eligible.push({
        requestId: row.id,
        anchor,
        eligibleOn,
        alreadyComplete: await this.isComplete(manager, 'REQUEST', row.id),
        unreconciled: anchor ? null : 'MISSING_REQUEST_CLOSURE',
      });
    }
    // Orden estable (eligibleOn, id) para que el cursor no salte objetivos.
    eligible.sort((a, b) =>
      a.eligibleOn === b.eligibleOn
        ? a.requestId < b.requestId
          ? -1
          : 1
        : a.eligibleOn < b.eligibleOn
          ? -1
          : 1,
    );
    return { scanned: rows.length, sinCierre, eligible };
  }

  // -- Ejecución por fase --------------------------------------------------

  private async runTitulares(
    manager: EntityManager,
    actorId: string,
    today: string,
    remaining: { count: number },
    cursor: RetentionExpiryCursor | null,
    dryRun: boolean,
  ): Promise<{
    nextCursor: RetentionExpiryCursor | null;
    needsAttention: boolean;
    titulares: number;
    failed: number;
    reasons: Partial<Record<RetentionExpiryReason, number>>;
  }> {
    const outcome = {
      nextCursor: null as RetentionExpiryCursor | null,
      needsAttention: false,
      titulares: 0,
      failed: 0,
      reasons: {} as Partial<Record<RetentionExpiryReason, number>>,
    };
    const { eligible } = await this.selectTitulares(manager, today, cursor);
    for (const item of eligible) {
      if (remaining.count <= 0) {
        outcome.nextCursor = { phase: 'TITULAR', eligibleOn: item.eligibleOn, id: item.partyId };
        return outcome;
      }
      if (item.alreadyComplete) continue;
      remaining.count -= 1;
      outcome.titulares += 1;
      if (dryRun) continue;
      const reason = await this.inSavepoint(
        manager,
        `hexp_t_${outcome.titulares}`,
        {
          tipo: 'TITULAR',
          targetId: item.partyId,
          requestId: item.requestId,
          eligibleOn: item.eligibleOn,
        },
        () => this.processTitular(manager, actorId, item),
      );
      if (reason) {
        outcome.failed += 1;
        outcome.reasons[reason] = (outcome.reasons[reason] ?? 0) + 1;
      }
    }
    return outcome;
  }

  private async runProspectos(
    manager: EntityManager,
    actorId: string,
    today: string,
    remaining: { count: number },
    cursor: RetentionExpiryCursor | null,
    dryRun: boolean,
  ): Promise<{
    nextCursor: RetentionExpiryCursor | null;
    needsAttention: boolean;
    prospectos: number;
    failed: number;
    reasons: Partial<Record<RetentionExpiryReason, number>>;
  }> {
    const outcome = {
      nextCursor: null as RetentionExpiryCursor | null,
      needsAttention: false,
      prospectos: 0,
      failed: 0,
      reasons: {} as Partial<Record<RetentionExpiryReason, number>>,
    };
    const { eligible, prospectPortMissing, scanned } = await this.selectProspectos(
      manager,
      today,
      cursor,
    );
    if (prospectPortMissing) {
      outcome.failed += scanned;
      outcome.reasons['PORT_UNAVAILABLE'] = (outcome.reasons['PORT_UNAVAILABLE'] ?? 0) + scanned;
      return outcome;
    }
    for (const item of eligible) {
      if (remaining.count <= 0) {
        outcome.nextCursor = {
          phase: 'PROSPECTO',
          eligibleOn: item.eligibleOn,
          id: item.expedienteId,
        };
        return outcome;
      }
      if (item.alreadyComplete) continue;
      remaining.count -= 1;
      outcome.prospectos += 1;
      if (dryRun) continue;
      const reason = await this.inSavepoint(
        manager,
        `hexp_p_${outcome.prospectos}`,
        {
          tipo: 'TITULAR',
          targetId: item.expedienteId,
          requestId: null,
          eligibleOn: item.eligibleOn,
        },
        () => this.processProspecto(manager, actorId, item, today),
      );
      if (reason) {
        outcome.failed += 1;
        outcome.reasons[reason] = (outcome.reasons[reason] ?? 0) + 1;
      }
    }
    return outcome;
  }

  private async runSolicitudes(
    manager: EntityManager,
    actorId: string,
    today: string,
    remaining: { count: number },
    cursor: RetentionExpiryCursor | null,
    dryRun: boolean,
  ): Promise<{
    nextCursor: RetentionExpiryCursor | null;
    needsAttention: boolean;
    solicitudes: number;
    failed: number;
    reasons: Partial<Record<RetentionExpiryReason, number>>;
  }> {
    const outcome = {
      nextCursor: null as RetentionExpiryCursor | null,
      needsAttention: false,
      solicitudes: 0,
      failed: 0,
      reasons: {} as Partial<Record<RetentionExpiryReason, number>>,
    };
    const { eligible } = await this.selectSolicitudes(manager, today, cursor);
    for (const item of eligible) {
      if (remaining.count <= 0) {
        outcome.nextCursor = {
          phase: 'SOLICITUD',
          eligibleOn: item.eligibleOn,
          id: item.requestId,
        };
        return outcome;
      }
      if (item.alreadyComplete) continue;
      remaining.count -= 1;
      if (item.unreconciled) {
        if (dryRun) continue;
        const reason = await this.fail(
          manager,
          'REQUEST',
          item.requestId,
          null,
          item.eligibleOn,
          item.unreconciled,
        );
        outcome.failed += 1;
        outcome.reasons[reason] = (outcome.reasons[reason] ?? 0) + 1;
        continue;
      }
      outcome.solicitudes += 1;
      if (dryRun) continue;
      const reason = await this.inSavepoint(
        manager,
        `hexp_s_${outcome.solicitudes}`,
        { tipo: 'REQUEST', targetId: item.requestId, requestId: null, eligibleOn: item.eligibleOn },
        () => this.processSolicitud(manager, actorId, item, today),
      );
      if (reason === 'REQUEST_ACTIVE_HOLD') outcome.needsAttention = true;
      if (reason) {
        outcome.failed += reason === 'REQUEST_ACTIVE_HOLD' ? 0 : 1;
        outcome.reasons[reason] = (outcome.reasons[reason] ?? 0) + 1;
      }
    }
    return outcome;
  }

  private mergeOutcome(
    result: RetentionExpiryBatchResult,
    outcome: {
      titulares?: number;
      prospectos?: number;
      solicitudes?: number;
      failed: number;
      reasons: Partial<Record<RetentionExpiryReason, number>>;
    },
  ): void {
    result.counts.titulares += outcome.titulares ?? 0;
    result.counts.prospectos += outcome.prospectos ?? 0;
    result.counts.solicitudes += outcome.solicitudes ?? 0;
    result.counts.failed += outcome.failed;
    for (const [reason, count] of Object.entries(outcome.reasons)) {
      const key = reason as RetentionExpiryReason;
      result.reasonCounts[key] = (result.reasonCounts[key] ?? 0) + (count ?? 0);
    }
  }

  // -- Actos por objetivo (un savepoint cada uno) ---------------------------

  private async processTitular(
    manager: EntityManager,
    actorId: string,
    item: { partyId: string; requestId: string; hmac: string | null; eligibleOn: string },
  ): Promise<RetentionExpiryReason | null> {
    if (!this.erasurePort)
      return this.fail(
        manager,
        'TITULAR',
        item.partyId,
        item.requestId,
        item.eligibleOn,
        'PORT_UNAVAILABLE',
      );
    const locked = (await manager.query(
      `SELECT id::text AS id, status AS status, party_id::text AS party_id,
              requester_document_hmac AS hmac
         FROM data_subject_requests WHERE id = $1 FOR UPDATE`,
      [item.requestId],
    )) as Array<{ id: string; status: string; party_id: string; hmac: string | null }>;
    const current = locked[0];
    if (!current || current.status !== 'NO_PROCEDENTE' || current.party_id !== item.partyId) {
      return this.fail(
        manager,
        'TITULAR',
        item.partyId,
        item.requestId,
        item.eligibleOn,
        'REQUEST_CHANGED',
      );
    }
    if (!(await this.markStillOpen(manager, item.partyId))) {
      return this.fail(
        manager,
        'TITULAR',
        item.partyId,
        item.requestId,
        item.eligibleOn,
        'MARK_NOT_ACTIVE',
      );
    }
    await this.lockPolicies(manager, [
      'IDENTIFICACION_DIRECCION_CONTRATO_SUSCRIPTOR',
      'FACTURACION_SOPORTES_CONTABLES',
      'PQR_SOPORTES',
    ]);
    const evaluation = await this.duty.evaluate(manager, item.partyId, current.hmac);
    if (evaluation.applies) {
      return this.fail(
        manager,
        'TITULAR',
        item.partyId,
        item.requestId,
        item.eligibleOn,
        evaluation.openContract
          ? 'OPEN_CONTRACT'
          : evaluation.contractRetained
            ? 'CONTRACT_RETENTION'
            : evaluation.fiscalRetained
              ? 'FISCAL_RETENTION'
              : 'PQR_RETENTION',
      );
    }
    const target = {
      requestId: item.requestId,
      partyId: item.partyId,
      requesterDocumentHmac: current.hmac,
    };
    const plan = await this.erasurePort.plan(target, { manager });
    if (plan.candidateExpedienteIds.length > MAX_EXPEDIENTES_PER_OBJECTIVE)
      return this.fail(
        manager,
        'TITULAR',
        item.partyId,
        item.requestId,
        item.eligibleOn,
        'TOO_MANY_CANDIDATES',
      );
    if (plan.blockers.includes('UNRECONCILED_TITULAR'))
      return this.fail(
        manager,
        'TITULAR',
        item.partyId,
        item.requestId,
        item.eligibleOn,
        'UNRECONCILED_SCOPE',
      );
    if (plan.blockers.includes('ACTIVE_USER_ACCOUNT'))
      return this.fail(
        manager,
        'TITULAR',
        item.partyId,
        item.requestId,
        item.eligibleOn,
        'ACTIVE_ACCOUNT',
      );
    if (plan.blockers.includes('SUPPLIER_PROFILE_LINKED'))
      return this.fail(
        manager,
        'TITULAR',
        item.partyId,
        item.requestId,
        item.eligibleOn,
        'SUPPLIER_LINKED',
      );
    let changedRows = 0;
    try {
      const applied = await this.erasurePort.anonymize(
        { ...target, expedienteIds: plan.candidateExpedienteIds, actorId },
        { manager },
      );
      changedRows = applied.changedRows;
    } catch (error) {
      return this.fail(
        manager,
        'TITULAR',
        item.partyId,
        item.requestId,
        item.eligibleOn,
        this.toReasonCode(error),
      );
    }
    await this.closeBlockedMark(manager, item.partyId, item.requestId, actorId);
    await this.writeLedger(
      manager,
      'TITULAR',
      item.partyId,
      item.requestId,
      item.eligibleOn,
      'COMPLETE',
      changedRows,
    );
    await this.auditPort?.logWithin(
      {
        action: AuditAction.UPDATE,
        entityType: 'RetentionExpiryRun',
        entityId: item.partyId,
        userId: actorId,
        newValue: { operation: 'RETENTION_EXPIRY_TITULAR', requestId: item.requestId, changedRows },
      },
      manager,
    );
    return null;
  }

  private async processProspecto(
    manager: EntityManager,
    actorId: string,
    item: { expedienteId: string; eligibleOn: string },
    today: string,
  ): Promise<RetentionExpiryReason | null> {
    if (!this.erasurePort)
      return this.fail(
        manager,
        'TITULAR',
        item.expedienteId,
        null,
        item.eligibleOn,
        'PORT_UNAVAILABLE',
      );
    // B2-R3 B1: la revalidación pasa por el puerto CRM; el bloqueo FOR UPDATE
    // de la fila ya lo hace resolveProspectScope en el adaptador.
    const revalidate = this.standingPort.findProspectDiscard?.bind(this.standingPort);
    if (!revalidate)
      return this.fail(
        manager,
        'TITULAR',
        item.expedienteId,
        null,
        item.eligibleOn,
        'PORT_UNAVAILABLE',
      );
    const current = (await revalidate([item.expedienteId], { manager }))[0];
    if (!current || !current.discardedAt) {
      return this.fail(
        manager,
        'TITULAR',
        item.expedienteId,
        null,
        item.eligibleOn,
        'PROSPECT_UNRECONCILED',
      );
    }
    await this.lockPolicies(manager, [PROSPECT_RETENTION_CATEGORY, 'PQR_SOPORTES']);
    // B4-R2 M-2: el reloj de PQR_SOPORTES se revalida con la política ya
    // bloqueada; una PQR respondida dentro del plazo conserva al prospecto.
    if (await this.hasProspectDuty(manager, item.expedienteId, today)) {
      return this.fail(
        manager,
        'TITULAR',
        item.expedienteId,
        null,
        item.eligibleOn,
        'PQR_RETENTION',
      );
    }
    // P3: el UUID solo alimenta la marca anonymized_request_id del expediente
    // (diseño vigente del adaptador); el ledger guarda request_id NULL.
    const markingId = randomUUID();
    const target = {
      requestId: markingId,
      partyId: null,
      requesterDocumentHmac: null as string | null,
      prospectExpedienteId: item.expedienteId,
    };
    const plan = await this.erasurePort.plan(target, { manager });
    if (plan.blockers.length > 0)
      return this.fail(
        manager,
        'TITULAR',
        item.expedienteId,
        null,
        item.eligibleOn,
        'UNRECONCILED_SCOPE',
      );
    let changedRows = 0;
    try {
      const applied = await this.erasurePort.anonymize(
        { ...target, expedienteIds: [item.expedienteId], actorId },
        { manager },
      );
      changedRows = applied.changedRows;
    } catch (error) {
      return this.fail(
        manager,
        'TITULAR',
        item.expedienteId,
        null,
        item.eligibleOn,
        this.toReasonCode(error),
      );
    }
    await this.writeLedger(
      manager,
      'TITULAR',
      item.expedienteId,
      null,
      item.eligibleOn,
      'COMPLETE',
      changedRows,
    );
    await this.auditPort?.logWithin(
      {
        action: AuditAction.UPDATE,
        entityType: 'RetentionExpiryRun',
        entityId: item.expedienteId,
        userId: actorId,
        newValue: { operation: 'RETENTION_EXPIRY_PROSPECTO', changedRows },
      },
      manager,
    );
    return null;
  }

  private async processSolicitud(
    manager: EntityManager,
    actorId: string,
    item: { requestId: string; anchor: string | null; eligibleOn: string },
    today: string,
  ): Promise<RetentionExpiryReason | null> {
    const locked = (await manager.query(
      `SELECT id::text AS id, status AS status, party_id::text AS party_id,
              minimized_at AS minimized_at, transferred_to AS transferred_to,
              transfer_destination_kind AS kind,
              transfer_destination_code AS code,
              transfer_destination_name AS name
         FROM data_subject_requests WHERE id = $1 FOR UPDATE`,
      [item.requestId],
    )) as Array<{
      id: string;
      status: string;
      party_id: string | null;
      minimized_at: Date | string | null;
      transferred_to: string | null;
      kind: string | null;
      code: string | null;
      name: string | null;
    }>;
    const current = locked[0];
    if (!current || current.minimized_at) {
      return this.fail(
        manager,
        'REQUEST',
        item.requestId,
        null,
        item.eligibleOn,
        'REQUEST_CHANGED',
      );
    }
    if (current.party_id) {
      const open = (await manager.query(
        `SELECT 1 FROM data_subject_requests
          WHERE party_id = $1 AND status IN ('RADICADA', 'INCOMPLETA', 'EN_TRAMITE', 'PRORROGADA')
          LIMIT 1`,
        [current.party_id],
      )) as Array<{ [key: string]: unknown }>;
      if (open.length > 0) {
        return this.fail(
          manager,
          'REQUEST',
          item.requestId,
          null,
          item.eligibleOn,
          'REQUEST_ACTIVE_HOLD',
        );
      }
    }
    const pending = (await manager.query(
      `SELECT kind AS kind FROM data_subject_request_tasks
        WHERE request_id = $1 AND done_at IS NULL AND kind <> 'CLASIFICAR_DESTINO_TRASLADO'`,
      [item.requestId],
    )) as Array<{ kind: string }>;
    if (pending.length > 0) {
      return this.fail(
        manager,
        'REQUEST',
        item.requestId,
        null,
        item.eligibleOn,
        'REQUEST_ACTIVE_HOLD',
      );
    }
    const classification = await this.classifyTransfer(
      manager,
      item.requestId,
      current.transferred_to,
      current.kind,
      today,
    );
    if (classification.status === 'CLASSIFICATION_INVALID') {
      return this.fail(
        manager,
        'REQUEST',
        item.requestId,
        null,
        item.eligibleOn,
        'CLASSIFICATION_INVALID',
      );
    }
    const { kind, code, name } = classification;
    await manager.query(
      `UPDATE data_subject_requests SET
         requester_name_encrypted = NULL, requester_document_type = NULL,
         requester_document_encrypted = NULL, requester_contact_encrypted = NULL,
         requester_document_hmac = NULL, requester_evidence_media_id = NULL,
         response_text = NULL, party_id = NULL,
         suspended_contract_ids = '{}', disputed_contract_ids = '{}',
         transfer_destination_kind = $2, transfer_destination_code = $3,
         transfer_destination_name = $4,
         transferred_to = CASE WHEN $2 = 'UNCLASSIFIED' THEN transferred_to ELSE NULL END,
         minimized_at = now(), retention_closed_at = now()
       WHERE id = $1 AND minimized_at IS NULL`,
      [item.requestId, kind, code, name],
    );
    await manager.query(
      `UPDATE data_subject_request_tasks SET note = NULL
        WHERE request_id = $1 AND note IS NOT NULL`,
      [item.requestId],
    );
    await manager.query(
      `UPDATE data_subject_request_events SET reason = NULL
        WHERE request_id = $1 AND reason IS NOT NULL
          AND reason NOT IN ('RESOLVE', 'TRASLADO', 'DESISTIMIENTO', 'PRORROGA', 'REAPERTURA')
          AND reason NOT LIKE 'TAREA_COMPLETADA:%'`,
      [item.requestId],
    );
    await this.writeLedger(
      manager,
      'REQUEST',
      item.requestId,
      null,
      item.eligibleOn,
      'COMPLETE',
      1,
    );
    await this.auditPort?.logWithin(
      {
        action: AuditAction.UPDATE,
        entityType: 'RetentionExpiryRun',
        entityId: item.requestId,
        userId: actorId,
        newValue: { operation: 'RETENTION_EXPIRY_SOLICITUD', transferKind: kind },
      },
      manager,
    );
    return kind === 'UNCLASSIFIED' ? 'REQUEST_ACTIVE_HOLD' : null;
  }

  /**
   * Clasificación del traslado (D-EXP-3). Sin texto libre nunca es institución:
   * con destino presente y sin clasificar se retiene como UNCLASSIFIED con
   * tarea de 5 días hábiles; PERSON minimiza todo; una fila ya clasificada
   * conserva su tripleta. `transferred_to` solo sobrevive en UNCLASSIFIED.
   */
  private async classifyTransfer(
    manager: EntityManager,
    requestId: string,
    transferredTo: string | null,
    currentKind: string | null,
    today: string,
  ): Promise<
    | {
        status: 'INSTITUTION' | 'PERSON' | 'UNCLASSIFIED';
        kind: string;
        code: string | null;
        name: string | null;
      }
    | { status: null; kind: null; code: null; name: null }
    | { status: 'CLASSIFICATION_INVALID'; kind: null; code: null; name: null }
  > {
    if (
      currentKind === 'INSTITUTION' ||
      currentKind === 'PERSON' ||
      currentKind === 'UNCLASSIFIED'
    ) {
      const current = (await manager.query(
        `SELECT transfer_destination_code AS code, transfer_destination_name AS name
           FROM data_subject_requests WHERE id = $1`,
        [requestId],
      )) as Array<{ code: string | null; name: string | null }>;
      return {
        status: currentKind,
        kind: currentKind,
        code: current[0]?.code ?? null,
        name: current[0]?.name ?? null,
      };
    }
    if (!transferredTo) return { status: null, kind: null, code: null, name: null };
    if (currentKind)
      return { status: 'CLASSIFICATION_INVALID', kind: null, code: null, name: null };
    const open = (await manager.query(
      `SELECT id::text AS id FROM data_subject_request_tasks
        WHERE request_id = $1 AND kind = 'CLASIFICAR_DESTINO_TRASLADO' AND done_at IS NULL
        LIMIT 1`,
      [requestId],
    )) as Array<{ id: string }>;
    if (open.length === 0) {
      await manager.query(
        `INSERT INTO data_subject_request_tasks (request_id, kind, due_at, note)
         VALUES ($1, 'CLASIFICAR_DESTINO_TRASLADO', $2, NULL)`,
        [requestId, addColombiaBusinessDays(today, CLASSIFICATION_SLA_BUSINESS_DAYS)],
      );
    }
    return { status: 'UNCLASSIFIED', kind: 'UNCLASSIFIED', code: null, name: null };
  }

  // -- Infraestructura -----------------------------------------------------

  private async inSavepoint(
    manager: EntityManager,
    name: string,
    ledger: {
      tipo: 'TITULAR' | 'REQUEST';
      targetId: string;
      requestId: string | null;
      eligibleOn: string;
    },
    operation: () => Promise<RetentionExpiryReason | null>,
  ): Promise<RetentionExpiryReason | null> {
    await manager.query(`SAVEPOINT ${name}`);
    try {
      const reason = await operation();
      await manager.query(`RELEASE SAVEPOINT ${name}`);
      return reason;
    } catch (error) {
      await manager.query(`ROLLBACK TO SAVEPOINT ${name}`);
      await manager.query(`RELEASE SAVEPOINT ${name}`);
      const reason = this.toReasonCode(error);
      const terminal = reason === 'PARTICIPANT_ERROR' || reason === 'RESIDUAL_MISMATCH';
      // B2-R2: el throw revierte el objetivo, pero el acto queda registrado
      // con su código saneado en lugar de perderse en el resumen en memoria.
      await this.writeLedger(
        manager,
        ledger.tipo,
        ledger.targetId,
        ledger.requestId,
        ledger.eligibleOn,
        terminal ? 'FAILED' : 'ATTENTION_REQUIRED',
        0,
        reason,
      );
      return reason;
    }
  }

  private async fail(
    manager: EntityManager,
    tipo: 'TITULAR' | 'REQUEST',
    targetId: string,
    requestId: string | null,
    eligibleOn: string,
    reason: RetentionExpiryReason,
  ): Promise<RetentionExpiryReason> {
    const terminal = reason === 'PARTICIPANT_ERROR' || reason === 'RESIDUAL_MISMATCH';
    await this.writeLedger(
      manager,
      tipo,
      targetId,
      requestId,
      eligibleOn,
      terminal ? 'FAILED' : 'ATTENTION_REQUIRED',
      0,
      reason,
    );
    return reason;
  }

  private async writeLedger(
    manager: EntityManager,
    tipo: 'TITULAR' | 'REQUEST',
    targetId: string,
    requestId: string | null,
    eligibleOn: string,
    estado: 'COMPLETE' | 'FAILED' | 'ATTENTION_REQUIRED',
    changedRows: number,
    reasonCode: RetentionExpiryReason | null = null,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO privacy_retention_expiry_runs
         (tipo, target_id, request_id, eligible_on, rules_version, estado, changed_rows, completed_at, reason_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8)
       ON CONFLICT (tipo, target_id, rules_version) DO UPDATE SET
         estado = EXCLUDED.estado, changed_rows = EXCLUDED.changed_rows,
         completed_at = EXCLUDED.completed_at,
         request_id = COALESCE(EXCLUDED.request_id, privacy_retention_expiry_runs.request_id),
          reason_code = EXCLUDED.reason_code`,
      [
        tipo,
        targetId,
        requestId,
        eligibleOn,
        RETENTION_EXPIRY_RULES_VERSION,
        estado,
        changedRows,
        reasonCode,
      ],
    );
  }

  private async isComplete(
    manager: EntityManager,
    tipo: 'TITULAR' | 'REQUEST',
    targetId: string,
  ): Promise<boolean> {
    const rows = (await manager.query(
      `SELECT estado FROM privacy_retention_expiry_runs
        WHERE tipo = $1 AND target_id = $2::uuid AND rules_version = $3`,
      [tipo, targetId, RETENTION_EXPIRY_RULES_VERSION],
    )) as Array<{ estado: string }>;
    return rows[0]?.estado === 'COMPLETE';
  }

  private async saveCursor(
    manager: EntityManager,
    runId: string,
    cursor: RetentionExpiryCursor,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO privacy_retention_expiry_cursors (run_id, phase, last_eligible_on, last_id, updated_at)
       VALUES ($1::uuid, $2, $3, $4::uuid, now())
       ON CONFLICT (run_id) DO UPDATE SET
         phase = EXCLUDED.phase, last_eligible_on = EXCLUDED.last_eligible_on,
         last_id = EXCLUDED.last_id, updated_at = now()`,
      [runId, cursor.phase, cursor.eligibleOn, cursor.id],
    );
  }

  private async loadCursor(
    manager: EntityManager,
    runId: string,
  ): Promise<RetentionExpiryCursor | null> {
    const rows = (await manager.query(
      `SELECT phase AS phase, last_eligible_on::text AS eligible_on, last_id::text AS id
         FROM privacy_retention_expiry_cursors WHERE run_id = $1::uuid`,
      [runId],
    )) as Array<{ phase: RetentionExpiryPhase; eligible_on: string; id: string }>;
    const row = rows[0];
    if (!row || !row.eligible_on || !row.id) return null;
    return { phase: row.phase, eligibleOn: row.eligible_on, id: row.id };
  }

  private async lockPolicies(manager: EntityManager, categories: string[]): Promise<void> {
    await manager.query(
      'SELECT category FROM retention_policies WHERE category = ANY($1) FOR UPDATE',
      [categories],
    );
  }

  private async policyYears(manager: EntityManager, category: string): Promise<number> {
    const rows = (await manager.query('SELECT years FROM retention_policies WHERE category = $1', [
      category,
    ])) as Array<{ years: number }>;
    const years = Number(rows[0]?.years ?? 0);
    if (!years) throw new Error(`Missing retention policy: ${category}`);
    return years;
  }

  private async markStillOpen(manager: EntityManager, partyId: string): Promise<boolean> {
    const rows = (await manager.query(
      `SELECT event FROM party_privacy_marks
        WHERE party_id = $1 AND mark = 'DATOS_BLOQUEADOS'
        ORDER BY occurred_at DESC, id DESC LIMIT 1 FOR UPDATE`,
      [partyId],
    )) as Array<{ event: string }>;
    return rows[0]?.event === 'OPEN';
  }

  private async closeBlockedMark(
    manager: EntityManager,
    partyId: string,
    requestId: string,
    actorId: string,
  ): Promise<void> {
    if (!(await this.markStillOpen(manager, partyId))) return;
    await manager.query(
      `INSERT INTO party_privacy_marks (party_id, mark, event, request_id, actor_id)
       VALUES ($1, 'DATOS_BLOQUEADOS', 'CLOSE', $2, $3)`,
      [partyId, requestId, actorId],
    );
  }

  /**
   * B4-R2 M-2 (ADR-104): al prospecto se le aplica el reloj completo de
   * PQR_SOPORTES, igual que al titular: retiene toda PQR pendiente y la
   * respondida hasta 3 años (catálogo) desde la notificación o la respuesta.
   * Los soportes se conservan por la PQR, no por el tipo de titular.
   */
  private async hasProspectDuty(
    manager: EntityManager,
    expedienteId: string,
    today: string,
  ): Promise<boolean> {
    if (!this.pqrRetentionPort) throw new Error('PQR retention port is not registered');
    return hasPqrConservationDuty(
      this.pqrRetentionPort,
      { subscriberIds: [], contractIds: [], expedienteIds: [expedienteId] },
      manager,
      today,
    );
  }

  private async countProspectosVencidos(manager: EntityManager, today: string): Promise<number> {
    const { eligible } = await this.selectProspectos(manager, today, null);
    return eligible.filter((item) => !item.alreadyComplete).length;
  }

  private async oldestProspectoEligible(manager: EntityManager, today: string): Promise<string[]> {
    const { eligible } = await this.selectProspectos(manager, today, null);
    return eligible.filter((item) => !item.alreadyComplete).map((item) => item.eligibleOn);
  }

  private oldestEligible(dates: string[]): string | null {
    return dates.length > 0 ? ([...dates].sort()[0] ?? null) : null;
  }

  private toReasonCode(error: unknown): RetentionExpiryReason {
    const message = error instanceof Error ? error.message : String(error);
    if (/CONTRACT_UNRECONCILED/i.test(message)) return 'CONTRACT_UNRECONCILED';
    if (/FISCAL_UNRECONCILED/i.test(message)) return 'FISCAL_UNRECONCILED';
    if (/retention policy/i.test(message)) return 'MISSING_POLICY';
    if (/not registered|no.+disponible|ServiceUnavailable/i.test(message))
      return 'PORT_UNAVAILABLE';
    if (/UNRECONCILED_TITULAR|sin conciliar/i.test(message)) return 'UNRECONCILED_SCOPE';
    if (/ACTIVE_USER_ACCOUNT|cuenta.*activa/i.test(message)) return 'ACTIVE_ACCOUNT';
    if (/SUPPLIER_PROFILE_LINKED|proveedor/i.test(message)) return 'SUPPLIER_LINKED';
    if (/500 expedientes|TOO_MANY/i.test(message)) return 'TOO_MANY_CANDIDATES';
    if (/VERIFICATION_FAILED|residual/i.test(message)) return 'RESIDUAL_MISMATCH';
    if (/column|relation|schema/i.test(message)) return 'SCHEMA_INCOMPATIBLE';
    return 'PARTICIPANT_ERROR';
  }
}
