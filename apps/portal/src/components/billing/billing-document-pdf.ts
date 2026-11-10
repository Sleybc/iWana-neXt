import type { BillingDocumentResponse } from '@iwana/shared';
import { billingApi } from '@/lib/api-client';

/** Descarga el PDF de un documento de cobro emitido con el nombre de su número. */
export async function downloadBillingDocumentPdf(
  document: Pick<BillingDocumentResponse, 'id' | 'number'>,
): Promise<void> {
  const blob = await billingApi.documentPdf(document.id);
  const url = URL.createObjectURL(blob);
  try {
    const link = window.document.createElement('a');
    link.href = url;
    link.download = `${document.number ?? 'documento-de-cobro'}.pdf`;
    link.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
