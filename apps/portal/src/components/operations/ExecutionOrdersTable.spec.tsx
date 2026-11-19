// apps/portal/src/components/operations/ExecutionOrdersTable.spec.tsx
// Tabla operativa de la bandeja de OT — contrato de componente
// docs/specs/2026-09-13-mod11-operaciones-tablas-operativas-contrato-componente.md
// v1.0 (congelado). Cubre CA-05 (un solo pie elegido por
// `meta.capabilities.randomAccess` — un único ternario), CA-01 (listado de OT)
// y CA-10 (§8.1: encabezados no ordenables mientras `sortableFields` esté
// vacío; prohibido `PortalDataTableSortableHead`).
import type { ComponentProps } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExecutionOrderResult, ExecutionOrderStatus, WfmWorkType } from '@iwana/shared';
import type { ExecutionOrderListItem } from '@/lib/api-client';
import { ExecutionOrdersTable } from './ExecutionOrdersTable';
import { EXECUTION_ORDER_RESULT_LABELS, EXECUTION_ORDER_STATUS_LABELS } from './operations-labels';
import type { OperationsTablePagination } from './operations-table-pagination';

type OrderOverrides = Partial<Omit<ExecutionOrderListItem, 'result' | 'assignee'>> & {
  result?: ExecutionOrderListItem['result'] | undefined;
  assignee?: ExecutionOrderListItem['assignee'] | undefined;
};

function buildOrder(overrides: OrderOverrides = {}): ExecutionOrderListItem {
  return {
    id: 'eo-001',
    number: 'OT-0001',
    status: ExecutionOrderStatus.ASSIGNED,
    result: undefined,
    workType: WfmWorkType.INSTALLATION,
    schedule: {
      eventId: 'event-001',
      window: {
        startAt: '2026-09-13T14:00:00.000Z',
        endAt: '2026-09-13T16:00:00.000Z',
      },
    },
    assignee: { type: 'TECHNICIAN', id: 'tech-001', displayLabel: 'Carlos López' },
    customerDisplayLabel: 'Cliente Ejemplo',
    municipality: 'Bogotá',
    ticketId: null,
    taskId: null,
    visitRequestId: null,
    createdAt: '2026-09-13T10:00:00.000Z',
    updatedAt: '2026-09-13T10:00:00.000Z',
    ...overrides,
  } as ExecutionOrderListItem;
}

const pagedPagination: OperationsTablePagination = {
  randomAccess: true,
  page: 2,
  pageCount: 3,
  pageSize: 20,
  onPageChange: jest.fn(),
  onPageSizeChange: jest.fn(),
};

const loadMorePagination: OperationsTablePagination = {
  randomAccess: false,
  hasMore: true,
  onLoadMore: jest.fn(),
};

function renderTable(props: Partial<ComponentProps<typeof ExecutionOrdersTable>> = {}) {
  return render(
    <ExecutionOrdersTable
      orders={[buildOrder()]}
      total={45}
      isLoading={false}
      from={21}
      to={40}
      onOpenRow={jest.fn()}
      pagination={pagedPagination}
      {...props}
    />,
  );
}

