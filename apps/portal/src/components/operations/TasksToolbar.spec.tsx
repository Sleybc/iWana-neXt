// apps/portal/src/components/operations/TasksToolbar.spec.tsx
// Toolbar de filtros de la bandeja de tareas (spec UX §7.1 — H5). Cubre CA-09
// (filtros ampliados: tipo, responsable y ticket) y CA-04 (el patch de filtro
// que el contenedor escribe con `replace` reiniciando a página 1).
import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskStatus, TaskType } from '@iwana/shared';
import { usersApi } from '@/lib/api-client';
import { TasksToolbar } from './TasksToolbar';
import type { TasksToolbarFilters } from './TasksToolbar';

jest.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      void code;
    }
  },
  usersApi: {
    searchForPicker: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  },
}));

const EMPTY_FILTERS: TasksToolbarFilters = {
  status: '',
  type: '',
  responsibleRefId: '',
  ticketId: '',
};

function renderToolbar(props: Partial<ComponentProps<typeof TasksToolbar>> = {}) {
  const onFilterChange = jest.fn();
  const onClearFilters = jest.fn();
  const onRefresh = jest.fn();
  render(
    <TasksToolbar
      filters={EMPTY_FILTERS}
      onFilterChange={onFilterChange}
      onClearFilters={onClearFilters}
      onRefresh={onRefresh}
      responsibleLabel={null}
      {...props}
    />,
  );
  return { onFilterChange, onClearFilters, onRefresh };
}

describe('TasksToolbar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(usersApi.searchForPicker).mockResolvedValue({ data: [], total: 0 } as never);
  });

  it('monta estado, tipo, responsable y ticket (filtros ampliados de F5)', () => {
    renderToolbar();

    expect(screen.getByRole('combobox', { name: 'Estado' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Tipo' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Responsable' })).toBeInTheDocument();
    expect(screen.getByLabelText('Ticket')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actualizar' })).toBeInTheDocument();
  });

  it('el filtro de ticket nombra la referencia y no promete el número visible', () => {
    renderToolbar();

    expect(screen.getByLabelText('Ticket')).toHaveAttribute('placeholder', 'Referencia del ticket');
    expect(
      screen.getByText(
        'Filtra las tareas derivadas de un ticket de mesa de ayuda; usa la referencia del ticket.',
      ),
    ).toBeInTheDocument();
  });

  it('emite el patch de estado y de tipo con los enums del contrato', async () => {
    const user = userEvent.setup();
    const { onFilterChange } = renderToolbar();

    await user.click(screen.getByRole('combobox', { name: 'Estado' }));
    await user.click(await screen.findByRole('option', { name: 'En progreso' }));
    expect(onFilterChange).toHaveBeenCalledWith({ status: TaskStatus.IN_PROGRESS });

    await user.click(screen.getByRole('combobox', { name: 'Tipo' }));
    await user.click(await screen.findByRole('option', { name: 'Visita de campo' }));
    expect(onFilterChange).toHaveBeenCalledWith({ type: TaskType.FIELD_VISIT });
  });

  it('el filtro de ticket es exacto: no emite al teclear, solo al confirmar con Enter', async () => {
    const user = userEvent.setup();
    const { onFilterChange } = renderToolbar();

    const ticketInput = screen.getByLabelText('Ticket');
    await user.type(ticketInput, 'TCK-0007');
    expect(onFilterChange).not.toHaveBeenCalled();

    await user.keyboard('{Enter}');
    expect(onFilterChange).toHaveBeenCalledWith({ ticketId: 'TCK-0007' });
  });

  it('el filtro de ticket confirma al salir del campo y recorta espacios', async () => {
    const user = userEvent.setup();
    const { onFilterChange } = renderToolbar();

    const ticketInput = screen.getByLabelText('Ticket');
    await user.type(ticketInput, '  TCK-0008  ');
    await user.tab();

    expect(onFilterChange).toHaveBeenCalledWith({ ticketId: 'TCK-0008' });
  });

  it('un deep link con ticketId prellena el borrador sin re-emitir el filtro', () => {
    const { onFilterChange } = renderToolbar({
      filters: { ...EMPTY_FILTERS, ticketId: 'TCK-0009' },
    });

    expect(screen.getByLabelText('Ticket')).toHaveValue('TCK-0009');
    expect(onFilterChange).not.toHaveBeenCalled();
  });

  it('el responsable usa el typeahead y emite su id al seleccionar', async () => {
    const user = userEvent.setup();
    jest.mocked(usersApi.searchForPicker).mockResolvedValue({
      data: [{ id: 'user-001', label: 'Laura Ruiz' }],
      total: 1,
    } as never);
    const { onFilterChange } = renderToolbar();

    await user.type(screen.getByRole('combobox', { name: 'Responsable' }), 'lau');
    await user.click(await screen.findByRole('option', { name: 'Laura Ruiz' }));

    expect(onFilterChange).toHaveBeenCalledWith({ responsibleRefId: 'user-001' });
  });

  it('muestra la etiqueta del responsable filtrado (S0) sin lanzar búsqueda', () => {
    renderToolbar({
      filters: { ...EMPTY_FILTERS, responsibleRefId: 'user-001' },
      responsibleLabel: 'Laura Ruiz',
    });

    expect(screen.getByRole('combobox', { name: 'Responsable' })).toHaveValue('Laura Ruiz');
    expect(usersApi.searchForPicker).not.toHaveBeenCalled();
  });

  it('«Limpiar filtros» aparece solo con filtros activos y emite onClearFilters', async () => {
    const user = userEvent.setup();
    renderToolbar();
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();

    const { onClearFilters } = renderToolbar({
      filters: { ...EMPTY_FILTERS, type: TaskType.COLLECTION },
    });
    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it('«Actualizar» se deshabilita y rotula durante el refresco', () => {
    renderToolbar({ isRefreshing: true });

    const refreshButton = screen.getByRole('button', { name: 'Actualizando…' });
    expect(refreshButton).toBeDisabled();
  });
});
