import type { PaymentReadAccess } from '../payments/billing-payments.service';

/**
 * PDF del recibo de pago que da el bloque A (`BillingReceiptsService.receiptPdf`, spec
 * 2026-11-13 D3, R3). Facturación de correos depende de esta abstracción y no del archivo de A;
 * el módulo la enlaza con `{ provide: BillingReceiptPdfSource, useExisting: BillingReceiptsService }`.
 */
export abstract class BillingReceiptPdfSource {
  abstract receiptPdf(
    paymentId: string,
    readAccess: PaymentReadAccess,
  ): Promise<{ filename: string; content: Buffer; receiptNumber: number }>;
}