describe('ExecutionOrdersTable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('pinta las 6 columnas (enmienda: Orden funde tipo de trabajo, Estado funde resultado) y los ocho datos', () => {
    renderTable();

    expect(screen.getAllByRole('columnheader')).toHaveLength(6);
    for (const header of [
      'Orden',
      'Estado',
      'Ventana planificada',
      'Asignado a',
      'Cliente',
      'Municipio',
    ]) {
      expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument();
    }

    expect(screen.getByRole('button', { name: 'OT-0001' })).toBeInTheDocument();
    expect(screen.getByText('Asignada')).toBeInTheDocument();
    expect(screen.getByText('Instalación')).toBeInTheDocument();
    expect(screen.getByText('Carlos López')).toBeInTheDocument();
    expect(screen.getByText('Cliente Ejemplo')).toBeInTheDocument();
    expect(screen.getByText('Bogotá')).toBeInTheDocument();
  });

  it('sin resultado ni municipio pinta «—» (contrato §7.2)', () => {
    renderTable({
      orders: [buildOrder({ result: undefined, municipality: null })],
    });

    // Sin resultado, Estado muestra solo el estado; el municipio vacío sigue en «—».
    const row = screen.getByRole('row', { name: /OT-0001/ });
    const cells = within(row).getAllByRole('cell');
    expect(within(cells[5] as HTMLElement).getByText('—')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(1);
    expect(screen.queryByText('Resultado:')).not.toBeInTheDocument();
  });

  it('con resultado, Estado pinta el estado y el resultado con su rótulo móvil', () => {
    renderTable({
      orders: [
        buildOrder({
          status: ExecutionOrderStatus.COMPLETED,
          result: ExecutionOrderResult.EXECUTED,
        }),
      ],
    });

    const row = screen.getByRole('row', { name: /OT-0001/ });
    const statusCell = within(row).getAllByRole('cell')[1] as HTMLElement;
    expect(statusCell).toHaveTextContent(
      EXECUTION_ORDER_STATUS_LABELS[ExecutionOrderStatus.COMPLETED],
    );
    expect(statusCell).toHaveTextContent(
      EXECUTION_ORDER_RESULT_LABELS[ExecutionOrderResult.EXECUTED],
    );
    expect(within(statusCell).getByText('Resultado:').className).toMatch(/(^|\s)md:sr-only(\s|$)/);
  });

  describe('ventana nula (E4, contrato v1.2 §7.2 col. 5)', () => {
    function windowCellOf(status: ExecutionOrderStatus): HTMLElement {
      renderTable({
        orders: [buildOrder({ status, schedule: { eventId: null, window: null } })],
      });
      const row = screen.getByRole('row', { name: /OT-0001/ });
      return within(row).getAllByRole('cell')[2] as HTMLElement;
    }

    it.each([
      ExecutionOrderStatus.CREATED,
      ExecutionOrderStatus.ASSIGNED,
      ExecutionOrderStatus.EN_ROUTE,
      ExecutionOrderStatus.IN_PROGRESS,
      ExecutionOrderStatus.BLOCKED,
    ])('estado abierto %s sin ventana pinta «Por programar»', (status) => {
      const cell = windowCellOf(status);

      expect(cell).toHaveTextContent(/^Por programar$/);
      expect(cell).not.toHaveTextContent('—');
    });

    it.each([
      ExecutionOrderStatus.COMPLETED,
      ExecutionOrderStatus.COMPLETED_WITH_OBSERVATIONS,
      ExecutionOrderStatus.NOT_EXECUTED,
      ExecutionOrderStatus.CANCELLED,
    ])('estado terminal %s sin ventana pinta «Sin ventana planificada»', (status) => {
      const cell = windowCellOf(status);

      expect(cell).toHaveTextContent(/^Sin ventana planificada$/);
      expect(cell).not.toHaveTextContent('—');
    });

    it('los estados textuales no usan mono técnico (solo las fechas)', () => {
      const open = windowCellOf(ExecutionOrderStatus.CREATED);
      expect(open.className).not.toMatch(/font-mono/);
      expect(open.className).not.toMatch(/text-xs/);

      cleanup();
      const terminal = windowCellOf(ExecutionOrderStatus.CANCELLED);
      expect(terminal.className).not.toMatch(/font-mono/);
    });

    it('con ventana conserva el intervalo exacto (en `title`) y el mono técnico, sin texto de estado', () => {
      renderTable({
        orders: [buildOrder({ status: ExecutionOrderStatus.CREATED })],
      });

      const row = screen.getByRole('row', { name: /OT-0001/ });
      const cell = within(row).getAllByRole('cell')[2] as HTMLElement;
      const fmt = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
      // Spec 2026-11-19 §3 E: la celda muestra el inicio relativo y el intervalo
      // exacto pasa al `title` (antes se pintaba completo en la celda).
      expect(cell).toHaveAttribute(
        'title',
        `${fmt.format(new Date('2026-09-13T14:00:00.000Z'))} – ${fmt.format(new Date('2026-09-13T16:00:00.000Z'))}`,
      );
      expect(cell).toHaveTextContent(fmt.format(new Date('2026-09-13T14:00:00.000Z')));
      expect(cell.className).toMatch(/font-mono/);
      expect(cell).not.toHaveTextContent('Por programar');
      expect(cell).not.toHaveTextContent('Sin ventana planificada');
    });

    it('pinta el orden recibido del servidor: sin ventana primero, sin reordenar localmente', () => {
      renderTable({
        orders: [
          buildOrder({
            id: 'eo-a',
            number: 'OT-A',
            status: ExecutionOrderStatus.CREATED,
            schedule: { eventId: null, window: null },
          }),
          buildOrder({ id: 'eo-b', number: 'OT-B' }),
          buildOrder({
            id: 'eo-c',
            number: 'OT-C',
            status: ExecutionOrderStatus.CANCELLED,
            schedule: { eventId: null, window: null },
          }),
          buildOrder({
            id: 'eo-d',
            number: 'OT-D',
            schedule: {
              eventId: 'event-d',
              window: { startAt: '2026-01-01T14:00:00.000Z', endAt: '2026-01-01T16:00:00.000Z' },
            },
          }),
        ],
      });

      const numbers = screen
        .getAllByRole('button', { name: /^OT-/ })
        .map((button) => button.textContent);
      expect(numbers).toEqual(['OT-A', 'OT-B', 'OT-C', 'OT-D']);
    });
  });

  it('sin asignado pinta «Sin asignar» (pool)', () => {
    renderTable({ orders: [buildOrder({ assignee: undefined })] });

    expect(screen.getByText('Sin asignar')).toBeInTheDocument();
  });

  it('formatea la ventana planificada con su fecha de inicio (y fin si difiere)', () => {
    const expected = new Intl.DateTimeFormat('es-CO', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    const start = expected.format(new Date('2026-09-13T14:00:00.000Z'));

    renderTable();
    expect(screen.getByText(new RegExp(escapeRegExp(start)))).toBeInTheDocument();

    renderTable({
      orders: [
        buildOrder({
          schedule: {
            eventId: 'event-002',
            window: {
              startAt: '2026-09-14T14:00:00.000Z',
              endAt: '2026-09-14T14:00:00.000Z',
            },
          },
        }),
      ],
    });
    expect(
      screen.getAllByText(
        new RegExp(escapeRegExp(expected.format(new Date('2026-09-14T14:00:00.000Z')))),
      ).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('ventana de hoy o mañana: día relativo y hora (spec 2026-11-19 §3 E)', () => {
    const today = new Date();
    today.setHours(14, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    renderTable({
      orders: [
        buildOrder({
          id: 'eo-hoy',
          number: 'OT-HOY',
          schedule: {
            eventId: 'e1',
            window: { startAt: today.toISOString(), endAt: today.toISOString() },
          },
        }),
        buildOrder({
          id: 'eo-manana',
          number: 'OT-MANANA',
          schedule: {
            eventId: 'e2',
            window: { startAt: tomorrow.toISOString(), endAt: tomorrow.toISOString() },
          },
        }),
      ],
    });

    expect(screen.getByText('Hoy 14:00')).toBeInTheDocument();
    expect(screen.getByText('Mañana 9:00')).toBeInTheDocument();
  });

  it('la fila entera abre la consola una sola vez (spec 2026-11-19 §3 D)', async () => {
    const user = userEvent.setup();
    const onOpenRow = jest.fn();
    renderTable({ onOpenRow });

    await user.click(screen.getByText('Carlos López'));
    expect(onOpenRow).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'OT-0001' }));
    expect(onOpenRow).toHaveBeenCalledTimes(2);
  });

  it('bajo 768 px la tabla se lee como tarjetas, sin ancho mínimo (spec 2026-11-19 §3 F, CA-6)', () => {
    renderTable();

    const table = screen.getByRole('table', { name: 'Bandeja de órdenes de ejecución' });
    expect(table.className).toMatch(/max-md:block/);
    expect(table.className).not.toMatch(/(^|\s)min-w-/);
    expect(table.parentElement?.className).not.toMatch(/(^|\s)overflow-x-auto/);
    expect(table.querySelector('thead')?.className).toMatch(/max-md:sr-only/);
  });

  it('CA-2: desde md las filas van en una línea salvo Cliente, que no se recorta', () => {
    renderTable();

    for (const header of screen.getAllByRole('columnheader')) {
      expect(header.className).toMatch(/md:whitespace-nowrap/);
      expect(header.className).toMatch(/md:py-2/);
    }
    const row = screen.getByText('Cliente Ejemplo').closest('tr') as HTMLElement;
    const cells = within(row).getAllByRole('cell');
    expect(cells).toHaveLength(6);
    // Orden, Estado y Ventana: una sola línea.
    for (const index of [0, 1, 2]) {
      expect(cells[index]?.className).toMatch(/md:whitespace-nowrap/);
    }
    for (const cell of cells) {
      expect(cell.className).toMatch(/md:py-2/);
    }
    // Cliente: ni nowrap ni truncado; su contenido no cambia.
    const clientCell = cells[4] as HTMLElement;
    expect(clientCell.className).not.toMatch(/whitespace-nowrap|truncate|line-clamp/);
    expect(clientCell).toHaveTextContent('Cliente Ejemplo');
  });

  it('P-1: en móvil el fin de la ventana queda visible en la tarjeta (no solo en `title`)', () => {
    renderTable();

    const row = screen.getByRole('row', { name: /OT-0001/ });
    const cell = within(row).getAllByRole('cell')[2] as HTMLElement;
    const fmt = new Intl.DateTimeFormat('es-CO', {
      hour: 'numeric',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    const end = within(cell).getByText(`hasta ${fmt.format(new Date('2026-09-13T16:00:00.000Z'))}`);
    // Visible por debajo de 768 px y oculto desde md (allí lo lleva el `title`).
    expect(end.className).toMatch(/(^|\s)md:hidden(\s|$)/);
    expect(end.className).not.toMatch(/sr-only/);
    expect(end.closest('[aria-hidden="true"]')).toBeNull();
  });

  it('P-3: cada dato de la tarjeta móvil lleva su rótulo, sin cambiar el contenido del cliente', () => {
    renderTable({
      orders: [buildOrder({ result: undefined })],
    });

    const row = screen.getByRole('row', { name: /OT-0001/ });
    const cells = within(row).getAllByRole('cell');
    const expected: Array<[number, string]> = [
      [2, 'Ventana:'],
      [3, 'Asignado a:'],
      [4, 'Cliente:'],
      [5, 'Municipio:'],
    ];
    expect(within(cells[0] as HTMLElement).getByText('Tipo de trabajo:').className).toMatch(
      /(^|\s)md:sr-only(\s|$)/,
    );
    for (const [index, label] of expected) {
      const caption = within(cells[index] as HTMLElement).getByText(label);
      expect(caption.className).toMatch(/(^|\s)md:sr-only(\s|$)/);
    }
    expect(within(cells[4] as HTMLElement).getByText('Cliente Ejemplo').tagName).toBe('SPAN');
  });

  it('abre el detalle de la fila con el callback onOpenRow (spec §4.6)', async () => {
    const user = userEvent.setup();
    const onOpenRow = jest.fn();
    renderTable({ onOpenRow });

    await user.click(screen.getByRole('button', { name: 'OT-0001' }));

    expect(onOpenRow).toHaveBeenCalledWith(expect.objectContaining({ id: 'eo-001' }));
  });

  it('CA-05 / ADR-065 §6: con randomAccess true monta SOLO el pager numerado', () => {
    renderTable({ pagination: pagedPagination });

    expect(screen.getByText('Mostrando 21–40 de 45 órdenes de ejecución')).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'Paginación de órdenes de ejecución' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  it('CA-05 / ADR-065 §6: con randomAccess false monta SOLO «Cargar más»', () => {
    renderTable({ pagination: loadMorePagination, from: 1, to: 20, total: 45 });

    expect(screen.getByRole('button', { name: 'Cargar más' })).toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Paginación de órdenes de ejecución' }),
    ).not.toBeInTheDocument();
  });

  it('el pie pierde el navegador cuando totalPages <= 1 (ADR-065 §5)', () => {
    renderTable({
      pagination: { ...pagedPagination, page: 1, pageCount: 1 },
      from: 1,
      to: 8,
      total: 8,
    });

    expect(screen.getByText('8 órdenes de ejecución')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Siguiente' })).not.toBeInTheDocument();
  });

  it('sin resultados no monta pie (el vacío lo resuelve el contenedor)', () => {
    renderTable({ orders: [], total: 0, pagination: pagedPagination });

    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Paginación de órdenes de ejecución' }),
    ).not.toBeInTheDocument();
  });

  it('en carga inicial pinta filas skeleton con la forma de la tabla (contrato §6.5)', () => {
    renderTable({ isLoading: true, orders: [] });

    const skeletonRows = document.querySelectorAll('tbody tr');
    expect(skeletonRows.length).toBe(8);
    skeletonRows.forEach((row) => {
      expect(row.querySelector('td')?.getAttribute('colspan')).toBe('6');
    });
  });

  it('en refresco con datos pintados marca aria-busy (sin opacity, contrato §6.5)', () => {
    const { container } = renderTable({ refreshing: true });

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.getByText('OT-0001')).toBeInTheDocument();
  });

  it('CA-10 / contrato §8.1: sin aria-sort ni encabezado ordenable con la lista blanca vacía', () => {
    renderTable();

    expect(document.querySelectorAll('th[aria-sort]').length).toBe(0);
    expect(document.querySelectorAll('thead button').length).toBe(0);
  });

  it('resalta la fila con el detalle abierto (`activeRowId`)', () => {
    const { container } = renderTable({ activeRowId: 'eo-001' });

    const activeRow = container.querySelector('tbody tr');
    expect(activeRow?.className).toMatch(/bg-iwana-primary-50/);
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
