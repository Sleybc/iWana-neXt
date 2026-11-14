/**
 * Tarjeta «Actividad» de la ficha (spec 2026-11-10 §3 D, D3; §8.3 estados).
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AccessPermissionKey,
  SUBSCRIBER_NOTE_BODY_MAX_LENGTH,
  type BillingAccountStatement,
  type LifecycleChangeRecord,
  type ListMeta,
  type SubscriberNote,
} from '@iwana/shared';
import { ApiError, assuranceApi, subscribersApi } from '@/lib/api-client';
import type { AssuranceTicket, Contract } from '@/lib/api-client';
import { SubscriberActivityCard } from './SubscriberActivityCard';
import {
  lifecycleToActivity,
  sortActivity,
  statementToActivity,
  type ActivityItem,
} from './subscriber-activity';

const mockGranted = { current: new Set<AccessPermissionKey>() };
jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: (() => {
    let ctx: Record<string, unknown> | undefined;
    return () =>
      (ctx ??= {
        hasPermission: (key: AccessPermissionKey) => mockGranted.current.has(key),
      });
  })(),
}));

const SUBSCRIBER_ID = '00000000-0000-4000-8000-0000000000aa';
const CONTRACT = {
  id: '00000000-0000-4000-8000-0000000000c1',
  alias: 'Sede Norte',
  planSnapshotJson: { name: 'Fibra 300' },
  status: 'SUSPENDED',
} as unknown as Contract;

function meta(overrides: Partial<ListMeta> = {}): ListMeta {
  return {
    nextCursor: null,
    total: 0,
    totalIsEstimate: false,
    page: 1,
    limit: 20,
    totalPages: 1,
    hasMore: false,
    mode: 'page',
    capabilities: { randomAccess: true, sortableFields: [] },
    sort: null,
    ...overrides,
  };
}

function lifecycle(id: string, changedAt: string): LifecycleChangeRecord {
  return {
    id,
    entityType: 'CONTRACT',
    entityId: CONTRACT.id,
    fromStatus: 'ACTIVE',
    toStatus: 'SUSPENDED',
    reasonCode: 'MORA',
    source: 'BILLING',
    batchId: 'batch-1',
    actorId: null,
    changedAt,
  };
}

function note(id: string, body: string, createdAt: string): SubscriberNote {
  return { id, subscriberId: SUBSCRIBER_ID, body, createdBy: 'user-1', createdAt };
}

const TICKET = {
  id: 'ticket-1',
  ticketNumber: 'TK-0001',
  subject: 'Sin conexión intermitente',
  status: 'OPEN',
  createdAt: '2026-11-03T10:00:00.000Z',
} as unknown as AssuranceTicket;

let lifecycleSpy: jest.SpyInstance;
let notesSpy: jest.SpyInstance;
let createSpy: jest.SpyInstance;
let ticketsSpy: jest.SpyInstance;

beforeEach(() => {
  mockGranted.current = new Set([AccessPermissionKey.CRM_SUBSCRIBERS_READ]);
  lifecycleSpy = jest
    .spyOn(subscribersApi, 'lifecycleChanges')
    .mockResolvedValue({ data: [lifecycle('lc-1', '2026-11-05T10:00:00.000Z')], meta: meta() });
  notesSpy = jest.spyOn(subscribersApi, 'listNotes').mockResolvedValue({
    data: [note('n-1', 'Pidió cambio de horario de visita.', '2026-11-06T10:00:00.000Z')],
    meta: meta(),
  });
  createSpy = jest.spyOn(subscribersApi, 'createNote');
  ticketsSpy = jest
    .spyOn(assuranceApi.tickets, 'list')
    .mockResolvedValue({ data: [TICKET], meta: meta() } as never);
});

afterEach(() => jest.restoreAllMocks());

function renderCard(props: Partial<Parameters<typeof SubscriberActivityCard>[0]> = {}) {
  return render(
    <SubscriberActivityCard
      subscriberId={SUBSCRIBER_ID}
      contracts={[CONTRACT]}
      anonymized={false}
      restricted={false}
      statement={null}
      canReadBilling={false}
      {...props}
    />,
  );
}

async function findList() {
  return screen.findByRole('list', { name: 'Actividad del suscriptor' });
}

describe('SubscriberActivityCard', () => {
  it('compone estados y notas, más reciente primero, con la región «Actividad»', async () => {
    renderCard();
    expect(screen.getByRole('region', { name: 'Actividad' })).toBeInTheDocument();
    const list = await findList();
    const rows = within(list)
      .getAllByRole('listitem')
      .map((row) => row.textContent ?? '');
    expect(rows[0]).toContain('Pidió cambio de horario de visita.');
    expect(rows[1]).toContain('Servicio «Sede Norte» pasó a suspendido');
    expect(rows[1]).toContain('Mora en el pago · Por facturación');
    expect(ticketsSpy).not.toHaveBeenCalled();
  });

  it('suma tickets solo con su permiso de lectura y filtra por tipo', async () => {
    const user = userEvent.setup();
    mockGranted.current.add(AccessPermissionKey.ASSURANCE_TICKETS_READ);
    renderCard();
    const list = await findList();
    expect(within(list).getByText('Ticket TK-0001: Sin conexión intermitente')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tickets' }));
    expect(screen.getByRole('button', { name: 'Tickets' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(await findList()).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Visitas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Facturas y pagos' })).not.toBeInTheDocument();
  });

  it('incluye documentos de cobro y pagos del estado de cuenta ya cargado', async () => {
    const statement = {
      documents: [
        {
          id: 'doc-1',
          number: 'FE-10',
          status: 'EMITIDO',
          issueDate: '2026-11-07T00:00:00.000Z',
          createdAt: '2026-11-07T00:00:00.000Z',
          total: '85000.00',
        },
      ],
      payments: [
        {
          id: 'pay-1',
          status: 'REGISTRADO',
          method: 'EFECTIVO',
          amount: '85000.00',
          paidAt: '2026-11-08T00:00:00.000Z',
        },
      ],
    } as unknown as BillingAccountStatement;
    renderCard({ statement, canReadBilling: true });
    const list = await findList();
    expect(within(list).getByText('Pago registrado')).toBeInTheDocument();
    expect(within(list).getByText('Factura FE-10')).toBeInTheDocument();
  });

  it('«Ver más» muestra el resto y pide la página siguiente cuando la fuente tiene más', async () => {
    const user = userEvent.setup();
    const first = Array.from({ length: 12 }, (_, index) =>
      lifecycle(`lc-${index}`, `2026-10-${String(20 - index).padStart(2, '0')}T10:00:00.000Z`),
    );
    lifecycleSpy.mockResolvedValueOnce({ data: first, meta: meta({ hasMore: true }) });
    lifecycleSpy.mockResolvedValueOnce({
      data: [lifecycle('lc-old', '2026-01-01T10:00:00.000Z')],
      meta: meta({ page: 2, hasMore: false }),
    });
    renderCard();
    expect(within(await findList()).getAllByRole('listitem')).toHaveLength(10);
    await user.click(screen.getByRole('button', { name: 'Ver más' }));
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Actividad del suscriptor' })).getAllByRole(
          'listitem',
        ),
      ).toHaveLength(14),
    );
    expect(lifecycleSpy).toHaveBeenLastCalledWith(SUBSCRIBER_ID, { page: 2, limit: 20 });
    expect(screen.queryByRole('button', { name: 'Ver más' })).not.toBeInTheDocument();
  });

  it('error total: conserva la cabecera y «Reintentar» vuelve a consultar', async () => {
    const user = userEvent.setup();
    lifecycleSpy.mockRejectedValueOnce(new Error('caída'));
    notesSpy.mockRejectedValueOnce(new Error('caída'));
    renderCard();
    expect(await screen.findByText('No pudimos cargar la actividad')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Actividad' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await findList()).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Actividad' })).toHaveFocus());
  });

  it('error parcial: muestra lo que llegó y avisa que puede estar incompleto', async () => {
    notesSpy.mockRejectedValueOnce(new Error('caída'));
    renderCard();
    expect(await screen.findByText('Parte de la actividad no se pudo cargar')).toBeInTheDocument();
    expect(within(await findList()).getAllByRole('listitem')).toHaveLength(1);
  });

  it('403 en todas las fuentes: explica que el titular está bloqueado para el perfil', async () => {
    const forbidden = new ApiError(403, 'BLOCKED_DATA_READ_FORBIDDEN', 'bloqueado');
    lifecycleSpy.mockRejectedValueOnce(forbidden);
    notesSpy.mockRejectedValueOnce(forbidden);
    renderCard();
    expect(
      await screen.findByText('No tienes acceso a la actividad de este suscriptor'),
    ).toBeInTheDocument();
  });

  it('sin actividad muestra el estado vacío con una frase', async () => {
    lifecycleSpy.mockResolvedValueOnce({ data: [], meta: meta() });
    notesSpy.mockResolvedValueOnce({ data: [], meta: meta() });
    renderCard();
    expect(await screen.findByText('Aún no hay actividad registrada')).toBeInTheDocument();
  });

  describe('caja de nota', () => {
    it('no aparece sin el permiso de gestión de suscriptores', async () => {
      renderCard();
      await findList();
      expect(screen.queryByLabelText('Nueva nota')).not.toBeInTheDocument();
    });

    it.each([
      ['anonimizado', { anonymized: true }],
      ['con datos bloqueados', { restricted: true }],
    ])('no aparece con el titular %s', async (_label, props) => {
      mockGranted.current.add(AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE);
      renderCard(props);
      await findList();
      expect(screen.queryByLabelText('Nueva nota')).not.toBeInTheDocument();
    });

    it('cuenta caracteres, avisa de no escribir datos sensibles y guarda la nota', async () => {
      const user = userEvent.setup();
      mockGranted.current.add(AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE);
      createSpy.mockResolvedValueOnce(
        note('n-2', 'Prefiere contacto por la tarde.', '2026-11-10T10:00:00.000Z'),
      );
      renderCard();
      await findList();
      const field = screen.getByLabelText('Nueva nota');
      expect(field).toHaveAttribute('maxLength', String(SUBSCRIBER_NOTE_BODY_MAX_LENGTH));
      expect(field).toHaveAccessibleDescription(/No escribas datos sensibles/);
      expect(screen.getByRole('button', { name: 'Guardar nota' })).toBeDisabled();
      await user.type(field, '  Prefiere contacto por la tarde.  ');
      expect(screen.getByText(`35/${SUBSCRIBER_NOTE_BODY_MAX_LENGTH}`)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Guardar nota' }));
      expect(createSpy).toHaveBeenCalledWith(SUBSCRIBER_ID, {
        body: 'Prefiere contacto por la tarde.',
      });
      expect(await screen.findByText('Nota guardada.')).toBeInTheDocument();
      expect(within(await findList()).getAllByRole('listitem')[0]).toHaveTextContent(
        'Prefiere contacto por la tarde.',
      );
      expect(field).toHaveValue('');
    });

    it('409: retira la caja y explica que el titular está bloqueado o anonimizado', async () => {
      const user = userEvent.setup();
      mockGranted.current.add(AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE);
      createSpy.mockRejectedValueOnce(new ApiError(409, 'PRIVACY_DATA_BLOCKED', 'bloqueado'));
      renderCard();
      await findList();
      await user.type(screen.getByLabelText('Nueva nota'), 'Nota de prueba');
      await user.click(screen.getByRole('button', { name: 'Guardar nota' }));
      expect(
        await screen.findByText(
          'No se pueden agregar notas: los datos del titular están bloqueados o anonimizados.',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText('Nueva nota')).not.toBeInTheDocument();
    });

    it('403: informa que el perfil no permite registrar notas sin repetir el texto del servidor', async () => {
      const user = userEvent.setup();
      mockGranted.current.add(AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE);
      createSpy.mockRejectedValueOnce(new ApiError(403, 'FORBIDDEN', 'detalle interno'));
      renderCard();
      await findList();
      await user.type(screen.getByLabelText('Nueva nota'), 'Nota de prueba');
      await user.click(screen.getByRole('button', { name: 'Guardar nota' }));
      expect(
        await screen.findByText('Tu perfil no permite registrar notas en este suscriptor.'),
      ).toBeInTheDocument();
      expect(screen.queryByText('detalle interno')).not.toBeInTheDocument();
    });
  });
});

describe('subscriber-activity (composición pura)', () => {
  it('ordena de lo más reciente a lo más antiguo con empate estable', () => {
    const items: ActivityItem[] = [
      { key: 'b', kind: 'nota', at: '2026-01-01T00:00:00Z', title: 'b' },
      { key: 'a', kind: 'nota', at: '2026-01-01T00:00:00Z', title: 'a' },
      { key: 'c', kind: 'nota', at: '2026-02-01T00:00:00Z', title: 'c' },
    ];
    expect(sortActivity(items).map((item) => item.key)).toEqual(['c', 'a', 'b']);
  });

  it('no nombra el servicio de un titular anonimizado', () => {
    expect(
      lifecycleToActivity(lifecycle('x', '2026-01-01T00:00:00Z'), [CONTRACT], true).title,
    ).toBe('Servicio pasó a suspendido');
  });

  it('marca el pago anulado y tolera un estado de cuenta sin montos', () => {
    const items = statementToActivity({
      documents: [],
      payments: [{ id: 'p', status: 'ANULADO', method: 'OTRO', paidAt: '2026-01-01' }],
    } as unknown as BillingAccountStatement);
    expect(items[0]).toMatchObject({ title: 'Pago anulado', detail: 'Otro medio' });
  });
});
