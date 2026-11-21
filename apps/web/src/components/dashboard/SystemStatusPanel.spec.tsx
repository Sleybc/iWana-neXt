import { render, screen, within } from '@testing-library/react';
import { SystemStatusPanel, type StatusIndicator } from './SystemStatusPanel';

const FOUR_LEVELS: StatusIndicator[] = [
  { label: 'API', status: 'ok', detail: 'Responde con normalidad.' },
  { label: 'Base de datos', status: 'warning' },
  { label: 'Cola de eventos', status: 'error', detail: 'Sin conexión.' },
  { label: 'Relay', status: 'unknown' },
];

function indicatorCard(label: string): HTMLElement {
  const card = screen.getByText(label, { exact: true }).parentElement;
  if (!card) throw new Error(`Sin tarjeta para ${label}`);
  return card;
}

describe('SystemStatusPanel', () => {
  it('muestra la etiqueta de cada uno de los cuatro niveles junto a su indicador', () => {
    render(<SystemStatusPanel indicators={FOUR_LEVELS} />);

    expect(within(indicatorCard('API')).getByText('Operativo')).toBeInTheDocument();
    expect(within(indicatorCard('Base de datos')).getByText('Degradado')).toBeInTheDocument();
    expect(within(indicatorCard('Cola de eventos')).getByText('Error')).toBeInTheDocument();
    expect(within(indicatorCard('Relay')).getByText('Desconocido')).toBeInTheDocument();
  });

  it('muestra el detalle solo cuando el indicador lo trae', () => {
    render(<SystemStatusPanel indicators={FOUR_LEVELS} />);

    expect(within(indicatorCard('API')).getByText('Responde con normalidad.')).toBeInTheDocument();
    // Relay sin detalle: solo el párrafo del nombre; API: nombre y detalle.
    expect(indicatorCard('Relay').querySelectorAll('p')).toHaveLength(1);
    expect(indicatorCard('API').querySelectorAll('p')).toHaveLength(2);
  });

  it('con salud parcial distingue los servicios caídos de los operativos', () => {
    render(
      <SystemStatusPanel
        summary="Hay servicios con incidencias."
        indicators={[
          { label: 'API', status: 'ok' },
          { label: 'Base de datos', status: 'error', detail: 'Sin respuesta.' },
          { label: 'Redis', status: 'ok' },
        ]}
      />,
    );

    expect(screen.getByText('Hay servicios con incidencias.')).toBeInTheDocument();
    expect(screen.getAllByText('Operativo')).toHaveLength(2);
    expect(within(indicatorCard('Base de datos')).getByText('Error')).toBeInTheDocument();
    expect(screen.queryByText('Degradado')).not.toBeInTheDocument();
  });

  it('usa el título por defecto y acepta uno propio', () => {
    const { rerender } = render(<SystemStatusPanel indicators={[]} />);
    expect(screen.getByRole('heading', { name: 'Salud de plataforma' })).toBeInTheDocument();

    rerender(<SystemStatusPanel indicators={[]} title="Servicios" />);
    expect(screen.getByRole('heading', { name: 'Servicios' })).toBeInTheDocument();
  });

  describe('formatLastChecked (última lectura)', () => {
    it.each([
      ['ausente', undefined],
      ['nula', null],
      ['vacía', ''],
      ['inválida', 'no-es-fecha'],
    ])('muestra «Pendiente» con una fecha %s', (_caso, value) => {
      render(
        value === undefined ? (
          <SystemStatusPanel indicators={[]} />
        ) : (
          <SystemStatusPanel indicators={[]} lastCheckedAt={value} />
        ),
      );
      expect(screen.getByText('Pendiente')).toBeInTheDocument();
    });

    it('formatea una fecha válida en es-CO con fecha media y hora corta', () => {
      const iso = '2026-11-21T15:30:00.000Z';
      const expected = new Intl.DateTimeFormat('es-CO', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(iso));

      render(<SystemStatusPanel indicators={[]} lastCheckedAt={iso} />);

      expect(screen.getByText(expected)).toBeInTheDocument();
      expect(screen.queryByText('Pendiente')).not.toBeInTheDocument();
    });
  });

  it('en carga muestra cuatro marcadores y ningún indicador', () => {
    const { container } = render(<SystemStatusPanel indicators={FOUR_LEVELS} isLoading />);

    expect(screen.queryByText('API')).not.toBeInTheDocument();
    expect(screen.queryByText('Operativo')).not.toBeInTheDocument();
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(4);
  });
});
