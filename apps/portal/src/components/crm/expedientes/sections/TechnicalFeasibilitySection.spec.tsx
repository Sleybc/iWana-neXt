import userEvent from '@testing-library/user-event';
import { act, render, screen, waitFor } from '@testing-library/react';
import { TechnicalFeasibilitySection } from './TechnicalFeasibilitySection';

const mockTileListeners: Record<string, () => void> = {};
const mockMap = {
  getContainer: jest.fn(),
  setView: jest.fn(),
  flyTo: jest.fn(),
  invalidateSize: jest.fn(),
  remove: jest.fn(),
};
const mockMarker = {
  remove: jest.fn(),
  addTo: jest.fn(() => undefined),
};
const mockTileLayer = {
  on: jest.fn((event: string, handler: () => void) => {
    mockTileListeners[event] = handler;
  }),
  off: jest.fn(),
  addTo: jest.fn(() => undefined),
};
const mockLeafletMap = jest.fn((container: HTMLDivElement) => {
  mockMap.getContainer.mockReturnValue(container);
  return mockMap;
});

jest.mock('leaflet', () => ({
  map: mockLeafletMap,
  tileLayer: jest.fn(() => mockTileLayer),
  circleMarker: jest.fn(() => mockMarker),
}));

function renderSection(overrides: Record<string, string> = {}) {
  return render(
    <TechnicalFeasibilitySection
      draftValues={overrides}
      onChange={jest.fn()}
      onCandidateTechnologyToggle={jest.fn()}
      saving={false}
      onSave={jest.fn()}
    />,
  );
}

describe('TechnicalFeasibilitySection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockTileListeners).forEach((event) => delete mockTileListeners[event]);
  });

  it('muestra un estado vacío comprensible sin coordenadas', () => {
    renderSection();

    expect(
      screen.getByText('Ingresa latitud y longitud para visualizar la ubicación.'),
    ).toBeInTheDocument();
    expect(mockLeafletMap).not.toHaveBeenCalled();
  });

  it('muestra el estado de coordenadas inválidas sin intentar crear el mapa', () => {
    renderSection({ latitude: '91', longitude: '-74' });

    expect(
      screen.getByText('La latitud debe estar entre -90 y 90 y la longitud entre -180 y 180.'),
    ).toBeInTheDocument();
    expect(mockLeafletMap).not.toHaveBeenCalled();
  });

  it('muestra carga y error recuperable cuando fallan las teselas', async () => {
    renderSection({ latitude: '4.581430', longitude: '-74.447581' });

    await waitFor(() => expect(mockLeafletMap).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Cargando el mapa…')).toBeInTheDocument();

    await act(async () => {
      mockTileListeners.tileerror?.();
    });
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar el mapa'),
    );
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(mockLeafletMap).toHaveBeenCalledTimes(2));
  });

  it('renderiza las alternativas como checkboxes operables por teclado', async () => {
    const user = userEvent.setup();
    const onToggle = jest.fn();

    render(
      <TechnicalFeasibilitySection
        draftValues={{}}
        onChange={jest.fn()}
        onCandidateTechnologyToggle={onToggle}
        saving={false}
        onSave={jest.fn()}
      />,
    );

    const checkbox = screen.getByRole('checkbox', { name: 'Fibra óptica' });
    checkbox.focus();
    await user.keyboard(' ');

    expect(onToggle).toHaveBeenCalledWith('FIBER', true);
  });

  it('muestra el contador lima cuando hay opciones y permite marcar la recomendada', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();

    render(
      <TechnicalFeasibilitySection
        draftValues={{ candidateTechnologies: 'FIBER,RADIO', availableTechnology: 'FIBER' }}
        onChange={onChange}
        onCandidateTechnologyToggle={jest.fn()}
        saving={false}
        onSave={jest.fn()}
      />,
    );

    expect(screen.getByText('Opciones viables', { exact: true })).toHaveClass('portal-eyebrow');
    expect(screen.getByText('2 opciones')).toHaveClass('bg-iwana-secondary-100');
    expect(
      screen.getByRole('button', { name: 'Fibra óptica: opción principal recomendada' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await user.click(
      screen.getByRole('button', {
        name: 'Marcar Radio enlace como opción principal recomendada',
      }),
    );
    expect(onChange).toHaveBeenCalledWith('availableTechnology', 'RADIO');
  });

  it('muestra contador neutral sin opciones seleccionadas', () => {
    renderSection();

    expect(screen.getByText('0 opciones')).toHaveClass('bg-gray-100');
    expect(screen.queryByRole('combobox', { name: 'Opción principal' })).not.toBeInTheDocument();
  });

  it('muestra las tecnologías seleccionadas como chips con estrella', () => {
    render(
      <TechnicalFeasibilitySection
        draftValues={{ candidateTechnologies: 'FIBER,RADIO', availableTechnology: 'RADIO' }}
        onChange={jest.fn()}
        onCandidateTechnologyToggle={jest.fn()}
        saving={false}
        onSave={jest.fn()}
      />,
    );

    expect(screen.getByText('2 opciones')).toHaveClass('bg-iwana-secondary-100');
    expect(screen.getByRole('checkbox', { name: 'Fibra óptica' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Radio enlace' })).toBeChecked();
    expect(
      screen.getByRole('button', { name: 'Radio enlace: opción principal recomendada' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Marcar Fibra óptica como opción principal recomendada',
      }),
    ).toBeInTheDocument();
  });

  it('muestra la opción principal recomendada con estrella activa', () => {
    renderSection({ candidateTechnologies: 'FIBER', availableTechnology: 'FIBER' });

    expect(screen.getByText('1 opción')).toHaveClass('bg-iwana-secondary-100');
    expect(screen.getByRole('checkbox', { name: 'Fibra óptica' })).toBeChecked();
    expect(
      screen.getByRole('button', { name: 'Fibra óptica: opción principal recomendada' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('combobox', { name: 'Opción principal' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('muestra el mapa antes de las opciones técnicas', () => {
    renderSection({ latitude: '4.581430', longitude: '-74.447581' });

    const map = screen.getByRole('region', { name: 'Mapa de ubicación técnica' });
    const optionsHeading = screen.getByText('Opciones viables', { exact: true });

    expect(map.compareDocumentPosition(optionsHeading)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('muestra el copy de cobertura y justificación cuando la decisión lo requiere', () => {
    renderSection({ feasibility: 'NOT_VIABLE' });

    expect(screen.getByLabelText('Resultado de cobertura')).toBeInTheDocument();
    expect(screen.getByLabelText('Justificación técnica')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Explica brevemente la razón de la decisión técnica.'),
    ).toBeInTheDocument();
  });
});
