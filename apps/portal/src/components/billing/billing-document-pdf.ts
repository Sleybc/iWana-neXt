import type { BillingDocumentResponse } from '@iwana/shared';
import { billingApi } from '@/lib/api-client';

/** Caracteres que ningún sistema de archivos acepta en un nombre. */
const UNSAFE_FILENAME = /[\\/:*?"<>|]+/gu;

/** Nombre de archivo seguro a partir de un número de documento o de recibo. */
export function billingPdfFilename(name: string | null | undefined, fallback: string): string {
  const safe = (name ?? '').replace(UNSAFE_FILENAME, '-').trim();
  return `${safe || fallback}.pdf`;
}

/** Descarga un PDF ya generado por la API con el nombre indicado. */
export function saveBillingPdf(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const link = window.document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/**
 * Nombre del PDF de una factura, con el mismo prefijo que la API: «factura-<número>.pdf»; una
 * factura histórica de UISP conserva su número de origen (inventario W0, obligación 2) como
 * «factura-importada-<número de origen>.pdf», o «factura-importada.pdf» si no lo trae.
 */
export function billingDocumentPdfFilename(
  document: Pick<BillingDocumentResponse, 'status' | 'number'> & {
    externalNumber?: string | null | undefined;
  },
): string {
  if (document.status === 'IMPORTADO') {
    const origin = document.externalNumber?.trim();
    return billingPdfFilename(origin ? `factura-importada-${origin}` : null, 'factura-importada');
  }
  return billingPdfFilename(
    document.number?.trim() ? `factura-${document.number.trim()}` : null,
    'factura',
  );
}

/** Descarga el PDF de una factura con el nombre de `billingDocumentPdfFilename`. */
export async function downloadBillingDocumentPdf(
  document: Pick<BillingDocumentResponse, 'id' | 'status' | 'number'> & {
    externalNumber?: string | null | undefined;
  },
): Promise<void> {
  const blob = await billingApi.documentPdf(document.id);
  saveBillingPdf(blob, billingDocumentPdfFilename(document));
}
