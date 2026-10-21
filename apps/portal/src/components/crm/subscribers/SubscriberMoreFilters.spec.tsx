import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomerSegment, PersonType, SubscriberStatus } from '@iwana/shared';
import { SubscriberMoreFilters } from './SubscriberMoreFilters';

const baseProps = {
  expanded: false,
  onExpandedChange: jest.fn(),
  status: '',
  personType: '',
  segment: '',
  stratum: '',
  onStatusChange: jest.fn(),
  onPersonTypeChange: jest.fn(),
  onSegmentChange: jest.fn(),
  onStratumChange: jest.fn(),
  activeFilters: [],
  onRemoveFilter: jest.fn(),
  onClearFilters: jest.fn(),
  showSort: true,
  sortValue: 'name:asc',
  sortOptions: [
    { value: '', label: 'Orden por defecto' },
    { value: 'name:asc', label: 'Nombre · ascendente' },
    { value: 'name:desc', label: 'Nombre · descendente' },
  ],
  sortDisabled: false,
  onApply: jest.fn(),
};

describe('SubscriberMoreFilters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
  });

  it('expone divulgación progresiva asociada a Estado, Tipo, Segmento y Estrato', async () => {
    const user = userEvent.setup();
    const onExpandedChange = jest.fn();
    render(<SubscriberMoreFilters {...baseProps} onExpandedChange={onExpandedChange} />);

    const toggle = screen.getByRole('button', { name: 'Más filtros' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(onExpandedChange).toHaveBeenCalledWith(true);
  });

  it('muestra los filtros seleccionados y permite retirar uno o limpiar varios', () => {
    const onRemoveFilter = jest.fn();
    const onClearFilters = jest.fn();
    render(
      <SubscriberMoreFilters
        {...baseProps}
        expanded
        status={SubscriberStatus.ACTIVE}
        personType={PersonType.NATURAL}
        segment={CustomerSegment.RESIDENTIAL}
        stratum="3"
        activeFilters={[
          { key: 'status', label: 'Estado', value: 'Activo' },
          { key: 'personType', label: 'Tipo de persona', value: 'Persona natural' },
          { key: 'stratum', label: 'Estrato', value: 'Estrato 3' },
        ]}
        onRemoveFilter={onRemoveFilter}
        onClearFilters={onClearFilters}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Quitar filtro: Estado: Activo' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar filtro: Estado: Activo' }));
    expect(onRemoveFilter).toHaveBeenCalledWith('status');
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it('envía el valor elegido en cada filtro expandido', async () => {
    const user = userEvent.setup();
    const onStatusChange = jest.fn();
    const onPersonTypeChange = jest.fn();
    const onSegmentChange = jest.fn();
    const onStratumChange = jest.fn();
    const onExpandedChange = jest.fn();

    render(
      <SubscriberMoreFilters
        {...baseProps}
        expanded
        onExpandedChange={onExpandedChange}
        onStatusChange={onStatusChange}
        onPersonTypeChange={onPersonTypeChange}
        onSegmentChange={onSegmentChange}
        onStratumChange={onStratumChange}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Estado' }));
    await user.click(screen.getByRole('option', { name: 'Suspendido' }));
    await user.click(screen.getByRole('combobox', { name: 'Tipo de persona' }));
    await user.click(screen.getByRole('option', { name: 'Persona jurídica' }));
    await user.click(screen.getByRole('combobox', { name: 'Segmento' }));
    await user.click(screen.getByRole('option', { name: 'PyME' }));
    await user.click(screen.getByRole('combobox', { name: 'Estrato' }));
    await user.click(screen.getByRole('option', { name: 'Estrato 4' }));

    expect(onStatusChange).toHaveBeenCalledWith(SubscriberStatus.SUSPENDED);
    expect(onPersonTypeChange).toHaveBeenCalledWith(PersonType.JURIDICA);
    expect(onSegmentChange).toHaveBeenCalledWith(CustomerSegment.PYME);
    expect(onStratumChange).toHaveBeenCalledWith('4');

    await user.click(screen.getByRole('button', { name: 'Más filtros' }));
    expect(onExpandedChange).toHaveBeenCalledWith(false);
  });

  it('permite retirar un filtro activo sin ofrecer limpiar varios', async () => {
    const user = userEvent.setup();
    const onRemoveFilter = jest.fn();
    render(
      <SubscriberMoreFilters
        {...baseProps}
        activeFilters={[{ key: 'status', label: 'Estado', value: 'Activo' }]}
        onRemoveFilter={onRemoveFilter}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Quitar filtro: Estado: Activo' }));
    expect(onRemoveFilter).toHaveBeenCalledWith('status');
  });

  it('abre el panel móvil modal, contiene el foco y lo devuelve al cerrar', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
    const user = userEvent.setup();
    render(<SubscriberMoreFilters {...baseProps} />);

    const trigger = screen.getByRole('button', { name: 'Más filtros' });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Más filtros' });

    expect(dialog).toHaveClass('max-md:fixed', 'max-md:h-dvh', 'max-md:overflow-hidden');
    expect(within(dialog).getByRole('button', { name: 'Cerrar filtros' })).toBeInTheDocument();
    expect(within(dialog).getByRole('combobox', { name: 'Ordenar por' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Aplicar' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Limpiar' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(baseProps.onApply).not.toHaveBeenCalled();
  });

  it('aplica una sola vez los filtros y el orden móvil como borrador', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
    const user = userEvent.setup();
    const onApply = jest.fn();
    const onStatusChange = jest.fn();
    const onExpandedChange = jest.fn();
    render(
      <SubscriberMoreFilters
        {...baseProps}
        onApply={onApply}
        onStatusChange={onStatusChange}
        onExpandedChange={onExpandedChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Más filtros' }));
    const dialog = screen.getByRole('dialog', { name: 'Más filtros' });
    await user.click(within(dialog).getByRole('combobox', { name: 'Estado' }));
    await user.click(screen.getByRole('option', { name: 'Suspendido' }));
    await user.click(within(dialog).getByRole('combobox', { name: 'Ordenar por' }));
    await user.click(screen.getByRole('option', { name: 'Nombre · descendente' }));

    expect(onStatusChange).not.toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Aplicar' }));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith({
      status: SubscriberStatus.SUSPENDED,
      personType: '',
      segment: '',
      stratum: '',
      sortValue: 'name:desc',
    });
    expect(onExpandedChange).toHaveBeenLastCalledWith(false);
  });

  it('limpia únicamente el borrador móvil y espera Aplicar para confirmarlo', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
    const user = userEvent.setup();
    const onApply = jest.fn();
    render(
      <SubscriberMoreFilters
        {...baseProps}
        status={SubscriberStatus.ACTIVE}
        personType={PersonType.NATURAL}
        segment={CustomerSegment.RESIDENTIAL}
        stratum="3"
        activeFilters={[
          { key: 'status', label: 'Estado', value: 'Activo' },
          { key: 'personType', label: 'Tipo de persona', value: 'Persona natural' },
        ]}
        onApply={onApply}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Más filtros' }));
    const dialog = screen.getByRole('dialog', { name: 'Más filtros' });
    await user.click(within(dialog).getByRole('button', { name: 'Limpiar' }));

    expect(within(dialog).getByRole('combobox', { name: 'Estado' })).toHaveTextContent(
      'Todos los estados',
    );
    expect(within(dialog).getByRole('combobox', { name: 'Ordenar por' })).toHaveTextContent(
      'Orden por defecto',
    );
    expect(onApply).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: /Quitar filtro: Estado: Activo/ }),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Aplicar' }));
    expect(onApply).toHaveBeenCalledWith({
      status: '',
      personType: '',
      segment: '',
      stratum: '',
      sortValue: '',
    });
  });

  it('omite el orden móvil cuando el servidor no declara campos ordenables', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
    const user = userEvent.setup();
    render(<SubscriberMoreFilters {...baseProps} showSort={false} sortOptions={[]} />);

    await user.click(screen.getByRole('button', { name: 'Más filtros' }));
    const dialog = screen.getByRole('dialog', { name: 'Más filtros' });
    expect(within(dialog).queryByRole('combobox', { name: 'Ordenar por' })).not.toBeInTheDocument();
  });
});
