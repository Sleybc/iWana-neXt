import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, jest } from '@jest/globals';
import { Chart, ChartSkeleton, type BarSeries, type ChartProps, type LineSeries } from './Chart';
import { baseProps, type Key } from './__fixtures__/chart.fixture';

describe('Chart (render en servidor)', () => {
  it('rechaza en desarrollo series fuera de contrato', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() =>
      renderToStaticMarkup(
        <Chart
          {...baseProps({
            series: [
              { key: 'altas', label: 'A', token: 'chart-1', mark: 'solid' },
              { key: 'retiros', label: 'B', token: 'chart-1', mark: 'outline' },
            ],
          })}
        />,
      ),
    ).toThrow('token');
    expect(() => renderToStaticMarkup(<Chart {...baseProps({ series: [] })} />)).toThrow('1 a 4');
    consoleError.mockRestore();
  });

  it('el marco se renderiza en servidor con la gráfica de línea y la muestra discontinua', () => {
    const lineSeries: readonly LineSeries<Key>[] = [
      { key: 'altas', label: 'Creados', token: 'chart-1', mark: 'solid' },
      { key: 'retiros', label: 'Resueltos', token: 'chart-2', progress: true, mark: 'dashed' },
    ];
    const html = renderToStaticMarkup(
      <Chart {...baseProps({ kind: 'line', series: lineSeries } as Partial<ChartProps<Key>>)} />,
    );
    expect(html).toContain('role="img"');
    expect(html).toContain('stroke-dasharray="5 4"');
    expect(html).toContain('var(--chart-2)');
    expect(html).toContain('Ver como tabla');
  });

  it('ChartSkeleton dibuja barras o línea y anuncia la carga', () => {
    const bars = renderToStaticMarkup(<ChartSkeleton />);
    expect(bars).toContain('aria-busy="true"');
    expect(bars).toContain('Cargando gráfica');
    expect(bars.match(/rounded-t-\[3px\]/g)).toHaveLength(6);
    expect(renderToStaticMarkup(<ChartSkeleton kind="line" />)).toContain('<polyline');
  });
});

describe('ChartColor (tipo)', () => {
  it('el lima exige progress: true', () => {
    // @ts-expect-error chart-2 sin `progress: true` no compila (CA-PA-03).
    const lime: BarSeries<'a'> = { key: 'a', label: 'A', token: 'chart-2', mark: 'solid' };
    // @ts-expect-error `progress: true` solo vale para chart-2.
    const notLime: BarSeries<'a'> = {
      key: 'a',
      label: 'A',
      token: 'chart-1',
      progress: true,
      mark: 'solid',
    };
    expect([lime, notLime]).toHaveLength(2);
  });
});
