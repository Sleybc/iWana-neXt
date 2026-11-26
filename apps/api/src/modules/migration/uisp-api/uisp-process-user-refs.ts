import { stagedUispUserRefs, uispUserNumber } from '../uisp/uisp-staged-user-refs';
import { UispApiError } from './uisp-api.client';

/**
 * Personal eliminado de UISP que sigue en sus procesos (ADR-110 v1.3 D15; spec 2026-11-15
 * «usuarios» v1.2 §2.2): `users/admins` solo devuelve el personal vigente, pero los tickets, los
 * pagos y las tareas de Programación conservan el número del usuario que los atendió, comentó o
 * registró. Se recorren por páginas (`limit` + `offset`) y se reúnen esos números; quien no está
 * en `users/admins` entra como fila «sin datos». Solo números: el contenido de cada elemento
 * (PII de clientes) no se guarda ni se registra.
 */
export type UispProcess = 'TICKETS' | 'PAGOS' | 'TAREAS';

interface ProcessSource {
  process: UispProcess;
  path: string;
  /** Tamaño de página; los tickets traen su actividad y pesan más. */
  pageSize: number;
  refs: (item: Record<string, unknown>) => Iterable<number>;
}

export const UISP_PROCESS_SOURCES: readonly ProcessSource[] = [
  {
    process: 'TICKETS',
    path: '/crm/api/v1.0/ticketing/tickets',
    pageSize: 100,
    refs: (item) => {
      const refs = stagedUispUserRefs('TICKET', { raw: item });
      // Reasignaciones dentro de la actividad: el asignado anterior también es personal.
      const activity = Array.isArray(item['activity']) ? (item['activity'] as unknown[]) : [];
      for (const entry of activity) {
        const assignment = (entry as { assignment?: unknown } | null)?.assignment;
        if (assignment && typeof assignment === 'object') {
          const id = uispUserNumber((assignment as Record<string, unknown>)['assignedUserId']);
          if (id !== null) refs.add(id);
        }
      }
      return refs;
    },
  },
  {
    process: 'PAGOS',
    path: '/crm/api/v1.0/payments',
    pageSize: 500,
    refs: (item) => stagedUispUserRefs('PAGO', { raw: item }),
  },
  {
    process: 'TAREAS',
    path: '/crm/api/v1.0/scheduling/jobs',
    pageSize: 500,
    refs: (item) => {
      const id = uispUserNumber(item['assignedUserId']);
      return id === null ? [] : [id];
    },
  },
];

/** Tope de páginas por proceso: corta un recorrido anómalo sin colgar el job. */
export const UISP_PROCESS_MAX_PAGES = 400;

export type UispPageFetcher = (path: string, limit: number, offset: number) => Promise<unknown>;

export interface UispProcessRefs {
  /** Número de UISP → procesos donde aparece. */
  refs: Map<number, Set<UispProcess>>;
  /** Elementos recorridos por proceso (solo conteo). */
  leidos: Record<UispProcess, number>;
  /**
   * Procesos que UISP no entregó (4xx: módulo deshabilitado o ruta inexistente en esa versión)
   * o cuya respuesta no es una lista, y procesos cortados por el tope de páginas.
   */
  sinLeer: UispProcess[];
  truncados: UispProcess[];
}

/**
 * Recorre cada proceso hasta una página incompleta. Si UISP ignora `offset` y repite la misma
 * página, el recorrido se detiene en cuanto una página no trae elementos nuevos (por `id`).
 *
 * Errores: credencial rechazada y fallos reintentables (red, tiempo, 5xx) se propagan para que
 * el job falle o reintente como con `users/admins`. Un 4xx distinto, una respuesta que no es
 * lista o demasiado grande dejan ese proceso «sin leer» y siguen con los demás: el personal
 * vigente ya se trajo y no se pierde por un proceso inaccesible.
 */
export async function collectUispProcessUserRefs(
  fetchPage: UispPageFetcher,
  sources: readonly ProcessSource[] = UISP_PROCESS_SOURCES,
  maxPages = UISP_PROCESS_MAX_PAGES,
): Promise<UispProcessRefs> {
  const result: UispProcessRefs = {
    refs: new Map(),
    leidos: { TICKETS: 0, PAGOS: 0, TAREAS: 0 },
    sinLeer: [],
    truncados: [],
  };
  for (const source of sources) {
    const seenItems = new Set<string>();
    let offset = 0;
    let pages = 0;
    for (;;) {
      if (pages >= maxPages) {
        result.truncados.push(source.process);
        break;
      }
      let body: unknown;
      try {
        body = await fetchPage(source.path, source.pageSize, offset);
      } catch (error) {
        if (error instanceof UispApiError && skippable(error)) {
          result.sinLeer.push(source.process);
          break;
        }
        throw error;
      }
      if (!Array.isArray(body)) {
        result.sinLeer.push(source.process);
        break;
      }
      pages += 1;
      let fresh = 0;
      for (const item of body) {
        if (!item || typeof item !== 'object') continue;
        const record = item as Record<string, unknown>;
        const key = record['id'] === undefined ? `#${offset + fresh}` : String(record['id']);
        if (seenItems.has(key)) continue;
        seenItems.add(key);
        fresh += 1;
        result.leidos[source.process] += 1;
        for (const id of source.refs(record)) {
          const processes = result.refs.get(id) ?? new Set<UispProcess>();
          processes.add(source.process);
          result.refs.set(id, processes);
        }
      }
      if (body.length < source.pageSize || fresh === 0) break;
      offset += source.pageSize;
    }
  }
  return result;
}

function skippable(error: UispApiError): boolean {
  return (
    error.kind === 'UNREACHABLE' &&
    !error.retryable &&
    (error.reason === 'HTTP_4XX' ||
      error.reason === 'RESPUESTA_INVALIDA' ||
      error.reason === 'RESPUESTA_DEMASIADO_GRANDE')
  );
}
