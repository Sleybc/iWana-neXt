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
 * Descarga el PDF de un documento de cobro con el nombre de su número; un histórico importado
 * usa el número de su sistema de origen (inventario W0, obligación 2).
 */
export async function downloadBillingDocumentPdf(
  document: Pick<BillingDocumentResponse, 'id' | 'number'> & {
    externalNumber?: string | null | undefined;
  },
): Promise<void> {
  const blob = await billingApi.documentPdf(document.id);
  saveBillingPdf(
    blob,
    billingPdfFilename(document.number ?? document.externalNumber, 'documento-de-cobro'),
  );
}
