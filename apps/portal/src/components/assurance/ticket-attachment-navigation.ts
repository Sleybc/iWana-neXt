/**
 * Abre o descarga un enlace firmado de adjunto con un ancla temporal, sin
 * dar acceso a esta pestaña (`noopener noreferrer`). Aparte para que las
 * pruebas lo sustituyan: jsdom no navega.
 */
function followLink(url: string, target: '_blank' | null): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.rel = 'noopener noreferrer';
  if (target) anchor.target = target;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function openTicketAttachmentInNewTab(url: string): void {
  followLink(url, '_blank');
}

/** El enlace de descarga lleva `Content-Disposition: attachment`: no sale de la página. */
export function downloadTicketAttachment(url: string): void {
  followLink(url, null);
}
