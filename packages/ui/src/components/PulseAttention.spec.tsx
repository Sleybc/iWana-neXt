/** @jest-environment jsdom */
import { act } from 'react';
import type { ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PulseStrip, type PulseCellData, type PulseDeltaTone } from './PulseStrip';
import { AttentionQueue, type AttentionQueueProps, type AttentionRow } from './AttentionQueue';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const mount = (element: ReactElement) => act(() => root.render(element));
const text = () => container.textContent ?? '';
const buttonByText = (label: string) =>
  Array.from(container.querySelectorAll('button')).find((b) => b.textContent === label);
const click = (element: Element | undefined) =>
  act(() => (element as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })));

const PULSE_LABELS = {
  unavailable: 'No disponible',
  noData: 'Sin dato disponible',
  retry: 'Reintentar',
  updating: 'Actualizando',
};

const cell = (overrides: Partial<PulseCellData> = {}): PulseCellData => ({
  id: 'c1',
  label: 'Empresas activas',
  value: 1234,
  state: 'idle',
  ...overrides,
});

const strip = (cells: PulseCellData[], loading = false) =>
  mount(<PulseStrip cells={cells} loading={loading} ariaLabel="Pulso" labels={PULSE_LABELS} />);

describe('PulseStrip (contrato DS v1.3 §7bis.2)', () => {
  it('idle: cifra con Intl es-CO en un article sin acción', () => {
    strip([cell()]);
    const section = container.querySelector('section[aria-label="Pulso"]');
    expect(section?.hasAttribute('aria-busy')).toBe(false);
    expect(text()).toContain('1.234');
    expect(container.querySelector('article')).not.toBeNull();
    expect(section?.className).toContain('xl:grid-cols-1');
  });

  it('loading de franja: aria-busy y ninguna cifra', () => {
    strip([cell()], true);
    expect(container.querySelector('section')?.getAttribute('aria-busy')).toBe('true');
    expect(text()).not.toContain('1.234');
  });

  it('loading de celda: sin rótulo ni cifra', () => {
    strip([cell({ state: 'loading' })]);
    expect(text()).toBe('');
  });

  it('value null: «Sin dato disponible», nunca 0', () => {
    strip([cell({ value: null, href: '/x' })]);
    expect(text()).toContain('Sin dato disponible');
    expect(text()).not.toMatch(/\b0\b/);
  });

  it('error con onRetry: no es enlace, oculta señal y frase, y reintenta', () => {
    const onRetry = jest.fn();
    strip([
      cell({
        state: 'error',
        href: '/x',
        hint: 'Frase',
        delta: { label: '+3', tone: 'progress' },
        onRetry,
      }),
    ]);
    expect(text()).toContain('No disponible');
    expect(container.querySelector('a')).toBeNull();
    expect(text()).not.toContain('Frase');
    expect(text()).not.toContain('+3');
    click(buttonByText('Reintentar'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('error sin onRetry: sin botón', () => {
    strip([cell({ state: 'error' })]);
    expect(container.querySelector('button')).toBeNull();
  });

  it('updating: aviso accesible y conserva la cifra', () => {
    strip([cell({ updating: true })]);
    const live = container.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toBe('Actualizando');
    expect(text()).toContain('1.234');
  });

  it('href usa linkComponent con el rótulo como nombre; onClick es botón', () => {
    const onClick = jest.fn();
    const LinkStub = (props: Record<string, unknown>) => <a data-stub="1" {...props} />;
    mount(
      <PulseStrip
        ariaLabel="Pulso"
        labels={PULSE_LABELS}
        linkComponent={LinkStub}
        cells={[cell({ href: '/a' }), cell({ id: 'c2', label: 'Atención', onClick })]}
      />,
    );
    const link = container.querySelector('a');
    expect(link?.getAttribute('data-stub')).toBe('1');
    expect(link?.getAttribute('aria-label')).toBe('Empresas activas');
    expect(link?.getAttribute('href')).toBe('/a');
    const button = container.querySelector('button[aria-label="Atención"]');
    click(button ?? undefined);
    expect(onClick).toHaveBeenCalled();
  });

  it.each<[PulseDeltaTone, string]>([
    ['progress', 'bg-iwana-secondary-100'],
    ['neutral', 'bg-gray-100'],
    ['primary', 'bg-iwana-primary-100'],
    ['success', 'bg-success-50'],
    ['warning', 'bg-warning-50'],
    ['error', 'bg-error-50'],
  ])('señal %s → variante de Badge', (tone, className) => {
    strip([cell({ delta: { label: 'Señal', tone } })]);
    // El Badge es el span más interno con el texto (lo envuelve un span de maquetación).
    const badge = Array.from(container.querySelectorAll('span'))
      .filter((s) => s.textContent === 'Señal')
      .at(-1);
    expect(badge?.className).toContain(className);
  });

  it('sin celdas no renderiza', () => {
    strip([]);
    expect(container.innerHTML).toBe('');
  });
});

const QUEUE_LABELS: AttentionQueueProps['labels'] = {
  severity: { 'at-risk': 'En riesgo', attention: 'Atención' },
  partial: 'No pudimos revisar todo.',
  retry: 'Reintentar',
  allClear: 'Todo al día',
  allClearHint: 'Nada pendiente.',
  showMore: (hidden) => `Ver los ${hidden} restantes`,
  showLess: 'Ver menos',
};

const row = (index: number, severity: AttentionRow['severity'] = 'attention'): AttentionRow => ({
  id: `r${index}`,
  severity,
  title: `Fila ${index}`,
  area: 'Empresas',
  href: `/r/${index}`,
});

const queue = (props: Partial<AttentionQueueProps> = {}) =>
  mount(
    <AttentionQueue
      state="ready"
      rows={[]}
      title="Requiere tu atención"
      labels={QUEUE_LABELS}
      {...props}
    />,
  );

describe('AttentionQueue (contrato DS v1.3 §7bis.3)', () => {
  it('loading: título, aria-busy y sin vacío', () => {
    queue({ state: 'loading' });
    expect(container.querySelector('h2')?.textContent).toBe('Requiere tu atención');
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(text()).not.toContain('Todo al día');
  });

  it('vacío: «Todo al día» con su frase y sin contador', () => {
    queue();
    expect(text()).toContain('Todo al día');
    expect(text()).toContain('Nada pendiente.');
    expect(container.querySelector('ul')).toBeNull();
  });

  it('parcial con 0 filas: aviso con reintento y sin vacío', () => {
    const onRetry = jest.fn();
    queue({ partial: true, onRetry });
    expect(text()).toContain('No pudimos revisar todo.');
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
    expect(text()).not.toContain('Todo al día');
    click(buttonByText('Reintentar'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('parcial con filas: aviso y filas visibles', () => {
    queue({ partial: true, rows: [row(1, 'at-risk')] });
    expect(text()).toContain('No pudimos revisar todo.');
    const link = container.querySelector('a');
    expect(link?.getAttribute('aria-label')).toBe('En riesgo: Fila 1. Empresas');
    expect(link?.getAttribute('href')).toBe('/r/1');
  });

  it('7 filas: 6 visibles, contador 7 y expandir/contraer', () => {
    queue({ rows: Array.from({ length: 7 }, (_, i) => row(i + 1)) });
    expect(container.querySelectorAll('a')).toHaveLength(6);
    expect(text()).toContain('7');

    const toggle = buttonByText('Ver los 1 restantes');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    click(toggle);
    expect(container.querySelectorAll('a')).toHaveLength(7);
    click(buttonByText('Ver menos'));
    expect(container.querySelectorAll('a')).toHaveLength(6);
  });

  it('severidad: at-risk en tono error y attention en warning, sin amber', () => {
    queue({ rows: [row(1, 'at-risk'), row(2)] });
    const [risk, attention] = Array.from(container.querySelectorAll('a'));
    expect(risk?.querySelector('span')?.className).toContain('bg-error-50');
    expect(attention?.querySelector('span')?.className).toContain('bg-warning-50');
    expect(container.innerHTML).not.toMatch(/amber-/);
  });
});
