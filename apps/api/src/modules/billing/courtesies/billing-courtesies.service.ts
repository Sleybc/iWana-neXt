import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  AuditAction,
  BILLING_ERROR_CODES,
  type BillingCourtesyApplication,
  type BillingCourtesyResponse,
  type GrantCourtesyCommand,
  type VoidCourtesyCommand,
} from '@iwana/shared';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { BillingContractReadPort } from '../ports/billing-contract-read.port';
import { BillingPaymentsService, type PeriodEvent } from '../payments/billing-payments.service';
import { COURTESY_COLUMNS, toCourtesyResponse, type CourtesyRow } from './billing-courtesy.mapper';
import { activeCourtesySum } from './billing-courtesy.sql';

type DocumentStatus = 'BORRADOR' | 'EMITIDO' | 'ANULADO' | 'IMPORTADO';

interface LockedDocument {
  id: string;
  subscriber_id: string;
  period_id: string | null;
  status: DocumentStatus;
  total: string;
}

interface LineRow {
  id: string;
  kind: string;
  description: string;
  base_amount: string;
  tax_amount: string;
  total: string;
  vat_treatment: string;
  vat_rate: string;
  vat_legal_basis: string | null;
}

/** Centavos de un numeric(14,2) serializado; admite signo (líneas de cortesía). */
export function toCents(value: string | number): number {
  const decimal = typeof value === 'number' ? value.toFixed(2) : value.trim();
  const match = /^(-)?(\d{1,12})(?:\.(\d{1,2}))?$/u.exec(decimal);
  if (!match) throw new RangeError('El monto no tiene un formato monetario válido.');
  const cents = Number(match[2]) * 100 + Number((match[3] ?? '').padEnd(2, '0'));
  return match[1] ? -cents : cents;
}

