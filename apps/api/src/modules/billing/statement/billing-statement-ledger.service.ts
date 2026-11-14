import { Injectable } from '@nestjs/common';
import { TenantContext } from '@iwana/db';
import type { BillingStatementLedger, BillingStatementLedgerQuery } from '@iwana/shared';
import { SettingsPriorityTenantReadPort } from '../../tenant/ports/settings-priority-tenant-read.port';
import {
  BillingPaymentsService,
  type PaymentReadAccess,
} from '../payments/billing-payments.service';
import { BillingIssuerReadPort } from '../ports/billing-issuer-read.port';
import { buildStatementLedger, toCivilDate } from './billing-statement-ledger';
import { renderStatementLedgerPdf } from './billing-statement-ledger.pdf';

export type LedgerReadAccess = Pick<PaymentReadAccess, 'canSeeBlocked' | 'grantedBy'>;

/**
 * Libro del estado de cuenta (spec MOD05↔MOD14 2026-11-13 D4, D7, R2).
 *
 * No tiene SQL propio de saldos: lee `statementForSubscriber` (mismo filtro de datos bloqueados,
 * mismas fórmulas, 404 si el titular no existe o está anonimizado) y arma el libro con la función
 * pura `buildStatementLedger`.
 */
@Injectable()
export class BillingStatementLedgerService {
  constructor(
    private readonly payments: BillingPaymentsService,
    private readonly tenantSettings: SettingsPriorityTenantReadPort,
    private readonly issuers: BillingIssuerReadPort,
  ) {}

  async ledger(
    subscriberId: string,
    query: BillingStatementLedgerQuery,
    actorId: string,
    readAccess: LedgerReadAccess,
  ): Promise<BillingStatementLedger> {
    return (await this.compose(subscriberId, query, actorId, readAccess)).ledger;
  }

  /** PDF del libro; el emisor sale de `BillingIssuerReadPort` y el titular se omite si está protegido. */
  async ledgerPdf(
    subscriberId: string,
    query: BillingStatementLedgerQuery,
    actorId: string,
    readAccess: LedgerReadAccess,
  ): Promise<{ filename: string; content: Buffer; ledger: BillingStatementLedger }> {
    const { tenantId } = TenantContext.getOrThrow();
    const { ledger, titularName, today } = await this.compose(
      subscriberId,
      query,
      actorId,
      readAccess,
    );
    const issuer = await this.issuers.getIssuerIdentity(tenantId);
    const content = await renderStatementLedgerPdf({
      ledger,
      issuer,
      titularName: ledger.buyerProtected ? null : titularName,
      generatedOn: today,
    });
    return { filename: `estado-de-cuenta-${ledger.to}.pdf`, content, ledger };
  }

  /**
   * El JSON devuelve el libro completo del periodo; el PDF (descarga y correo) lo trunca a
   * `LEDGER_PDF_MAX_ROWS` filas con aviso y saldo final real (SEC-07).
   */
  private async compose(
    subscriberId: string,
    query: BillingStatementLedgerQuery,
    actorId: string,
    readAccess: LedgerReadAccess,
  ) {
    const { tenantId } = TenantContext.getOrThrow();
    const statement = await this.payments.statementForSubscriber(subscriberId, actorId, {
      canSeeBlocked: readAccess.canSeeBlocked,
      ...(readAccess.grantedBy ? { grantedBy: readAccess.grantedBy } : {}),
    });
    const { timezone } = await this.tenantSettings.getSnapshot({ tenantId });
    const today = toCivilDate(new Date().toISOString(), timezone);
    const ledger = buildStatementLedger(statement, {
      from: query.from,
      to: query.to,
      today,
      timezone,
    });
    // El estado de cuenta ya redacta el adquirente si está protegido; el más reciente primero.
    const titularName = statement.buyerProtected
      ? null
      : (statement.documents.find((document) => document.buyerSnapshot?.displayName)?.buyerSnapshot
          ?.displayName ?? null);
    return { ledger, titularName, today };
  }
}
