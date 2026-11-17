/** @jest-environment jsdom */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from '@jest/globals';
import { ChartPlot } from './index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('ChartPlot (entrada @iwana/ui/chart)', () => {
  it('monta barras y líneas con Recharts sin lanzar y aplica el lienzo con alto fijo', () => {
    for (const kind of ['grouped-bar', 'line'] as const) {
      const container = document.createElement('div');
      const root = createRoot(container);
      act(() =>
        root.render(
          <ChartPlot<'a'>
            kind={kind}
            data={[
              { x: '2026-10', a: 1 },
              { x: '2026-11', a: 2 },
            ]}
            series={[{ key: 'a', label: 'A', token: 'chart-1', mark: 'solid' }]}
            formatX={(x) => x}
            formatXLong={(x) => x}
            formatValue={(v) => String(v)}
            valueKind="count"
            height={180}
          />,
        ),
      );
      expect(container.querySelector('.recharts-responsive-container')).not.toBeNull();
      expect(container.firstElementChild?.className).toContain('text-iwana-neutral-200');
      act(() => root.unmount());
    }
  });
});
