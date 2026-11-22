import { render } from '@testing-library/react';
import { DashboardBars, type DashboardBarRow } from './dashboard-visuals';

function fills(rows: DashboardBarRow[]): string[] {
  const { container } = render(<DashboardBars rows={rows} />);
  return Array.from(container.querySelectorAll('dl span > span')).map((el) => el.className);
}

describe('DashboardBars · tono con Tone + FillEmphasis (F1-D6, contrato DS §7ter.2)', () => {
  it('sin tono, azul noche fuerte; error fuerte en rojo 600; warning con su escala semántica', () => {
    const [plain, failed, warning] = fills([
      { key: 'a', label: 'En ejecución', value: 3 },
      { key: 'b', label: 'Sin aprovisionar', value: 2, tone: 'error', emphasis: 'strong' },
      { key: 'c', label: 'Cerradas sin aprovisionar', value: 1, tone: 'warning' },
    ]);
    expect(plain).toContain('bg-iwana-primary');
    expect(plain).toContain('dark:bg-iwana-primary-300');
    expect(failed).toContain('bg-error-600');
    expect(failed).not.toContain('bg-error-500');
    expect(warning).toContain('bg-warning-500');
    expect(warning).not.toContain('amber');
  });
});
