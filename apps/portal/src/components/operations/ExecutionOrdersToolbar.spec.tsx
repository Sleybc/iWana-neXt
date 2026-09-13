// apps/portal/src/components/operations/ExecutionOrdersToolbar.spec.tsx
// Toolbar de filtros de la bandeja de OT (spec UX §7.2 — H5): Estado,
// Resultado, Tipo de trabajo, Asignado a, Sede y Ventana planificada. Cubre
// CA-01 (filtrar la bandeja) y CA-04 (todo cambio de filtro se refleja en la
// URL: el toolbar emite el patch que el cliente escribe con `replace`).
import type { ComponentProps } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExecutionOrderResult, ExecutionOrderStatus, WfmWorkType } from '@iwana/shared';
import { organizationApi, usersApi } from '@/lib/api-client';
import { ExecutionOrdersToolbar } from './ExecutionOrdersToolbar';

jest.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      void code;
    }
  },
  organizationApi: {
    list: jest.fn().mockResolvedValue({ data: [], meta: {} }),
  },
  usersApi: {
    searchForPicker: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  },
}));

function renderToolbar(props: Partial<ComponentProps<typeof ExecutionOrdersToolbar>> = {}) {
  const onFilterChange = jest.fn();
  const onClearFilters = jest.fn();
  const onRefresh = jest.fn();
  const view = render(
    <ExecutionOrdersToolbar
      filters={{}}
      onFilterChange={onFilterChange}
      onClearFilters={onClearFilters}
      onRefresh={onRefresh}
      assigneeLabel={null}
      {...props}
    />,
  );
  return { onFilterChange, onClearFilters, onRefresh, ...view };
}

describe('ExecutionOrdersToolbar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(organizationApi.list).mockResolvedValue({ data: [], meta: {} } as never);
    jest.mocked(usersApi.searchForPicker).mockResolvedValue({ data: [], total: 0 } as never);
  });

  it('monta los seis filtros de la UX spec §7.2 y la acción de refresco', () => {
    renderToolbar();

    expect(screen.getByRole('combobox', { name: 'Estado' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Resultado' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Tipo de trabajo' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Asignado a' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Sede' })).toBeInTheDocument();
    expect(screen.getByLabelText('Desde')).toBeInTheDocument();
    expect(screen.getByLabelText('Hasta')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actualizar' })).toBeInTheDocument();
  });

  it('emite el patch de estado con el enum del contrato (sin enums crudos en la UI)', async () => {
    const user = userEvent.setup();
    const { onFilterChange } = renderToolbar();

    await user.click(screen.getByRole('combobox', { name: 'Estado' }));
    await user.click(await screen.findByRole('option', { name: 'Asignada' }));

    expect(onFilterChange).toHaveBeenCalledWith({ status: ExecutionOrderStatus.ASSIGNED });
  });

  it('emite los patches de resultado y tipo de trabajo', async () => {
    const user = userEvent.setup();
    const { onFilterChange } = renderToolbar();

    await user.click(screen.getByRole('combobox', { name: 'Resultado' }));
    await user.click(await screen.findByRole('option', { name: 'Requiere seguimiento' }));
    expect(onFilterChange).toHaveBeenCalledWith({
      result: ExecutionOrderResult.REQUIRES_FOLLOW_UP,
    });

    await user.click(screen.getByRole('combobox', { name: 'Tipo de trabajo' }));
    await user.click(await screen.findByRole('option', { name: 'Mantenimiento' }));
    expect(onFilterChange).toHaveBeenCalledWith({ workType: WfmWorkType.MAINTENANCE });
  });

  it('emite la ventana planificada en fecha-only y la limpia con undefined', () => {
    const { onFilterChange } = renderToolbar();

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-09-01' } });
    expect(onFilterChange).toHaveBeenCalledWith({ windowFrom: '2026-09-01' });

    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-09-30' } });
    expect(onFilterChange).toHaveBeenCalledWith({ windowTo: '2026-09-30' });

    // El input está controlado por props: se limpia desde un valor en la URL.
    const cleared = renderToolbar({ filters: { windowFrom: '2026-09-01' } });
    fireEvent.change(screen.getAllByLabelText('Desde')[1]!, { target: { value: '' } });
    expect(cleared.onFilterChange).toHaveBeenCalledWith({ windowFrom: undefined });
  });

  it('carga las sedes del tenant y emite el site id al seleccionar', async () => {
    const user = userEvent.setup();
    jest.mocked(organizationApi.list).mockResolvedValue({
      data: [
        { id: 'site-001', name: 'Sede Norte' },
        { id: 'site-002', name: 'Sede Sur' },
      ],
      meta: {},
    } as never);
    const { onFilterChange } = renderToolbar();

    await waitFor(() => {
      expect(organizationApi.list).toHaveBeenCalledWith({ page: 1, limit: 100 });
    });

    await user.click(screen.getByRole('combobox', { name: 'Sede' }));
    await user.click(await screen.findByRole('option', { name: 'Sede Norte' }));

    expect(onFilterChange).toHaveBeenCalledWith({ organizationSiteId: 'site-001' });
  });

  it('si el catálogo de sedes falla, el selector queda operable sin bloquear la bandeja', async () => {
    const user = userEvent.setup();
    jest.mocked(organizationApi.list).mockRejectedValue(new Error('red caída'));
    renderToolbar();

    await waitFor(() => {
      expect(organizationApi.list).toHaveBeenCalled();
    });

    const siteFilter = screen.getByRole('combobox', { name: 'Sede' });
    expect(siteFilter).toBeEnabled();
    await user.click(siteFilter);
    expect(await screen.findByRole('option', { name: 'Todas las sedes' })).toBeInTheDocument();
  });

  it('muestra «Limpiar filtros» solo con filtros activos y emite onClearFilters', async () => {
    const user = userEvent.setup();
    renderToolbar({ filters: {} });
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();

    const { onClearFilters } = renderToolbar({
      filters: { status: ExecutionOrderStatus.ASSIGNED },
    });
    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it('la etiqueta del asignado se pinta como selección S0 y el picker emite su id', async () => {
    const user = userEvent.setup();
    jest.mocked(usersApi.searchForPicker).mockResolvedValue({
      data: [{ id: 'tech-001', label: 'Carlos López' }],
      total: 1,
    } as never);
    const { onFilterChange } = renderToolbar({
      filters: { assigneeId: 'tech-001' },
      assigneeLabel: 'Carlos López',
    });

    expect(screen.getByRole('combobox', { name: 'Asignado a' })).toHaveValue('Carlos López');

    await user.type(screen.getByRole('combobox', { name: 'Asignado a' }), 'car');
    await user.click(await screen.findByRole('option', { name: 'Carlos López' }));
    expect(onFilterChange).toHaveBeenCalledWith({ assigneeId: 'tech-001' });
  });

  it('«Actualizar» se deshabilita y rotula durante el refresco', async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderToolbar({ isRefreshing: true });

    const refreshButton = screen.getByRole('button', { name: 'Actualizando…' });
    expect(refreshButton).toBeDisabled();
    await user.click(refreshButton);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('«Actualizar» emite onRefresh cuando está habilitado', async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderToolbar();

    await user.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
