import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { InstallationRule } from '@iwana/shared';
import { PlanCatalogTable } from './PlanCatalogTable';
import type { PlanCatalogItem } from '@/lib/api-client';
import { PLAN_CATALOG_COLUMNS_STORAGE_KEY } from './plan-catalog-columns';

function mockMatchMediaSmUp(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('640') ? matches : false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }),
  });
}

function buildPlan(overrides: Partial<PlanCatalogItem> = {}): PlanCatalogItem {
  return {
    id: 'plan-1',
    name: 'Hogar 300',
    technology: 'GPON',
    installationRule: InstallationRule.ON_DEMAND,
    downloadSpeedMbps: 300,
    uploadSpeedMbps: 300,
    basePrice: 89900,
    installationFee: 50000,
    currentPrice: '89900',
    isActive: true,
    createdAt: '2026-05-01T10:00:00.000Z',
    updatedAt: '2026-05-02T11:00:00.000Z',
    ...overrides,
  };
}

function renderTable(overrides: Partial<ComponentProps<typeof PlanCatalogTable>> = {}) {
  const props: ComponentProps<typeof PlanCatalogTable> = {
    canEdit: true,
    isLoading: false,
    totalPlans: 1,
    filteredPlans: [buildPlan()],
    searchValue: '',
    missingPriceFilter: false,
    hasActiveFilters: false,
    page: 1,
    pageCount: 1,
    from: 1,
    to: 1,
    pageSize: 20,
    onPageChange: jest.fn(),
    onPageSizeChange: jest.fn(),
    onUpdateFilters: jest.fn(),
    onClearFilters: jest.fn(),
    onOpenCreate: jest.fn(),
    onOpenEdit: jest.fn(),
    ...overrides,
  };

  return { ...render(<PlanCatalogTable {...props} />), props };
}