export function fromCents(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Separa un valor con IVA incluido en base e impuesto a la tarifa porcentual dada (R4, borrador
 * por valor). El impuesto se redondea al centavo y la base es el resto: base + IVA = valor.
 */
export function splitVatIncluded(
  totalCents: number,
  ratePercent: number,
): { base: number; tax: number } {
  if (!(ratePercent > 0)) return { base: totalCents, tax: 0 };
  const tax = Math.round((totalCents * ratePercent) / (100 + ratePercent));
  return { base: totalCents - tax, tax };
}

function error(code: string, message: string) {
  return { code, message };
}

/**
 * Cortesías de MOD14 (spec 2026-11-12 D4, D5, R4-R6).
 *
 * - BORRADOR: línea negativa «Cortesía» que baja base, IVA y total del borrador.
 * - EMITIDO o IMPORTADO: ajuste no monetario que baja el saldo pendiente; no es pago ni nota
 *   crédito y no cambia la base gravable ya emitida (R6). Nunca supera el saldo (R5).
 * - ANULADO: no admite cortesías ni anulación de ellas.
 *
 * Bloqueo: titular (advisory de crédito de Billing) → documento → cortesía, el mismo orden que la
 * aplicación de pagos, para que pago y cortesía no saquen el saldo de rango en paralelo.
 */
@Injectable()
export class BillingCourtesiesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly contracts: BillingContractReadPort,
    private readonly payments: BillingPaymentsService,
  ) {}

  async grant(
    documentId: string,
    command: GrantCourtesyCommand,
    actorId: string,
    idempotencyKey: string | undefined,
  ): Promise<BillingCourtesyResponse> {
    const key = this.requireIdempotencyKey(idempotencyKey);
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const { courtesy, events } = await runInTenantSchema(
      this.dataSource,
      schemaName,
      async (qr) => {
        const manager = qr.manager;
        const document = await this.lockDocument(manager, tenantId, documentId);
        // Con el documento bloqueado, un reintento concurrente ya ve la fila confirmada.
        const replay = await this.findByGrantKey(manager, tenantId, key);
        if (replay) {
          this.assertSameGrant(replay, document.id, command);
          return { courtesy: toCourtesyResponse(replay), events: [] as PeriodEvent[] };
        }
        if (document.status === 'ANULADO')
          throw new ConflictException(
            error(
              BILLING_ERROR_CODES.BILLING_COURTESY_DOCUMENT_NOT_ELIGIBLE,
              'Un documento anulado no admite cortesías.',
            ),
          );
        await this.assertTitularWritable(manager, document.subscriber_id);

        const source =
          command.target === 'LINEA'
            ? await this.eligibleSourceLine(manager, tenantId, document.id, command.lineId!)
            : null;
        const amountCents = source ? toCents(source.total) : toCents(String(command.amount));
        if (amountCents <= 0)
          throw new UnprocessableEntityException(
            error('VALIDATION_ERROR', 'La cortesía debe tener un valor mayor que cero.'),
          );

        const application: BillingCourtesyApplication =
          document.status === 'BORRADOR' ? 'LINEA_EN_BORRADOR' : 'AJUSTE_SOBRE_EMITIDO';
        let lineId: string | null = null;
        const periodEvents: PeriodEvent[] = [];
        if (application === 'LINEA_EN_BORRADOR') {
          if (amountCents > toCents(document.total)) throw this.exceeds();
          lineId = await this.insertDraftLine(manager, tenantId, document.id, amountCents, source);
          await this.recomputeDraftTotals(manager, tenantId, document.id);
        } else {
          const pending = await this.pendingCents(manager, tenantId, document.id);
          if (amountCents > pending) throw this.exceeds();
        }

        let rows: CourtesyRow[];
        try {
          rows = (await manager.query(
            `INSERT INTO billing_courtesies AS c
               (tenant_id, document_id, subscriber_id, application, target, source_line_id,
                line_id, amount, reason_code, note, created_by, idempotency_key)
             VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6::uuid, $7::uuid, $8::numeric, $9, $10,
                     $11::uuid, $12)
             RETURNING ${COURTESY_COLUMNS}`,
            [
              tenantId,
              document.id,
              document.subscriber_id,
              application,
              command.target,
              source?.id ?? null,
              lineId,
              fromCents(amountCents),
              command.reasonCode,
              command.note ?? null,
              actorId,
              key,
            ],
          )) as CourtesyRow[];
        } catch (cause) {
          if (this.isUniqueViolation(cause, 'uq_billing_courtesies_source_line_active'))
            throw this.lineNotEligible();
          // Otro documento ya usó la clave: el mismo documento estaría serializado por su bloqueo.
          if (this.isUniqueViolation(cause, 'uq_billing_courtesies_idempotency'))
            throw this.idempotencyConflict();
          throw cause;
        }
        const created = rows[0];
        if (!created) throw new Error('No se pudo registrar la cortesía.');

        if (application === 'AJUSTE_SOBRE_EMITIDO' && document.period_id)
          periodEvents.push(
            ...(await this.payments.recalculateSignals(manager, tenantId, [document.period_id])),
          );

        await this.audit.logWithin(
          {
            action: AuditAction.CREATE,
            entityType: 'BillingCourtesy',
            entityId: created.id,
            userId: actorId,
            // Sin la nota: es texto libre y la auditoría no se suprime con el titular.
            newValue: {
              documentId: document.id,
              documentStatus: document.status,
              application,
              target: command.target,
              sourceLineId: source?.id ?? null,
              lineId,
              amount: created.amount,
              reasonCode: command.reasonCode,
              hasNote: command.note !== undefined,
            },
          },
          manager,
        );
        return { courtesy: toCourtesyResponse(created), events: periodEvents };
      },
    );
    await this.payments.emitEvents(events);
    return courtesy;
  }

  async void(
    courtesyId: string,
    command: VoidCourtesyCommand,
    actorId: string,
    idempotencyKey: string | undefined,
  ): Promise<BillingCourtesyResponse> {
    const key = this.requireIdempotencyKey(idempotencyKey);
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const { courtesy, events } = await runInTenantSchema(
      this.dataSource,
      schemaName,
      async (qr) => {
        const manager = qr.manager;
        const found = (await manager.query(
          'SELECT document_id::text FROM billing_courtesies WHERE tenant_id = $1 AND id = $2::uuid',
          [tenantId, courtesyId],
        )) as Array<{ document_id: string }>;
        if (!found[0]) throw this.courtesyNotFound();
        const document = await this.lockDocument(manager, tenantId, found[0].document_id);
        const locked = (await manager.query(
          `SELECT ${COURTESY_COLUMNS} FROM billing_courtesies c
            WHERE c.tenant_id = $1 AND c.id = $2::uuid FOR UPDATE`,
          [tenantId, courtesyId],
        )) as CourtesyRow[];
        const current = locked[0];
        if (!current) throw this.courtesyNotFound();
        if (current.status === 'ANULADA' && current.void_idempotency_key === key) {
          if (
            current.void_reason_code !== command.reasonCode ||
            current.void_note !== (command.note ?? null)
          )
            throw this.idempotencyConflict();
          return { courtesy: toCourtesyResponse(current), events: [] as PeriodEvent[] };
        }
        if (current.status === 'ANULADA')
          throw new ConflictException(
            error(
              BILLING_ERROR_CODES.BILLING_COURTESY_ALREADY_VOIDED,
              'La cortesía ya está anulada.',
            ),
          );
        if (document.status === 'ANULADO')
          throw new ConflictException(
            error(
              BILLING_ERROR_CODES.BILLING_COURTESY_DOCUMENT_NOT_ELIGIBLE,
              'Un documento anulado no admite cambios de cortesías.',
            ),
          );
        // La línea de un borrador ya emitido es parte del documento fiscal: no se retira.
        if (current.application === 'LINEA_EN_BORRADOR' && document.status !== 'BORRADOR')
          throw new ConflictException(
            error(
              BILLING_ERROR_CODES.BILLING_COURTESY_NOT_VOIDABLE,
              'La cortesía quedó dentro de un documento emitido y no se puede anular.',
            ),
          );
        await this.assertTitularWritable(manager, document.subscriber_id);

        // La línea del borrador se retira: line_id queda en null, como en las lecturas.
        let updated: [CourtesyRow[], number];
        try {
          updated = (await manager.query(
            `UPDATE billing_courtesies AS c
                SET status = 'ANULADA', void_reason_code = $3, void_note = $4,
                    voided_at = now(), voided_by = $5::uuid, void_idempotency_key = $6,
                    line_id = CASE WHEN c.application = 'LINEA_EN_BORRADOR' THEN NULL
                                   ELSE c.line_id END
              WHERE c.tenant_id = $1 AND c.id = $2::uuid
              RETURNING ${COURTESY_COLUMNS}`,
            [tenantId, courtesyId, command.reasonCode, command.note ?? null, actorId, key],
          )) as [CourtesyRow[], number];
        } catch (cause) {
          if (this.isUniqueViolation(cause, 'uq_billing_courtesies_void_idempotency'))
            throw this.idempotencyConflict();
          throw cause;
        }
        const row = updated[0]?.[0];
        if (!row) throw new Error('No se pudo anular la cortesía.');

        const periodEvents: PeriodEvent[] = [];
        if (current.application === 'LINEA_EN_BORRADOR') {
          if (current.line_id)
            await manager.query(
              `DELETE FROM billing_document_lines
                WHERE tenant_id = $1 AND id = $2::uuid AND kind = 'CORTESIA'`,
              [tenantId, current.line_id],
            );
          await this.recomputeDraftTotals(manager, tenantId, document.id);
        } else if (document.period_id) {
          periodEvents.push(
            ...(await this.payments.recalculateSignals(manager, tenantId, [document.period_id])),
          );
        }

        await this.audit.logWithin(
          {
            action: AuditAction.UPDATE,
            entityType: 'BillingCourtesy',
            entityId: courtesyId,
            userId: actorId,
            oldValue: { status: 'ACTIVA' },
            newValue: {
              status: 'ANULADA',
              documentId: document.id,
              application: current.application,
              amount: current.amount,
              voidReasonCode: command.reasonCode,
              hasNote: command.note !== undefined,
            },
          },
          manager,
        );
        return { courtesy: toCourtesyResponse(row), events: periodEvents };
      },
    );
    await this.payments.emitEvents(events);
    return courtesy;
  }

  /** Bloquea titular y documento en el orden de la aplicación de pagos. */
  private async lockDocument(
    manager: EntityManager,
    tenantId: string,
    documentId: string,
  ): Promise<LockedDocument> {
    const peek = (await manager.query(
      'SELECT subscriber_id::text FROM billing_documents WHERE tenant_id = $1 AND id = $2::uuid',
      [tenantId, documentId],
    )) as Array<{ subscriber_id: string }>;
    if (!peek[0])
      throw new NotFoundException(
        error('BILLING_DOCUMENT_NOT_FOUND', 'No se encontró el documento.'),
      );
    await this.payments.lockSubscriber(manager, peek[0].subscriber_id);
    const rows = (await manager.query(
      `SELECT id::text, subscriber_id::text, period_id::text, status, total::text
         FROM billing_documents WHERE tenant_id = $1 AND id = $2::uuid FOR UPDATE`,
      [tenantId, documentId],
    )) as LockedDocument[];
    const document = rows[0];
    if (!document)
      throw new NotFoundException(
        error('BILLING_DOCUMENT_NOT_FOUND', 'No se encontró el documento.'),
      );
    return document;
  }

  private async assertTitularWritable(manager: EntityManager, subscriberId: string) {
    const titular = await this.contracts.lockTitularForBillingWrite(subscriberId, { manager });
    if (!titular.exists || titular.anonymized)
      throw new ConflictException(
        error(BILLING_ERROR_CODES.PRIVACY_TITULAR_ANONYMIZED, 'El titular está anonimizado.'),
      );
  }

  private async eligibleSourceLine(
    manager: EntityManager,
    tenantId: string,
    documentId: string,
    lineId: string,
  ): Promise<LineRow> {
    const rows = (await manager.query(
      `SELECT l.id::text, l.kind, l.description, l.base_amount::text, l.tax_amount::text,
              l.total::text, l.vat_treatment, l.vat_rate::text, l.vat_legal_basis,
              EXISTS (SELECT 1 FROM billing_courtesies c
                       WHERE c.source_line_id = l.id AND c.tenant_id = l.tenant_id
                         AND c.status = 'ACTIVA') AS gifted
         FROM billing_document_lines l
        WHERE l.tenant_id = $1 AND l.document_id = $2::uuid AND l.id = $3::uuid`,
      [tenantId, documentId, lineId],
    )) as Array<LineRow & { gifted: boolean }>;
    const line = rows[0];
    if (!line || line.kind === 'CORTESIA' || toCents(line.total) <= 0 || line.gifted)
      throw this.lineNotEligible();
    return line;
  }

  private async insertDraftLine(
    manager: EntityManager,
    tenantId: string,
    documentId: string,
    amountCents: number,
    source: LineRow | null,
  ): Promise<string> {
    let base: number;
    let tax: number;
    let vat: { treatment: string; rate: string; legalBasis: string | null };
    if (source) {
      base = toCents(source.base_amount);
      tax = toCents(source.tax_amount);
      vat = {
        treatment: source.vat_treatment,
        rate: source.vat_rate,
        legalBasis: source.vat_legal_basis,
      };
    } else {
      // Por valor: el IVA se separa con la única tarifa del borrador; con varias, por línea.
      const treatments = (await manager.query(
        `SELECT DISTINCT vat_treatment, vat_rate::text, vat_legal_basis
           FROM billing_document_lines
          WHERE tenant_id = $1 AND document_id = $2::uuid AND kind <> 'CORTESIA' AND total > 0`,
        [tenantId, documentId],
      )) as Array<{ vat_treatment: string; vat_rate: string; vat_legal_basis: string | null }>;
      if (treatments.length !== 1)
        throw new UnprocessableEntityException(
          error(
            BILLING_ERROR_CODES.BILLING_COURTESY_MIXED_VAT,
            'El borrador tiene conceptos con IVA distinto: otorga la cortesía por línea.',
          ),
        );
      const only = treatments[0]!;
      ({ base, tax } = splitVatIncluded(amountCents, Number(only.vat_rate)));
      vat = {
        treatment: only.vat_treatment,
        rate: only.vat_rate,
        legalBasis: only.vat_legal_basis,
      };
    }
    const description = source ? `Cortesía: ${source.description}`.slice(0, 200) : 'Cortesía';
    const inserted = (await manager.query(
      `INSERT INTO billing_document_lines
         (tenant_id, document_id, kind, description, quantity, unit_price, base_amount,
          tax_amount, total, vat_treatment, vat_rate, vat_legal_basis, position)
       SELECT $1, $2::uuid, 'CORTESIA', $3, 1, $4::numeric, $4::numeric, $5::numeric,
              $6::numeric, $7, $8::numeric, $9,
              COALESCE((SELECT MAX(position) + 1 FROM billing_document_lines
                         WHERE tenant_id = $1 AND document_id = $2::uuid), 0)
       RETURNING id::text`,
      [
        tenantId,
        documentId,
        description,
        fromCents(-base),
        fromCents(-tax),
        fromCents(-amountCents),
        vat.treatment,
        vat.rate,
        vat.legalBasis,
      ],
    )) as Array<{ id: string }>;
    const id = inserted[0]?.id;
    if (!id) throw new Error('No se pudo crear la línea de cortesía.');
    return id;
  }

  private async recomputeDraftTotals(
    manager: EntityManager,
    tenantId: string,
    documentId: string,
  ): Promise<void> {
    await manager.query(
      `UPDATE billing_documents d
          SET subtotal = t.subtotal, tax_total = t.tax_total, total = t.total, updated_at = now()
         FROM (SELECT COALESCE(SUM(base_amount), 0) AS subtotal,
                      COALESCE(SUM(tax_amount), 0) AS tax_total,
                      COALESCE(SUM(total), 0) AS total
                 FROM billing_document_lines
                WHERE tenant_id = $1 AND document_id = $2::uuid) t
        WHERE d.tenant_id = $1 AND d.id = $2::uuid AND d.status = 'BORRADOR'`,
      [tenantId, documentId],
    );
  }

  /** Saldo pendiente: total − aplicaciones vigentes − ajustes de cortesía activos (R5). */
  private async pendingCents(
    manager: EntityManager,
    tenantId: string,
    documentId: string,
  ): Promise<number> {
    const rows = (await manager.query(
      `SELECT (d.total
               - COALESCE((SELECT SUM(a.amount) FROM billing_payment_allocations a
                            WHERE a.document_id = d.id AND a.tenant_id = d.tenant_id
                              AND a.reversed_at IS NULL), 0)
               - ${activeCourtesySum('d')})::numeric(14,2)::text AS pending
         FROM billing_documents d WHERE d.tenant_id = $1 AND d.id = $2::uuid`,
      [tenantId, documentId],
    )) as Array<{ pending: string }>;
    return Math.max(0, toCents(rows[0]?.pending ?? '0'));
  }

  private isUniqueViolation(cause: unknown, constraint: string): boolean {
    const driver =
      typeof cause === 'object' && cause !== null && 'driverError' in cause
        ? (cause as { driverError?: { code?: string; constraint?: string } }).driverError
        : (cause as { code?: string; constraint?: string } | null);
    return driver?.code === '23505' && driver.constraint === constraint;
  }

  /** Misma regla que el registro de pagos: obligatoria, no vacía y de hasta 80 caracteres. */
  private requireIdempotencyKey(key: string | undefined): string {
    if (!key || key.trim().length === 0 || key.length > 80)
      throw new UnprocessableEntityException(
        error(
          'IDEMPOTENCY_KEY_REQUIRED',
          'La clave de idempotencia es obligatoria y admite hasta 80 caracteres.',
        ),
      );
    return key;
  }

  private async findByGrantKey(
    manager: EntityManager,
    tenantId: string,
    key: string,
  ): Promise<CourtesyRow | null> {
    const rows = (await manager.query(
      `SELECT ${COURTESY_COLUMNS} FROM billing_courtesies c
        WHERE c.tenant_id = $1 AND c.idempotency_key = $2 FOR UPDATE OF c`,
      [tenantId, key],
    )) as CourtesyRow[];
    return rows[0] ?? null;
  }

  /** El reintento solo devuelve la cortesía si el comando es el mismo; si no, 409. */
  private assertSameGrant(
    existing: CourtesyRow,
    documentId: string,
    command: GrantCourtesyCommand,
  ): void {
    const same =
      existing.document_id === documentId &&
      existing.target === command.target &&
      existing.reason_code === command.reasonCode &&
      existing.note === (command.note ?? null) &&
      (command.target === 'LINEA'
        ? existing.source_line_id === command.lineId
        : existing.amount === fromCents(toCents(String(command.amount))));
    if (!same) throw this.idempotencyConflict();
  }

  private idempotencyConflict(): ConflictException {
    return new ConflictException(
      error(
        BILLING_ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
        'La clave de idempotencia ya se usó con otro contenido.',
      ),
    );
  }

  private exceeds(): ConflictException {
    return new ConflictException(
      error(
        BILLING_ERROR_CODES.BILLING_COURTESY_EXCEEDS_BALANCE,
        'La cortesía supera el saldo del documento.',
      ),
    );
  }

  private lineNotEligible(): ConflictException {
    return new ConflictException(
      error(
        BILLING_ERROR_CODES.BILLING_COURTESY_LINE_NOT_ELIGIBLE,
        'La línea no existe en el documento, no tiene valor o ya fue regalada.',
      ),
    );
  }

  private courtesyNotFound(): NotFoundException {
    return new NotFoundException(
      error(BILLING_ERROR_CODES.BILLING_COURTESY_NOT_FOUND, 'No se encontró la cortesía.'),
    );
  }
}
