/**
 * Persistencia mínima del job de importación CSV (solo id, sin PII ni secretos).
 * Permite reabrir el panel / banner tras cerrar durante el progreso.
 */

const STORAGE_KEY = 'iwana.portal.users-bulk-job';

export function readActiveBulkJobId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.sessionStorage.getItem(STORAGE_KEY);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

export function writeActiveBulkJobId(jobId: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!jobId) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(STORAGE_KEY, jobId);
  } catch {
    // sessionStorage puede fallar en modo privado; el flujo en modal sigue en memoria.
  }
}