describe('PlanCatalogTable', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockMatchMediaSmUp(true);
  });

  it('muestra empty state de primera vez con CTA Nuevo plan', () => {
    const { props } = renderTable({
      filteredPlans: [],
      totalPlans: 0,
      hasActiveFilters: false,
    });

    expect(screen.getByText('Sin planes registrados')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cargar más/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Nuevo plan' })[0]!);
    expect(props.onOpenCreate).toHaveBeenCalled();
  });

  it('distingue el vacío filtrado del de primera vez', () => {
    const { props } = renderTable({
      filteredPlans: [],
      totalPlans: 0,
      hasActiveFilters: true,
      searchValue: 'sin-match',
    });

    expect(screen.getByText('No hay planes para los filtros seleccionados')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Limpiar filtros' })[0]!);
    expect(props.onClearFilters).toHaveBeenCalled();
  });

  it('muestra pager numerado y no Cargar más', () => {
    renderTable({
      filteredPlans: [buildPlan(), buildPlan({ id: 'plan-2', name: 'Hogar 600' })],
      totalPlans: 45,
      page: 1,
      pageCount: 3,
      from: 1,
      to: 20,
      pageSize: 20,
    });

    expect(screen.getByRole('navigation', { name: /Paginación de planes/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cargar más/i })).not.toBeInTheDocument();
    expect(screen.getAllByText(/Mostrando 1–20 de 45 planes/).length).toBeGreaterThan(0);
  });

  it('llama a onPageChange al pulsar Siguiente', () => {
    const onPageChange = jest.fn();
    renderTable({
      filteredPlans: [buildPlan()],
      totalPlans: 45,
      page: 1,
      pageCount: 3,
      from: 1,
      to: 20,
      onPageChange,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('no monta pie cuando el total es 0', () => {
    renderTable({
      filteredPlans: [],
      totalPlans: 0,
      hasActiveFilters: true,
      page: 1,
      pageCount: 1,
      from: 0,
      to: 0,
    });

    expect(screen.queryByRole('navigation', { name: /Paginación/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Mostrando/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cargar más/i })).not.toBeInTheDocument();
  });

  it('coloca búsqueda, chip y Columnas en la misma fila', () => {
    renderTable({
      filteredPlans: [buildPlan()],
      totalPlans: 1,
    });

    const search = screen.getByLabelText('Buscar plan');
    const chip = screen.getByRole('button', { name: 'Sin precio vigente' });
    const columns = screen.getByRole('button', { name: 'Columnas de la tabla' });
    const row = chip.closest('div.flex.flex-wrap.items-center.justify-between');

    expect(screen.queryByLabelText('Estado')).not.toBeInTheDocument();
    expect(columns.closest('table')).toBeNull();
    expect(columns.closest('th')).toBeNull();
    expect(row).toBeTruthy();
    expect(row).toContainElement(search);
    expect(row).toContainElement(chip);
    expect(row).toContainElement(columns);
    expect(chip.className).toMatch(/h-12/);
    expect(chip.className).toMatch(/bg-amber-50/);
    expect(chip.className).not.toMatch(/portalFilterChipGroup/);
    expect(
      screen.getByText('Hogar 300').closest('tr')?.querySelectorAll('td[aria-hidden="true"]'),
    ).toHaveLength(0);
    expect(screen.getByRole('columnheader', { name: 'Plan' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Descripción' })).not.toBeInTheDocument();
  });

  it('no muestra Descripción por defecto si no hay dato y la suma al marcarla', async () => {
    renderTable({
      filteredPlans: [buildPlan({ description: null })],
      totalPlans: 1,
    });

    expect(screen.queryByRole('columnheader', { name: 'Descripción' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Columnas de la tabla' }));
    const descriptionItem = await screen.findByRole('menuitem', { name: /Descripción/ });
    fireEvent.click(descriptionItem);

    expect(screen.getByRole('columnheader', { name: 'Descripción' })).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(window.localStorage.getItem(PLAN_CATALOG_COLUMNS_STORAGE_KEY)).toContain(
      '"description":true',
    );
  });

  it('oculta la sublínea de tecnología bajo el nombre cuando la columna Tecnología está visible', async () => {
    renderTable({
      filteredPlans: [buildPlan({ technology: 'GPON' })],
      totalPlans: 1,
    });

    expect(screen.getByRole('columnheader', { name: 'Tecnología' })).toBeInTheDocument();
    const nameCell = screen.getByText('Hogar 300').closest('td');
    expect(nameCell).toBeTruthy();
    expect(nameCell).not.toHaveTextContent('GPON');
    expect(screen.getByText('GPON')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Columnas de la tabla' }));
    const technologyItem = await screen.findByRole('menuitem', { name: /Tecnología/ });
    fireEvent.click(technologyItem);

    expect(screen.queryByRole('columnheader', { name: 'Tecnología' })).not.toBeInTheDocument();
    expect(screen.getByText('Hogar 300').closest('td')).toHaveTextContent('GPON');
  });

  it('mantiene el pager y no muestra Cargar más con el menú de columnas', () => {
    renderTable({
      filteredPlans: [buildPlan(), buildPlan({ id: 'plan-2', name: 'Hogar 600' })],
      totalPlans: 45,
      page: 1,
      pageCount: 3,
      from: 1,
      to: 20,
      pageSize: 20,
    });

    expect(screen.getByRole('button', { name: 'Columnas de la tabla' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /Paginación de planes/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cargar más/i })).not.toBeInTheDocument();
  });

  it('sin sortableFields no inventa encabezados ordenables', () => {
    renderTable({
      filteredPlans: [buildPlan()],
      totalPlans: 1,
    });

    expect(screen.queryByRole('button', { name: /Ordenar por/i })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Plan' })).toBeInTheDocument();
  });

  it('con sortableFields hace clic en Plan y cicla el orden', () => {
    const onSortChange = jest.fn();
    renderTable({
      filteredPlans: [buildPlan()],
      totalPlans: 1,
      sortableFields: ['name', 'isActive'],
      activeSort: null,
      onSortChange,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Ordenar por Plan, ascendente' }));
    expect(onSortChange).toHaveBeenLastCalledWith({ by: 'name', dir: 'asc' });
    expect(screen.queryByRole('button', { name: /Ordenar por Acciones/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Columnas de la tabla' })).toBeInTheDocument();
  });

  it('con orden activo en Plan anuncia el siguiente paso descendente', () => {
    const onSortChange = jest.fn();
    renderTable({
      filteredPlans: [buildPlan()],
      totalPlans: 1,
      sortableFields: ['name'],
      activeSort: { by: 'name', dir: 'asc' },
      onSortChange,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Ordenar por Plan, descendente' }));
    expect(onSortChange).toHaveBeenLastCalledWith({ by: 'name', dir: 'desc' });
  });

  it('alinea encabezados a la izquierda y en sentence case con las celdas', () => {
    renderTable({
      filteredPlans: [buildPlan()],
      totalPlans: 1,
      sortableFields: ['name', 'downloadSpeedMbps', 'basePrice', 'technology'],
      activeSort: null,
      onSortChange: jest.fn(),
    });

    const speedHead = screen.getByRole('columnheader', { name: /Velocidad/i });
    const priceHead = screen.getByRole('columnheader', { name: /Precio base/i });
    const techHead = screen.getByRole('columnheader', { name: /Tecnología/i });
    const actionsHead = screen.getByRole('columnheader', { name: 'Acciones' });

    expect(speedHead.className).not.toContain('text-right');
    expect(priceHead.className).not.toContain('text-right');
    expect(techHead.className).not.toContain('text-right');
    expect(speedHead.className).toMatch(/text-sm/);
    expect(actionsHead.className).toMatch(/text-sm/);
    expect(actionsHead.className).toMatch(/normal-case/);
    expect(actionsHead).toHaveTextContent('Acciones');
    expect(actionsHead).not.toHaveTextContent('ACCIONES');
  });
});
