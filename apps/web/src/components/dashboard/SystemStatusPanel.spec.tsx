import { fireEvent, render, screen, within } from '@testing-library/react';
import { SYSTEM_STATUS_LABELS, SystemStatusPanel, type StatusIndicator } from './SystemStatusPanel';

// Contrato DS 2026-11-21 §4: título, eyebrow, vacío y rótulos llegan por prop.
const BASE = {
  title: 'Salud de plataforma',
  eyebrow: 'Monitoreo',
  emptyMessage: 'Sin lectura directa todavía.',
  statusLabels: SYSTEM_STATUS_LABELS,
};

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
    render(<SystemStatusPanel {...BASE} indicators={FOUR_LEVELS} />);

    expect(within(indicatorCard('API')).getByText('Operativo')).toBeInTheDocument();
    expect(within(indicatorCard('Base de datos')).getByText('Degradado')).toBeInTheDocument();
    expect(within(indicatorCard('Cola de eventos')).getByText('Error')).toBeInTheDocument();
    expect(within(indicatorCard('Relay')).getByText('Desconocido')).toBeInTheDocument();
  });

  it('muestra el detalle solo cuando el indicador lo trae', () => {
    render(<SystemStatusPanel {...BASE} indicators={FOUR_LEVELS} />);

    expect(within(indicatorCard('API')).getByText('Responde con normalidad.')).toBeInTheDocument();
    // Relay sin detalle: solo el párrafo del nombre; API: nombre y detalle.
    expect(indicatorCard('Relay').querySelectorAll('p')).toHaveLength(1);
    expect(indicatorCard('API').querySelectorAll('p')).toHaveLength(2);
  });

  it('con salud parcial distingue los servicios caídos de los operativos', () => {
    render(
      <SystemStatusPanel
        {...BASE}
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

  it('muestra el título y el eyebrow que recibe', () => {
    render(<SystemStatusPanel {...BASE} indicators={[]} title="Servicios" eyebrow="Red" />);
    expect(screen.getByRole('heading', { name: 'Servicios' })).toBeInTheDocument();
    expect(screen.getByText('Red')).toHaveClass('portal-eyebrow');
  });

  it('sin indicadores ni error muestra el vacío del catálogo', () => {
    render(<SystemStatusPanel {...BASE} indicators={[]} />);
    expect(screen.getByText('Sin lectura directa todavía.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('con error muestra la alerta, conserva la cabecera y reintenta', () => {
    const onRetry = jest.fn();
    render(
      <SystemStatusPanel
        {...BASE}
        indicators={FOUR_LEVELS}
        error="No pudimos validar la plataforma."
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos validar la plataforma.');
    expect(screen.getByRole('heading', { name: 'Salud de plataforma' })).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    expect(screen.queryByText('API')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('§8.4 (v1.2): error con negocio visible — un solo ErrorState y el mensaje una vez', () => {
    const error = 'No pudimos validar la plataforma.';
    render(
      <SystemStatusPanel
        {...BASE}
        summary={error}
        error={error}
        onRetry={() => {}}
        indicators={[
          { label: 'API', status: 'unknown' },
          {
            kind: 'business',
            label: 'Atención operativa',
            status: 'warning',
            detail: '2 empresas.',
          },
        ]}
      />,
    );
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getAllByText(error)).toHaveLength(1);
    expect(screen.queryByText('API')).not.toBeInTheDocument();
    expect(indicatorCard('Atención operativa')).toHaveAttribute('data-tone', 'warning');
  });

  it('v1.2: negocio sin dato se pinta en neutro, no hereda el error', () => {
    render(
      <SystemStatusPanel
        {...BASE}
        error="Falló."
        indicators={[{ kind: 'business', label: 'Atención operativa', status: 'unknown' }]}
      />,
    );
    expect(indicatorCard('Atención operativa')).toHaveAttribute('data-tone', 'neutral');
  });

  it('pinta cada nivel con su tono del DS y un indicador desconocido en neutro', () => {
    render(<SystemStatusPanel {...BASE} indicators={FOUR_LEVELS} />);
    expect(indicatorCard('API')).toHaveAttribute('data-tone', 'success');
    expect(indicatorCard('Base de datos')).toHaveAttribute('data-tone', 'warning');
    expect(indicatorCard('Cola de eventos')).toHaveAttribute('data-tone', 'error');
    expect(indicatorCard('Relay')).toHaveAttribute('data-tone', 'neutral');
    expect(indicatorCard('Base de datos').className).toContain('dark:bg-warning-500/15');
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
          <SystemStatusPanel {...BASE} indicators={[]} />
        ) : (
          <SystemStatusPanel {...BASE} indicators={[]} lastCheckedAt={value} />
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

      render(<SystemStatusPanel {...BASE} indicators={[]} lastCheckedAt={iso} />);

      expect(screen.getByText(expected)).toBeInTheDocument();
      expect(screen.queryByText('Pendiente')).not.toBeInTheDocument();
    });
  });

  it('en carga muestra cuatro marcadores y ningún indicador', () => {
    const { container } = render(
      <SystemStatusPanel {...BASE} indicators={FOUR_LEVELS} isLoading error="Falló." />,
    );

    expect(screen.queryByText('API')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByText('Operativo')).not.toBeInTheDocument();
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(4);
  });
});
