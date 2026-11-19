// apps/portal/src/components/operations/execution-order-window-relative.ts
//
// Ventana planificada de la bandeja de OT en forma relativa (spec 2026-11-19
// bandeja con colas §3 E): «Hoy 14:00», «Mañana 9:00» o la fecha de inicio si
// está más lejos. El intervalo exacto viaja en `title`. La ausencia de ventana
// no pasa por aquí: su texto vive en `execution-order-window-copy.ts` (E4).
// Paso 1: el día se calcula en la zona del navegador, igual que la fecha que
// ya pintaba la bandeja; la zona del tenant llega con «Hoy» del paso 2.
import { formatTaskDateTime } from './operations-labels';

const timeFormatter = new Intl.DateTimeFormat('es-CO', {
  hour: 'numeric',
  minute: '2-digit',
  hourCycle: 'h23',
});

function dayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

export interface ExecutionOrderWindowText {
  /** Texto visible de la celda. */
  label: string;
  /** Intervalo exacto para `title`. */
  title: string;
  /** P-1: fin visible en la tarjeta móvil («hasta 16:00» o la fecha si cambia
   * de día); nulo si no hay fin distinto del inicio. */
  endLabel: string | null;
}

export function formatExecutionOrderWindow(
  window: { startAt: string; endAt?: string | null },
  now: Date = new Date(),
): ExecutionOrderWindowText {
  const start = new Date(window.startAt);
  const exactStart = formatTaskDateTime(window.startAt);
  const title =
    window.endAt && window.endAt !== window.startAt
      ? `${exactStart} – ${formatTaskDateTime(window.endAt)}`
      : exactStart;

  const end = window.endAt && window.endAt !== window.startAt ? new Date(window.endAt) : null;
  const endLabel =
    end && !Number.isNaN(end.getTime())
      ? `hasta ${
          !Number.isNaN(start.getTime()) && dayNumber(end) === dayNumber(start)
            ? timeFormatter.format(end)
            : formatTaskDateTime(window.endAt as string)
        }`
      : null;

  if (Number.isNaN(start.getTime())) {
    return { label: exactStart, title, endLabel };
  }

  const offset = dayNumber(start) - dayNumber(now);
  const time = timeFormatter.format(start);
  const label = offset === 0 ? `Hoy ${time}` : offset === 1 ? `Mañana ${time}` : exactStart;
  return { label, title, endLabel };
}
