/**
 * Hook `useAssuranceTicketDetail` con `assuranceApi` mockeado — spec MOD10 2026-11-16 §3 H, K y L.
 * Carga del detalle (ticket, comentarios e historial), descarte de respuestas tardías de otro
 * ticket, las cinco acciones con su aviso de éxito o de error, y el vínculo manual de la orden de
 * ejecución por `linkExecutionOrder` (D4) con sus dos resultados, LINKED y ALREADY_LINKED.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  ExecutionOrderStatus,
  TicketStatus,
  UserRole,
  type LinkExecutionOrderResponse,
} from '@iwana/shared';
import type {
  AssuranceTicket,
  AssuranceTicketComment,
  AssuranceTimelineEvent,
  InternalUser,
} from '@/lib/api-client';
import { ApiError, assuranceApi, usersApi } from '@/lib/api-client';
import {
  ASSURANCE_ACTION_MESSAGES,
  getAssuranceRoleAccess,
  loadOperationalUsers,
  mapAssuranceError,
  useAssuranceTicketDetail,
} from './use-assurance-ticket-detail';

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client') as typeof import('@/lib/api-client');
  return {
    ...actual,
    assuranceApi: {
      tickets: {
        get: jest.fn(),
        listComments: jest.fn(),
        listTimeline: jest.fn(),
        submitComment: jest.fn(),
        transitionStatus: jest.fn(),
        assign: jest.fn(),
        requestFieldService: jest.fn(),
        linkExecutionOrder: jest.fn(),
      },
    },
    usersApi: { list: jest.fn() },
  };
});

const tickets = assuranceApi.tickets as unknown as Record<
  | 'get'
  | 'listComments'
  | 'listTimeline'
  | 'submitComment'
  | 'transitionStatus'
  | 'assign'
  | 'requestFieldService'
  | 'linkExecutionOrder',
  jest.Mock
>;
const usersList = usersApi.list as unknown as jest.Mock;

const TICKET_A = '3d1f6c2a-0b7e-4c55-9a1d-2f0e8b6a7c11';
const TICKET_B = '4e2a7d3b-1c8f-4d66-8b2e-3a1f9c7b8d22';
const ORDER_ID = '8e5d0f6b-4a7c-4b9d-9e2f-3d4e5f607182';

function makeTicket(id: string, ticketNumber: string): AssuranceTicket {
  return { id, ticketNumber, subject: `Asunto ${ticketNumber}` } as unknown as AssuranceTicket;
}

function makeComment(id: string): AssuranceTicketComment {
  return { id, body: 'Comentario sintético' } as unknown as AssuranceTicketComment;
}

function makeEvent(id: string): AssuranceTimelineEvent {
  return { id, eventType: 'STATUS_CHANGED' } as unknown as AssuranceTimelineEvent;
}

function makeLinkResponse(outcome: LinkExecutionOrderResponse['outcome']) {
  return {
    id: ORDER_ID,
    number: 'OTE-20261116-001',
    status: ExecutionOrderStatus.ASSIGNED,
    result: null,
    closedAt: null,
    outcome,
  } as LinkExecutionOrderResponse;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function mockDetailLoad(ticket: AssuranceTicket) {
  tickets.get.mockResolvedValue(ticket);
  tickets.listComments.mockResolvedValue([makeComment('c-1')]);
  tickets.listTimeline.mockResolvedValue([makeEvent('e-1')]);
}

async function renderOpened(onAfterAction?: () => Promise<unknown>) {
  mockDetailLoad(makeTicket(TICKET_A, 'TK-2026-0001'));
  const hook = renderHook(() => useAssuranceTicketDetail({ onAfterAction }));
  await act(async () => {
    await hook.result.current.open(TICKET_A);
  });
  return hook;
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('mapAssuranceError', () => {
  it.each([
    [401, 'Tu sesión expiró. Inicia sesión nuevamente para continuar.'],
    [403, 'No tienes permisos para operar esta vista de la mesa de ayuda.'],
    [404, 'El ticket consultado ya no está disponible.'],
    [409, 'Conflicto de versión'],
  ])('traduce un ApiError %i a un mensaje para el usuario', (status, expected) => {
    expect(mapAssuranceError(new ApiError(status, 'CODE', 'Conflicto de versión'))).toBe(expected);
  });

  it('oculta los detalles técnicos de un error que no es de la API', () => {
    expect(mapAssuranceError(new TypeError('fetch failed'))).toBe(
      'No fue posible completar la operación. Intenta de nuevo.',
    );
  });
});

describe('loadOperationalUsers', () => {
  it('recorre todas las páginas y deduplica por id', async () => {
    const userA = { id: 'u-a', role: UserRole.SUPPORT } as InternalUser;
    const userB = { id: 'u-b', role: UserRole.NOC } as InternalUser;
    usersList
      .mockResolvedValueOnce({ data: [userA], meta: { nextCursor: 'cursor-2' } })
      .mockResolvedValueOnce({ data: [userA, userB], meta: { nextCursor: null } });

    await expect(loadOperationalUsers()).resolves.toEqual([userA, userB]);
    expect(usersList).toHaveBeenNthCalledWith(1, { limit: 100 });
    expect(usersList).toHaveBeenNthCalledWith(2, { cursor: 'cursor-2', limit: 100 });
  });
});

describe('getAssuranceRoleAccess', () => {
  it.each([
    [UserRole.ADMIN, true, true],
    [UserRole.SUPPORT, true, true],
    [UserRole.TECHNICIAN, true, false],
    [UserRole.CONTRACTOR, true, false],
    [null, false, false],
  ])('para el rol %s: ver=%s, operar=%s', (role, canView, canManage) => {
    expect(getAssuranceRoleAccess(role)).toEqual({ canView, canManage });
  });
});

describe('useAssuranceTicketDetail · carga', () => {
  it('carga ticket, comentarios e historial y termina la carga', async () => {
    const { result } = await renderOpened();

    expect(tickets.get).toHaveBeenCalledWith(TICKET_A);
    expect(tickets.listComments).toHaveBeenCalledWith(TICKET_A);
    expect(tickets.listTimeline).toHaveBeenCalledWith(TICKET_A);
    expect(result.current.ticketId).toBe(TICKET_A);
    expect(result.current.detailProps.ticket?.ticketNumber).toBe('TK-2026-0001');
    expect(result.current.detailProps.comments.map((c) => c.id)).toEqual(['c-1']);
    expect(result.current.detailProps.timeline.map((e) => e.id)).toEqual(['e-1']);
    expect(result.current.detailProps.isLoading).toBe(false);
    expect(result.current.detailProps.error).toBeNull();
    expect(result.current.errorStatus).toBeNull();
  });

  it('pinta la fila semilla mientras carga', async () => {
    const pending = deferred<AssuranceTicket>();
    tickets.get.mockReturnValue(pending.promise);
    tickets.listComments.mockResolvedValue([]);
    tickets.listTimeline.mockResolvedValue([]);
    const { result } = renderHook(() => useAssuranceTicketDetail());
    const seed = makeTicket(TICKET_A, 'TK-SEMILLA');

    let opening!: Promise<void>;
    act(() => {
      opening = result.current.open(TICKET_A, seed);
    });
    expect(result.current.detailProps.ticket).toBe(seed);
    expect(result.current.detailProps.isLoading).toBe(true);

    await act(async () => {
      pending.resolve(makeTicket(TICKET_A, 'TK-2026-0001'));
      await opening;
    });
    expect(result.current.detailProps.ticket?.ticketNumber).toBe('TK-2026-0001');
    expect(result.current.detailProps.isLoading).toBe(false);
  });

  it('deja vacíos comentarios e historial si fallan, sin bloquear el ticket', async () => {
    tickets.get.mockResolvedValue(makeTicket(TICKET_A, 'TK-2026-0001'));
    tickets.listComments.mockRejectedValue(new ApiError(500, 'X', 'falla'));
    tickets.listTimeline.mockRejectedValue(new ApiError(500, 'X', 'falla'));
    const { result } = renderHook(() => useAssuranceTicketDetail());

    await act(async () => {
      await result.current.open(TICKET_A);
    });

    expect(result.current.detailProps.ticket?.id).toBe(TICKET_A);
    expect(result.current.detailProps.comments).toEqual([]);
    expect(result.current.detailProps.timeline).toEqual([]);
    expect(result.current.detailProps.error).toBeNull();
  });

  it('expone el mensaje y el estado HTTP si el ticket no carga', async () => {
    tickets.get.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Not found'));
    tickets.listComments.mockResolvedValue([]);
    tickets.listTimeline.mockResolvedValue([]);
    const { result } = renderHook(() => useAssuranceTicketDetail());

    await act(async () => {
      await result.current.open(TICKET_A);
    });

    expect(result.current.detailProps.error).toBe('El ticket consultado ya no está disponible.');
    expect(result.current.errorStatus).toBe(404);
    expect(result.current.detailProps.isLoading).toBe(false);
  });

  it('no inventa estado HTTP si el fallo no es de la API', async () => {
    tickets.get.mockRejectedValue(new TypeError('fetch failed'));
    tickets.listComments.mockResolvedValue([]);
    tickets.listTimeline.mockResolvedValue([]);
    const { result } = renderHook(() => useAssuranceTicketDetail());

    await act(async () => {
      await result.current.open(TICKET_A);
    });

    expect(result.current.detailProps.error).toBe(
      'No fue posible completar la operación. Intenta de nuevo.',
    );
    expect(result.current.errorStatus).toBeNull();
  });
});

describe('useAssuranceTicketDetail · respuesta tardía de otro ticket', () => {
  it('descarta la respuesta del ticket anterior cuando llega después del actual', async () => {
    const lateA = deferred<AssuranceTicket>();
    tickets.get.mockImplementation((id: string) =>
      id === TICKET_A ? lateA.promise : Promise.resolve(makeTicket(TICKET_B, 'TK-B')),
    );
    tickets.listComments.mockImplementation(async (id: string) => [makeComment(`c-${id}`)]);
    tickets.listTimeline.mockResolvedValue([]);
    const { result } = renderHook(() => useAssuranceTicketDetail());

    let openingA!: Promise<void>;
    act(() => {
      openingA = result.current.open(TICKET_A);
    });
    await act(async () => {
      await result.current.open(TICKET_B);
    });
    expect(result.current.detailProps.ticket?.id).toBe(TICKET_B);

    await act(async () => {
      lateA.resolve(makeTicket(TICKET_A, 'TK-A'));
      await openingA;
    });

    expect(result.current.ticketId).toBe(TICKET_B);
    expect(result.current.detailProps.ticket?.ticketNumber).toBe('TK-B');
    expect(result.current.detailProps.comments.map((c) => c.id)).toEqual([`c-${TICKET_B}`]);
    expect(result.current.detailProps.isLoading).toBe(false);
  });

  it('descarta el error tardío del ticket anterior', async () => {
    const lateA = deferred<AssuranceTicket>();
    tickets.get.mockImplementation((id: string) =>
      id === TICKET_A ? lateA.promise : Promise.resolve(makeTicket(TICKET_B, 'TK-B')),
    );
    tickets.listComments.mockResolvedValue([]);
    tickets.listTimeline.mockResolvedValue([]);
    const { result } = renderHook(() => useAssuranceTicketDetail());

    let openingA!: Promise<void>;
    act(() => {
      openingA = result.current.open(TICKET_A);
    });
    await act(async () => {
      await result.current.open(TICKET_B);
    });
    await act(async () => {
      lateA.reject(new ApiError(404, 'NOT_FOUND', 'Not found'));
      await openingA;
    });

    expect(result.current.detailProps.error).toBeNull();
    expect(result.current.errorStatus).toBeNull();
    expect(result.current.detailProps.ticket?.id).toBe(TICKET_B);
  });
});

type ActionCase = {
  name: string;
  api: keyof typeof tickets;
  flag:
    | 'isCommentSubmitting'
    | 'isTransitionSubmitting'
    | 'isAssignmentSubmitting'
    | 'isFieldServiceSubmitting'
    | 'isLinkingWorkOrder';
  message: string;
  run: (props: ReturnType<typeof useAssuranceTicketDetail>['detailProps']) => Promise<unknown>;
  expectedArgs: unknown[];
};

const ACTION_CASES: ActionCase[] = [
  {
    name: 'comentario',
    api: 'submitComment',
    flag: 'isCommentSubmitting',
    message: ASSURANCE_ACTION_MESSAGES.comment,
    run: (props) => props.onAddComment({ body: 'Revisado', isInternal: true, files: [] }),
    expectedArgs: [TICKET_A, { body: 'Revisado', isInternal: true, files: [] }],
  },
  {
    name: 'cambio de estado',
    api: 'transitionStatus',
    flag: 'isTransitionSubmitting',
    message: ASSURANCE_ACTION_MESSAGES.status,
    run: (props) => props.onTransitionStatus({ status: TicketStatus.IN_PROGRESS }),
    expectedArgs: [TICKET_A, { status: TicketStatus.IN_PROGRESS }],
  },
  {
    name: 'asignación',
    api: 'assign',
    flag: 'isAssignmentSubmitting',
    message: ASSURANCE_ACTION_MESSAGES.assignment,
    run: (props) => props.onAssign({ assignedUserId: 'u-a' }),
    expectedArgs: [TICKET_A, { assignedUserId: 'u-a' }],
  },
  {
    name: 'visita técnica',
    api: 'requestFieldService',
    flag: 'isFieldServiceSubmitting',
    message: ASSURANCE_ACTION_MESSAGES.fieldService,
    run: (props) => props.onRequestFieldService({ notes: 'Sin señal' }),
    expectedArgs: [TICKET_A, { notes: 'Sin señal' }],
  },
  {
    name: 'vínculo de orden de ejecución',
    api: 'linkExecutionOrder',
    flag: 'isLinkingWorkOrder',
    message: ASSURANCE_ACTION_MESSAGES.workOrder,
    run: (props) => props.onLinkWorkOrder({ executionOrderId: ORDER_ID, notes: 'Vínculo manual' }),
    expectedArgs: [TICKET_A, { executionOrderId: ORDER_ID, notes: 'Vínculo manual' }],
  },
];

describe.each(ACTION_CASES)('useAssuranceTicketDetail · acción: $name', (action) => {
  it('con éxito llama a la API, recarga el detalle, refresca la bandeja y avisa', async () => {
    const onAfterAction = jest.fn().mockResolvedValue(undefined);
    const { result } = await renderOpened(onAfterAction);
    tickets[action.api].mockResolvedValue(
      action.api === 'linkExecutionOrder' ? makeLinkResponse('LINKED') : {},
    );
    tickets.get.mockResolvedValue(makeTicket(TICKET_A, 'TK-2026-0001-RECARGADO'));

    await act(async () => {
      await action.run(result.current.detailProps);
    });

    expect(tickets[action.api]).toHaveBeenCalledWith(...action.expectedArgs);
    expect(onAfterAction).toHaveBeenCalledTimes(1);
    expect(tickets.get).toHaveBeenCalledTimes(2);
    expect(result.current.detailProps.ticket?.ticketNumber).toBe('TK-2026-0001-RECARGADO');
    expect(result.current.detailProps.actionFeedback).toBe(action.message);
    expect(result.current.detailProps.actionError).toBeNull();
    expect(result.current.detailProps[action.flag]).toBe(false);
  });

  it('con error muestra el aviso de error, no el de éxito, y no recarga', async () => {
    const onAfterAction = jest.fn().mockResolvedValue(undefined);
    const { result } = await renderOpened(onAfterAction);
    tickets[action.api].mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'Forbidden'));

    await act(async () => {
      await action.run(result.current.detailProps);
    });

    expect(result.current.detailProps.actionError).toBe(
      'No tienes permisos para operar esta vista de la mesa de ayuda.',
    );
    expect(result.current.detailProps.actionFeedback).toBeNull();
    expect(onAfterAction).not.toHaveBeenCalled();
    expect(tickets.get).toHaveBeenCalledTimes(1);
    expect(result.current.detailProps[action.flag]).toBe(false);
  });

  it('marca la bandera de envío mientras la petición está en curso', async () => {
    const { result } = await renderOpened();
    const pending = deferred<unknown>();
    tickets[action.api].mockReturnValue(pending.promise);

    let running!: Promise<unknown>;
    act(() => {
      running = action.run(result.current.detailProps);
    });
    expect(result.current.detailProps[action.flag]).toBe(true);

    await act(async () => {
      pending.resolve(action.api === 'linkExecutionOrder' ? makeLinkResponse('LINKED') : {});
      await running;
    });
    expect(result.current.detailProps[action.flag]).toBe(false);
  });

  it('sin ticket abierto no llama a la API', async () => {
    const { result } = renderHook(() => useAssuranceTicketDetail());

    await act(async () => {
      await action.run(result.current.detailProps);
    });

    expect(tickets[action.api]).not.toHaveBeenCalled();
    expect(result.current.detailProps.actionFeedback).toBeNull();
    expect(result.current.detailProps.actionError).toBeNull();
  });
});

describe('useAssuranceTicketDetail · comentario', () => {
  it('devuelve true si el comentario se registró y false si falló o no hay ticket', async () => {
    const { result } = await renderOpened();
    tickets.submitComment.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('red'));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.detailProps.onAddComment({ body: 'Uno', files: [] });
    });
    expect(ok).toBe(true);

    await act(async () => {
      ok = await result.current.detailProps.onAddComment({ body: 'Dos', files: [] });
    });
    expect(ok).toBe(false);

    const empty = renderHook(() => useAssuranceTicketDetail());
    await act(async () => {
      ok = await empty.result.current.detailProps.onAddComment({ body: 'Tres', files: [] });
    });
    expect(ok).toBe(false);
  });

  it('si el comentario se registró pero la recarga falla, avisa del error y devuelve true', async () => {
    const { result } = await renderOpened();
    tickets.submitComment.mockResolvedValue({});
    tickets.get.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Unauthorized'));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.detailProps.onAddComment({ body: 'Uno', files: [] });
    });

    expect(ok).toBe(true);
    expect(result.current.detailProps.actionError).toBe(
      'Tu sesión expiró. Inicia sesión nuevamente para continuar.',
    );
    expect(result.current.detailProps.actionFeedback).toBeNull();
  });
});

describe('useAssuranceTicketDetail · onLinkWorkOrder con linkExecutionOrder', () => {
  it.each(['LINKED', 'ALREADY_LINKED'] as const)(
    'con resultado %s vincula la orden, recarga y muestra el mismo aviso',
    async (outcome) => {
      const { result } = await renderOpened();
      tickets.linkExecutionOrder.mockResolvedValue(makeLinkResponse(outcome));

      await act(async () => {
        await result.current.detailProps.onLinkWorkOrder({ executionOrderId: ORDER_ID });
      });

      expect(tickets.linkExecutionOrder).toHaveBeenCalledTimes(1);
      expect(tickets.linkExecutionOrder).toHaveBeenCalledWith(TICKET_A, {
        executionOrderId: ORDER_ID,
      });
      expect(tickets.get).toHaveBeenCalledTimes(2);
      expect(result.current.detailProps.actionFeedback).toBe('Orden de trabajo vinculada al caso.');
      expect(result.current.detailProps.actionError).toBeNull();
      expect(result.current.detailProps.isLinkingWorkOrder).toBe(false);
    },
  );

  it('si la orden es de otro ticket muestra el mensaje del servidor', async () => {
    const { result } = await renderOpened();
    tickets.linkExecutionOrder.mockRejectedValue(
      new ApiError(409, 'EXECUTION_ORDER_LINKED_TO_OTHER_TICKET', 'La orden ya es de otro caso.'),
    );

    await act(async () => {
      await result.current.detailProps.onLinkWorkOrder({ executionOrderId: ORDER_ID });
    });

    expect(result.current.detailProps.actionError).toBe('La orden ya es de otro caso.');
    expect(result.current.detailProps.actionFeedback).toBeNull();
  });
});

describe('useAssuranceTicketDetail · clearMessages', () => {
  it('limpia el aviso de éxito y el de error', async () => {
    const { result } = await renderOpened();
    tickets.assign.mockResolvedValue({});
    await act(async () => {
      await result.current.detailProps.onAssign({ assignedUserId: 'u-a' });
    });
    expect(result.current.detailProps.actionFeedback).not.toBeNull();

    act(() => {
      result.current.clearMessages();
    });

    await waitFor(() => expect(result.current.detailProps.actionFeedback).toBeNull());
    expect(result.current.detailProps.actionError).toBeNull();
  });
});
