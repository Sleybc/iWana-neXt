// apps/portal/src/components/operations/TasksTable.spec.tsx
// Tabla operativa de la bandeja de tareas — contrato de componente
// docs/specs/2026-09-13-mod11-operaciones-tablas-operativas-contrato-componente.md
// v1.0 (congelado). Cubre CA-09 (columna «Vence» y sus estados, UX spec §7.3),
// CA-05 (un solo pie por `randomAccess`), CA-10 (§8.1: sin `aria-sort` con la
// lista blanca vacía) y CA-04 (apertura de fila hacia el detalle en URL).
import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskPriority, TaskStatus, TaskType } from '@iwana/shared';
import type { OperationalTaskRecord } from '@/lib/api-client';
import { TasksTable } from './TasksTable';
import type { OperationsTablePagination } from './operations-table-pagination';

function buildTask(overrides: Partial<OperationalTaskRecord> = {}): OperationalTaskRecord {
  return {
    id: 'task-001',
    taskNumber: 'TSK-0001',
    title: 'Tarea operativa',
    type: TaskType.INTERNAL_OPERATION,
    status: TaskStatus.OPEN,
    priority: TaskPriority.NORMAL,
    recipientLabel: 'Operaciones',
    responsibleRefId: 'user-001',
    responsibleLabel: 'Laura Ruiz',
    createdAt: '2026-09-13T10:00:00.000Z',
    ...overrides,
  } as OperationalTaskRecord;
}

const pagedPagination: OperationsTablePagination = {
  randomAccess: true,
  page: 1,
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

function renderTable(props: Partial<ComponentProps<typeof TasksTable>> = {}) {
  return render(
    <TasksTable
      tasks={[buildTask()]}
      total={45}
      isLoading={false}
      from={1}
      to={20}
      onOpenRow={jest.fn()}
      pagination={pagedPagination}
      {...props}
    />,
  );
}

describe('TasksTable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('pinta las 7 columnas del contrato §7.1, con «Vence» en lugar de «Creada»', () => {
    renderTable();

    for (const header of [
      'Número',
      'Título',
      'Tipo',
      'Estado',
      'Prioridad',
      'Destinatario',
      'Vence',
    ]) {
      expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument();
    }
    expect(screen.queryByRole('columnheader', { name: 'Creada' })).not.toBeInTheDocument();

    expect(screen.getByText('TSK-0001')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tarea operativa' })).toBeInTheDocument();
    expect(screen.getByText('Operación interna')).toBeInTheDocument();
    expect(screen.getByText('Abierta')).toBeInTheDocument();
    expect(screen.getByText('Normal')).toBeInTheDocument();
    expect(screen.getByText('Operaciones')).toBeInTheDocument();
  });

  it('abre el detalle de la tarea con el callback onOpenRow (spec §4.6)', async () => {
    const user = userEvent.setup();
    const onOpenRow = jest.fn();
    renderTable({ onOpenRow });

    await user.click(screen.getByRole('button', { name: 'Tarea operativa' }));

    expect(onOpenRow).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-001' }));
  });

  describe('columna «Vence» (UX spec §7.3)', () => {
    const NOW = new Date('2026-09-13T15:00:00.000Z');

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(NOW);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('sin fecha límite pinta «—»', () => {
      renderTable({ tasks: [buildTask({ dueAt: null })] });

      expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('vencida se señala con «Vencida ·» y texto (nunca solo color)', () => {
      renderTable({
        tasks: [buildTask({ dueAt: new Date(NOW.getTime() - 24 * 60 * 60 * 1000).toISOString() })],
      });

      expect(screen.getByText(/^Vencida · /)).toBeInTheDocument();
    });

    it('con vencimiento hoy usa la escala de atención «Hoy ·»', () => {
      renderTable({
        tasks: [buildTask({ dueAt: new Date(NOW.getTime() + 60 * 60 * 1000).toISOString() })],
      });

      expect(screen.getByText(/^Hoy · /)).toBeInTheDocument();
    });

    it('con vencimiento mañana usa la señal neutra «Mañana ·»', () => {
      renderTable({
        tasks: [buildTask({ dueAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000).toISOString() })],
      });

      expect(screen.getByText(/^Mañana · /)).toBeInTheDocument();
    });

    it('una fecha futura lejana se pinta neutra, sin señales de vencimiento', () => {
      renderTable({
        tasks: [
          buildTask({ dueAt: new Date(NOW.getTime() + 4 * 24 * 60 * 60 * 1000).toISOString() }),
        ],
      });

      const cell = document.querySelectorAll('tbody td')[6];
      expect(cell?.textContent).toBeTruthy();
      expect(cell?.textContent).not.toMatch(/Vencida|Hoy|Mañana/);
    });

    it('una tarea resuelta conserva la fecha sin señal de vencimiento', () => {
      renderTable({
        tasks: [
          buildTask({
            status: TaskStatus.RESOLVED,
            dueAt: new Date(NOW.getTime() - 48 * 60 * 60 * 1000).toISOString(),
          }),
        ],
      });

      const cell = document.querySelectorAll('tbody td')[6];
      expect(cell?.textContent).not.toMatch(/Vencida|Hoy|Mañana/);
    });
  });

  it('CA-05 / ADR-065 §6: con randomAccess true monta SOLO el pager numerado', () => {
    renderTable();

    expect(screen.getByText('Mostrando 1–20 de 45 tareas')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Paginación de tareas' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  it('CA-05 / ADR-065 §6: con randomAccess false monta SOLO «Cargar más»', () => {
    renderTable({ pagination: loadMorePagination });

    expect(screen.getByRole('button', { name: 'Cargar más' })).toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Paginación de tareas' }),
    ).not.toBeInTheDocument();
  });

  it('sin resultados no monta pie (el vacío lo resuelve el contenedor)', () => {
    renderTable({ tasks: [], total: 0 });

    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Paginación de tareas' }),
    ).not.toBeInTheDocument();
  });

  it('en carga inicial pinta filas skeleton con la forma de la tabla (contrato §6.5)', () => {
    renderTable({ isLoading: true, tasks: [] });

    const skeletonRows = document.querySelectorAll('tbody tr');
    expect(skeletonRows.length).toBe(8);
    skeletonRows.forEach((row) => {
      expect(row.querySelector('td')?.getAttribute('colspan')).toBe('7');
    });
  });

  it('en refresco con datos pintados marca aria-busy (sin opacity, contrato §6.5)', () => {
    const { container } = renderTable({ refreshing: true });

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.getByText('TSK-0001')).toBeInTheDocument();
  });

  it('CA-10 / contrato §8.1: sin aria-sort ni encabezado ordenable con la lista blanca vacía', () => {
    renderTable();

    expect(document.querySelectorAll('th[aria-sort]').length).toBe(0);
    expect(document.querySelectorAll('thead button').length).toBe(0);
  });
});
