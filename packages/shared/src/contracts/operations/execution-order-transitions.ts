import { ExecutionOrderStatus } from '../../enums/operations';

/**
 * Contrato tipado de la línea de tiempo de la OT de ejecución — MOD11.
 *
 * Archivo HERMANO del contrato congelado `execution-orders.ts` (hoy v1.2):
 * nace separado porque aquel declara "no modificar sin versionar" y la línea
 * de tiempo es un recurso propio, no un campo del detalle (spec
 * 2026-09-14 §7, plan 2026-09-14 §2). Este archivo es la fuente de verdad del
 * contrato de asientos; un cambio posterior se versiona y se notifica a
 * AI-EM-ARCH, nunca se parchea en silencio (protocolo multiagente §3bis
 * regla 1).
 *
 * Historial de versiones:
 * - v1 (2026-09-14, B1): asiento con origen, destino, instante, actor y
 *   motivo opcional; `deriveBlockedMs` / `deriveElapsedMs` como cómputo puro.
 * - v2 (2026-09-14, adenda B1c): ADITIVO — `correctionOfId?` opcional en
 *   `ExecutionOrderTransitionEntry` y `RecordExecutionOrderTransitionInput`
 *   (spec §4.3, ADR-089 §D3; decisión AI-EM-ARCH: columna propia en vez de
 *   contaminar `reason`). `null`/ausente = asiento original, nunca
 *   corrección. Nada de v1 cambia ni se renombra; la lógica de corrección es
 *   B2 (fuera de alcance de esta adenda).
 *
 * Fuentes normativas: ADR-089 (D1/D2/D3) y spec 2026-09-14 §4.1/§4.2/§4.3.
 *
 * Lo que este contrato NO contiene, a propósito:
 * - Ninguna duración calculada (tiempo efectivo, horas trabajadas): ADR-089
 *   §D2 las prohíbe como dato persistido. Las funciones `derive*` de abajo
 *   son cómputo puro sobre asientos —la misma línea de tiempo admite varias
 *   lecturas sin tocar un solo registro— y existen solo para fijar la
 *   semántica de derivación que T3 consumirá.
 * - Ninguna superficie de consulta paginada: es T3 y su publicación exige
 *   el dictamen de B3 (dato personal del trabajador, Ley 1581).
 */

/** Asiento de transición de estado de la OT (ADR-089 §D1). */
export interface ExecutionOrderTransitionEntry {
  id: string;
  executionOrderId: string;
  fromStatus: ExecutionOrderStatus;
  toStatus: ExecutionOrderStatus;
  /** Instante del cambio, ISO 8601. */
  changedAt: string;
  /** Actor que ejecutó la transición (uuid de usuario). */
  changedBy: string;
  /** Motivo cuando lo haya: nota libre o código estructurado. */
  reason?: string | null;
  /**
   * Referencia al asiento corregido (spec §4.3, ADR-089 §D3; adenda B1c).
   * Vínculo lógico sin FK, como `executionOrderId`. `null`/ausente = asiento
   * original, nunca corrección. Finalidad (dictamen B3 §2): integridad del
   * historial — corrección aditiva, original visible (CA-04).
   */
  correctionOfId?: string | null;
  createdAt: string;
}

/** Entrada para registrar un asiento (el servicio fija `id`/`createdAt`). */
export interface RecordExecutionOrderTransitionInput {
  executionOrderId: string;
  fromStatus: ExecutionOrderStatus;
  toStatus: ExecutionOrderStatus;
  /** Instante del cambio, ISO 8601. Debe coincidir con `startedAt`/`closedAt` cuando la transición los fija. */
  changedAt: string;
  changedBy: string;
  reason?: string | null;
  /**
   * Referencia al asiento corregido (adenda B1c). El registro B1 existente
   * pasa `null`: el asiento original nunca es corrección. La lógica de
   * corrección (asiento nuevo que referencia al corregido) es B2.
   */
  correctionOfId?: string | null;
}

/** Versión del contrato de asientos. */
export const EXECUTION_ORDER_TRANSITIONS_CONTRACT_VERSION = '2' as const;

/**
 * Suma los milisegundos que la OT pasó bloqueada según sus asientos.
 *
 * Un tramo bloqueado abre con destino `BLOCKED` y cierra con origen
 * `BLOCKED`; pueden existir VARIOS ciclos en la misma OT (CA-02, ADR-089
 * §A1: es el caso que descarta los campos sueltos). Un tramo abierto al
 * final del historial se mide hasta `nowMs` (por defecto `Date.now()`).
 *
 * Cómputo puro: no lee persistencia ni congela política alguna.
 */
export function deriveBlockedMs(
  transitions: ReadonlyArray<
    Pick<ExecutionOrderTransitionEntry, 'fromStatus' | 'toStatus' | 'changedAt'>
  >,
  nowMs: number = Date.now(),
): number {
  const ordered = [...transitions].sort(
    (a, b) => Date.parse(a.changedAt) - Date.parse(b.changedAt),
  );

  let total = 0;
  let blockedSince: number | null = null;

  for (const entry of ordered) {
    const at = Date.parse(entry.changedAt);
    if (!Number.isFinite(at)) continue;
    if (entry.toStatus === ExecutionOrderStatus.BLOCKED) {
      blockedSince = at;
    } else if (entry.fromStatus === ExecutionOrderStatus.BLOCKED && blockedSince !== null) {
      total += Math.max(0, at - blockedSince);
      blockedSince = null;
    }
  }

  if (blockedSince !== null) {
    total += Math.max(0, nowMs - blockedSince);
  }

  return total;
}

/**
 * Tiempo transcurrido entre dos instantes ISO (`closedAt − startedAt`).
 *
 * Es la lectura "sin descontar" de CA-03: convive con `deriveBlockedMs`
 * sin sustituirla. Retorna `null` si algún instante falta o es inválido.
 */
export function deriveElapsedMs(startedAt: string | null, closedAt: string | null): number | null {
  if (!startedAt || !closedAt) return null;
  const start = Date.parse(startedAt);
  const end = Date.parse(closedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return end - start;
}
