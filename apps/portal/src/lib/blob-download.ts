/**
 * Descarga de archivos generados por el API (PDF/ZIP de compras) en el
 * navegador: objeto URL sintético + click + revocación. Patrón extraído de
 * `RfqInvitationsPanel` (Fase 31: también lo consumen el drawer de órdenes y
 * el tab Órdenes del workbench).
 */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
