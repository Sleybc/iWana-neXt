// apps/portal/src/components/operations/ExecutionOrdersTable.spec.tsx
// Tabla operativa de la bandeja de OT — contrato de componente
// docs/specs/2026-09-13-mod11-operaciones-tablas-operativas-contrato-componente.md
// v1.0 (congelado). Cubre CA-05 (un solo pie elegido por
// `meta.capabilities.randomAccess` — un único ternario), CA-01 (listado de OT)
// y CA-10 (§8.1: encabezados no ordenables mientras `sortableFields` esté
// vacío; prohibido `PortalDataTableSortableHead`).
import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExecutionOrderStatus, WfmWorkType } from '@iwana/shared';
import type { ExecutionOrderListItem } from '@/lib/api-client';
import { ExecutionOrdersTable } from './ExecutionOrdersTable';
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

  it('pinta las 8 columnas del contrato §7.2 y la fila de la proyección', () => {
    renderTable();

    for (const header of [
      'Número',
      'Estado',
      'Resultado',
      'Tipo de trabajo',
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

    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
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
      expect(row.querySelector('td')?.getAttribute('colspan')).toBe('8');
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
