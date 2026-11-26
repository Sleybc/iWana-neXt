import { UispApiError } from './uisp-api.client';
import {
  UISP_PROCESS_SOURCES,
  collectUispProcessUserRefs,
  type UispPageFetcher,
} from './uisp-process-user-refs';

const TICKETS = '/crm/api/v1.0/ticketing/tickets';
const PAGOS = '/crm/api/v1.0/payments';
const TAREAS = '/crm/api/v1.0/scheduling/jobs';

/** Servidor falso: cada ruta devuelve su lista completa paginada con `limit` + `offset`. */
function paged(lists: Record<string, unknown[] | Error>): jest.MockedFunction<UispPageFetcher> {
  return jest.fn(async (path: string, limit: number, offset: number) => {
    const list = lists[path];
    if (list instanceof Error) throw list;
    return (list ?? []).slice(offset, offset + limit);
  });
}

function ids(refs: Map<number, Set<string>>): Record<number, string[]> {
  return Object.fromEntries([...refs].map(([id, set]) => [id, [...set].sort()]));
}

describe('collectUispProcessUserRefs', () => {
  it('reúne asignados, autores de actividad, reasignaciones, pagos y tareas', async () => {
    const fetch = paged({
      [TICKETS]: [
        {
          id: 1,
          assignedUserId: 5,
          activity: [{ userId: 40 }, { userId: null, assignment: { assignedUserId: 41 } }],
        },
        { id: 2, assignedUserId: null, activity: 'no-es-lista' },
      ],
      [PAGOS]: [
        { id: 7, userId: 40 },
        { id: 8, userId: '42' },
        { id: 9, userId: 'x' },
      ],
      [TAREAS]: [
        { id: 3, assignedUserId: 43 },
        { id: 4, assignedUserId: -1 },
      ],
    });

    const result = await collectUispProcessUserRefs(fetch);

    expect(ids(result.refs)).toEqual({
      5: ['TICKETS'],
      40: ['PAGOS', 'TICKETS'],
      41: ['TICKETS'],
      42: ['PAGOS'],
      43: ['TAREAS'],
    });
    expect(result.leidos).toEqual({ TICKETS: 2, PAGOS: 3, TAREAS: 2 });
    expect(result.sinLeer).toEqual([]);
    expect(result.truncados).toEqual([]);
  });

  it('recorre todas las páginas hasta una incompleta', async () => {
    const payments = Array.from({ length: 1_203 }, (_, i) => ({
      id: i + 1,
      userId: 100 + (i % 70),
    }));
    const fetch = paged({ [PAGOS]: payments });

    const result = await collectUispProcessUserRefs(fetch);

    expect(result.leidos.PAGOS).toBe(1_203);
    expect(result.refs.size).toBe(70);
    const offsets = fetch.mock.calls.filter(([path]) => path === PAGOS).map(([, , o]) => o);
    expect(offsets).toEqual([0, 500, 1_000]);
  });

  it('si UISP ignora offset y repite la página, se detiene sin bucle', async () => {
    const page = Array.from({ length: 500 }, (_, i) => ({ id: i + 1, assignedUserId: 9 }));
    const fetch = jest.fn(async (path: string) => (path === TAREAS ? page : []));

    const result = await collectUispProcessUserRefs(fetch);

    expect(result.leidos.TAREAS).toBe(500);
    expect(fetch.mock.calls.filter(([path]) => path === TAREAS)).toHaveLength(2);
  });

  it('un proceso inaccesible (4xx o respuesta no lista) queda sin leer y sigue con los demás', async () => {
    const fetch: jest.MockedFunction<UispPageFetcher> = jest.fn();
    fetch.mockImplementation(async (path, limit, offset) => {
      if (path === TICKETS) throw new UispApiError('UNREACHABLE', 'HTTP_4XX', false);
      if (path === TAREAS) return { jobs: [] };
      return [{ id: 1, userId: 50 }].slice(offset, offset + limit);
    });

    const result = await collectUispProcessUserRefs(fetch);

    expect(result.sinLeer).toEqual(['TICKETS', 'TAREAS']);
    expect([...result.refs.keys()]).toEqual([50]);
  });

  it('credencial rechazada y fallos reintentables se propagan', async () => {
    const unauthorized = new UispApiError('UNAUTHORIZED', 'CREDENCIAL_RECHAZADA', false);
    await expect(collectUispProcessUserRefs(paged({ [TICKETS]: unauthorized }))).rejects.toBe(
      unauthorized,
    );
    const transient = new UispApiError('UNREACHABLE', 'HTTP_5XX', true);
    await expect(collectUispProcessUserRefs(paged({ [PAGOS]: transient }))).rejects.toBe(transient);
  });

  it('el tope de páginas corta el recorrido y lo marca como truncado', async () => {
    const tickets = Array.from({ length: 250 }, (_, i) => ({ id: i + 1, assignedUserId: 7 }));
    const fetch = paged({ [TICKETS]: tickets });

    const result = await collectUispProcessUserRefs(fetch, UISP_PROCESS_SOURCES, 2);

    expect(result.leidos.TICKETS).toBe(200);
    expect(result.truncados).toEqual(['TICKETS']);
  });
});
