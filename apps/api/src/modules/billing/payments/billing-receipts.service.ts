import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  BILLING_BLOCKED_BUYER_DISPLAY_NAME,
  BILLING_ERROR_CODES,
  type BillingPaymentResponse,
} from '@iwana/shared';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { DataSource } from 'typeorm';
import { BillingContractReadPort } from '../ports/billing-contract-read.port';
import { BillingIssuerReadPort } from '../ports/billing-issuer-read.port';
import { BillingPaymentsService, type PaymentReadAccess } from './billing-payments.service';
import { renderBillingReceiptPdf, type BillingReceiptPdfInput } from './billing-receipt.pdf';

export type BillingReceiptPdf = { filename: string; content: Buffer; receiptNumber: number };

/**
 * Recibo de pago numerado (spec MOD05↔MOD14 2026-11-13 D3, D8, R3, CA-3). La lectura pasa por
 * `BillingPaymentsService.getPayment`, que aplica la redacción H-2 (DATOS_BLOQUEADOS) y audita el
 * acceso con permiso; el recibo solo pinta lo que esa vista entregó.
 *
 * `receiptPdf(paymentId, readAccess)` es contrato con el envío por correo (bloque B).
 */
@Injectable()
export class BillingReceiptsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly payments: BillingPaymentsService,
    private readonly contractReadPort: BillingContractReadPort,
    private readonly issuers: BillingIssuerReadPort,
  ) {}

  async receiptPdf(paymentId: string, readAccess: PaymentReadAccess): Promise<BillingReceiptPdf> {
    const payment = await this.payments.getPayment(paymentId, readAccess);
    const [ref] = await this.contractReadPort.findTitularRefs([payment.subscriberId]);
    // Titular anonimizado: igual que el resto de lecturas por titular, no existe.
    if (!ref || ref.anonymized) {
      throw new NotFoundException({
        code: 'BILLING_PAYMENT_NOT_FOUND',
        message: 'No se encontró el pago.',
      });
    }
    if (payment.imported === true || payment.receiptNumber == null) {
      throw new ConflictException({
        code: BILLING_ERROR_CODES.BILLING_RECEIPT_NOT_AVAILABLE,
        message: 'Un pago importado no tiene recibo de iWana; consulta su referencia de origen.',
      });
    }
    const receiptNumber = payment.receiptNumber;
    const { tenantId } = TenantContext.getOrThrow();

    const titularName = payment.subscriberProtected
      ? BILLING_BLOCKED_BUYER_DISPLAY_NAME
      : ((await this.contractReadPort.findTitularDisplayNames([payment.subscriberId]))[0]
          ?.displayName ?? '');
    const issuer = await this.issuers.getIssuerIdentity(tenantId);
    const labels = await this.documentLabels(tenantId, this.coveredDocumentIds(payment));

    const content = await renderBillingReceiptPdf(
      this.toPdfInput(payment, receiptNumber, titularName, issuer, labels),
    );
    return { filename: `recibo-${receiptNumber}.pdf`, content, receiptNumber };
  }

  /**
   * Vigentes en un pago registrado. En uno anulado, las que la anulación revirtió (sin motivo de
   * desasociación): así el recibo anulado sigue mostrando qué cubría.
   */
  private coveredAllocations(payment: BillingPaymentResponse) {
    const allocations = payment.allocations ?? [];
    return payment.status === 'ANULADO'
      ? allocations.filter((item) => item.reversedAt != null && item.reversalReasonCode == null)
      : allocations.filter((item) => item.reversedAt == null);
  }

  private coveredDocumentIds(payment: BillingPaymentResponse): string[] {
    const ids = new Set<string>(this.coveredAllocations(payment).map((item) => item.documentId));
    for (const line of payment.withholdings ?? []) ids.add(line.documentId);
    return [...ids];
  }

  private async documentLabels(
    tenantId: string,
    documentIds: string[],
  ): Promise<Map<string, string>> {
    if (documentIds.length === 0) return new Map();
    const { schemaName } = TenantContext.getOrThrow();
    const rows = await runInTenantSchema(
      this.dataSource,
      schemaName,
      async (qr) =>
        (await qr.manager.query(
          `SELECT id::text, number, external_number
             FROM billing_documents
            WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
          [tenantId, documentIds],
        )) as Array<{ id: string; number: string | null; external_number: string | null }>,
    );
    return new Map(
      rows.map((row) => [row.id, row.number ?? row.external_number ?? 'Documento sin número']),
    );
  }

  private toPdfInput(
    payment: BillingPaymentResponse,
    receiptNumber: number,
    titularName: string,
    issuer: BillingReceiptPdfInput['issuer'],
    labels: Map<string, string>,
  ): BillingReceiptPdfInput {
    const label = (documentId: string) => labels.get(documentId) ?? 'Documento sin número';
    const voided = payment.status === 'ANULADO';
    return {
      receiptNumber,
      status: payment.status,
      paidAt: payment.paidAt,
      method: payment.method,
      amount: payment.amount,
      reference: payment.reference ?? null,
      titularName,
      issuer,
      documents: this.coveredAllocations(payment).map((item) => ({
        label: label(item.documentId),
        amount: item.amount,
      })),
      withholdings: (payment.withholdings ?? [])
        .filter((line) => voided || line.voidedAt == null)
        .map((line) => ({
          taxCode: line.taxCode,
          documentLabel: label(line.documentId),
          rate: line.rate,
          amount: line.amount,
        })),
      creditBalance: voided ? null : (payment.unallocatedAmount ?? '0.00'),
    };
  }
}
