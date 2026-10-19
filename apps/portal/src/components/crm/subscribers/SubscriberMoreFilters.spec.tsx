import { fireEvent, render, screen } from '@testing-library/react';
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
};

describe('SubscriberMoreFilters', () => {
  beforeEach(() => jest.clearAllMocks());

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
});
