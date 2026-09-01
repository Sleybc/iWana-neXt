/**
 * Telemetría de producto — contrato estable hasta elección de provider.
 * No-op en producción hasta que se inyecte window.__IWANA_TRACK__ o provider real.
 * Tests mockean este módulo via jest.mock.
 */
export function trackEvent(event: string, payload?: Record<string, unknown>): void {
  if (typeof window !== 'undefined') {
    const w = window as unknown as {
      __IWANA_TRACK__?: (e: string, p?: Record<string, unknown>) => void;
    };
    if (typeof w.__IWANA_TRACK__ === 'function') {
      w.__IWANA_TRACK__(event, payload);
    }
  }
  // noop fallback — preserva deep-links y no rompe si no hay provider
}
