/** @jest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Chart, isChartDataEmpty, type ChartProps } from './Chart';
import { barSeries, baseProps, type Key } from './__fixtures__/chart.fixture';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Chart (marco)', () => {
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

  function render(props: ChartProps<Key>) {
    act(() => root.render(<Chart {...props} />));
  }

  it('en vista gráfica expone role="img" con el summary como aria-label y la leyenda con el último valor', () => {
    render(baseProps());
    const body = container.querySelector('[role="img"]');
    expect(body?.getAttribute('aria-label')).toBe(
      'Altas y retiros de suscriptores por mes. En noviembre: 61 altas.',
    );
    expect((body as HTMLElement).style.height).toBe('240px');
    expect(container.querySelector('[data-testid="plot"]')?.getAttribute('data-height')).toBe(
      '240',
    );
    const legend = container.querySelector('ul')?.textContent ?? '';
    expect(legend).toContain('Altas');
    expect(legend).toContain('61 u');
    expect(legend).toContain('Sin dato');
    expect(container.querySelectorAll('ul svg[aria-hidden="true"]')).toHaveLength(2);
  });

  it('aplica el alto mínimo de 160 px', () => {
    render(baseProps({ height: 100 }));
    expect((container.querySelector('[role="img"]') as HTMLElement).style.height).toBe('160px');
  });

  it('conmuta gráfica ↔ tabla con un botón nativo, aria-controls estable y el foco en el botón', () => {
    render(baseProps());
    const button = container.querySelector('button') as HTMLButtonElement;
    expect(button.getAttribute('type')).toBe('button');
    expect(button.textContent).toBe('Ver como tabla');
    expect(button.hasAttribute('aria-pressed')).toBe(false);
    const controlled = button.getAttribute('aria-controls') as string;
    expect(document.getElementById(controlled)?.getAttribute('role')).toBe('img');

    button.focus();
    act(() => button.click());

    expect(button.textContent).toBe('Ver como gráfica');
    expect(document.activeElement).toBe(button);
    expect(document.getElementById(controlled)?.querySelector('table')).not.toBeNull();
    expect(container.querySelector('[role="img"]')).toBeNull();

    act(() => button.click());
    expect(button.textContent).toBe('Ver como tabla');
    expect(container.querySelector('[role="img"]')).not.toBeNull();
  });

  it('la tabla alternativa lleva caption, th con scope y valores formateados; null → «Sin dato»', () => {
    render(baseProps({ defaultView: 'table' }));
    const table = container.querySelector('table') as HTMLTableElement;
    expect(table.querySelector('caption')?.textContent).toBe('Altas y retiros por mes');
    const headers = Array.from(table.querySelectorAll('thead th')).map((th) => [
      th.getAttribute('scope'),
      th.textContent,
    ]);
    expect(headers).toEqual([
      ['col', 'Mes'],
      ['col', 'Altas'],
      ['col', 'Retiros'],
    ]);
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    expect(rows[1]?.querySelector('th')?.getAttribute('scope')).toBe('row');
    expect(rows[1]?.querySelector('th')?.textContent).toBe('noviembre de 2026 (en curso)');
    expect(Array.from(rows[1]?.querySelectorAll('td') ?? []).map((td) => td.textContent)).toEqual([
      '61 u',
      'Sin dato',
    ]);
    expect(table.closest('.iwana-scroll-inset')).not.toBeNull();
  });

  it('loading: skeleton a la misma altura con aria-busy y texto para lectores; sin conmutador', () => {
    render(baseProps({ status: 'loading', height: 200 }));
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.textContent).toContain('Cargando gráfica');
    expect((container.querySelector('figure > div') as HTMLElement).style.height).toBe('200px');
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('[data-testid="plot"]')).toBeNull();
  });

  it('empty: por status, por data sin puntos y por todos los valores null; con emptyAction', () => {
    render(baseProps({ status: 'empty', emptyAction: <a href="/x">Ir</a> }));
    expect(container.textContent).toContain('Sin datos en el periodo');
    expect(container.querySelector('a')?.textContent).toBe('Ir');
    expect(container.querySelector('[role="img"]')).toBeNull();

    render(baseProps({ data: [] }));
    expect(container.textContent).toContain('Sin datos en el periodo');

    render(
      baseProps({
        data: [{ x: '2026-11', altas: null, retiros: null }],
        emptyLabel: 'Sin movimientos',
      }),
    );
    expect(container.textContent).toContain('Sin movimientos');
    expect(container.querySelector('button')).toBeNull();
  });

  it('una serie toda en 0 no es vacía: se pinta', () => {
    const zeros = [
      { x: '2026-10', altas: 0, retiros: 0 },
      { x: '2026-11', altas: 0, retiros: 0 },
    ];
    expect(isChartDataEmpty(zeros, barSeries)).toBe(false);
    render(baseProps({ data: zeros }));
    expect(container.querySelector('[data-testid="plot"]')).not.toBeNull();
  });

  it('error: mensaje y Reintentar solo con onRetry', () => {
    const onRetry = jest.fn();
    render(baseProps({ status: 'error', onRetry }));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'No se pudo cargar la gráfica',
    );
    const retry = container.querySelector('button') as HTMLButtonElement;
    expect(retry.textContent).toBe('Reintentar');
    act(() => retry.click());
    expect(onRetry).toHaveBeenCalledTimes(1);

    render(baseProps({ status: 'error' }));
    expect(container.textContent).toContain('No se pudo cargar la gráfica');
    expect(container.querySelector('button')).toBeNull();
  });

  it('fallo del chunk: pasa a la tabla y oculta el conmutador', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    function BrokenPlot(): never {
      throw new Error('ChunkLoadError');
    }
    render(baseProps({ Plot: BrokenPlot }));
    expect(container.querySelector('table')).not.toBeNull();
    expect(container.querySelector('[role="img"]')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
    consoleError.mockRestore();
  });

  it('updating: conserva los datos y anuncia «Actualizando» en una región aria-live', () => {
    render(baseProps());
    const live = container.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(live.textContent).toBe('');
    render(baseProps({ updating: true }));
    expect(container.querySelector('[aria-live="polite"]')).toBe(live);
    expect(live.textContent).toBe('Actualizando');
    expect(container.querySelector('[data-testid="plot"]')).not.toBeNull();
  });
});
