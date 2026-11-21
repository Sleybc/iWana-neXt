/** @jest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  toneFillVariants,
  toneMutedTextVariants,
  toneSurfaceVariants,
  toneTextVariants,
  type FillEmphasis,
  type Tone,
} from './Tone';
import { MetricCard, metricCardVariants } from './MetricCard';
import { ErrorState } from './ErrorState';
import { EmptyState } from './EmptyState';
import { StackedBar } from './StackedBar';
import { Card } from './Card';

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

const TONES: Tone[] = ['neutral', 'primary', 'success', 'warning', 'error'];

describe('toneVariants', () => {
  it.each(TONES)('el tono %s no usa rose, amber, lima ni valores arbitrarios', (tone) => {
    const all = `${toneSurfaceVariants({ tone })} ${toneTextVariants({ tone })} ${toneFillVariants({ tone })}`;
    expect(all).not.toMatch(/rose-|amber-|iwana-secondary|\[/);
    expect(toneSurfaceVariants({ tone })).toMatch(/dark:bg-/);
  });

  it('aviso usa la escala warning y en oscuro el 500 al 15 %', () => {
    expect(toneSurfaceVariants({ tone: 'warning' })).toContain('dark:bg-warning-500/15');
    expect(toneTextVariants({ tone: 'warning' })).toBe('text-warning-700 dark:text-warning-400');
    expect(toneFillVariants({ tone: 'error' })).toBe('bg-error-500');
  });
});

describe('toneFillVariants con emphasis (v1.1 §5.5)', () => {
  const EXPECTED: Record<Tone, Record<FillEmphasis, string>> = {
    neutral: {
      soft: 'bg-gray-400 dark:bg-gray-500',
      default: 'bg-gray-400 dark:bg-gray-500',
      strong: 'bg-gray-400 dark:bg-gray-500',
    },
    primary: {
      soft: 'bg-iwana-primary-400',
      default: 'bg-iwana-primary',
      strong: 'bg-iwana-primary dark:bg-iwana-primary-300',
    },
    success: { soft: 'bg-success-500', default: 'bg-success-500', strong: 'bg-success-500' },
    warning: { soft: 'bg-warning-400', default: 'bg-warning-500', strong: 'bg-warning-600' },
    error: { soft: 'bg-error-400', default: 'bg-error-500', strong: 'bg-error-600' },
  };
  const CASES = TONES.flatMap((tone) =>
    (['soft', 'default', 'strong'] as FillEmphasis[]).map((emphasis): [Tone, FillEmphasis] => [
      tone,
      emphasis,
    ]),
  );

  it.each(CASES)('%s / %s da la clase de la tabla, sin conflicto', (tone, emphasis) => {
    expect(toneFillVariants({ tone, emphasis })).toBe(EXPECTED[tone][emphasis]);
  });

  it('sin emphasis equivale a default (v1.0)', () => {
    for (const tone of TONES) {
      expect(toneFillVariants({ tone })).toBe(EXPECTED[tone].default);
    }
  });
});

describe('toneMutedTextVariants (v1.1 §2.1)', () => {
  it.each([
    ['neutral', 'text-gray-500 dark:text-gray-400'],
    ['primary', 'text-gray-500 dark:text-gray-400'],
    ['success', 'text-gray-700 dark:text-gray-200'],
    ['warning', 'text-gray-700 dark:text-gray-200'],
    ['error', 'text-gray-700 dark:text-gray-200'],
  ] as Array<[Tone, string]>)('%s → %s', (tone, expected) => {
    expect(toneMutedTextVariants({ tone })).toBe(expected);
  });
});

describe('MetricCard', () => {
  it.each(TONES)('pinta el tono %s como article con eyebrow, cifra, total y título', (tone) => {
    act(() =>
      root.render(
        <MetricCard tone={tone} label="Suspendidos" value={4} total={10} eyebrow="Red" />,
      ),
    );
    const article = container.querySelector('article');
    expect(article).not.toBeNull();
    expect(article?.className).toContain('rounded-2xl');
    expect(article?.className).toContain('min-h-37');
    expect(article?.className).toContain(toneSurfaceVariants({ tone }).split(' ')[0]);
    expect(article?.className).not.toMatch(/hover:shadow/);
    expect(container.textContent).toBe('Red4/ 10Suspendidos');
  });

  it('el texto atenuado sobre aviso y error es gray-700 / gray-200', () => {
    act(() => root.render(<MetricCard tone="error" label="A" value={1} description="Detalle" />));
    expect(container.textContent).toContain('Detalle');
    const description = [...container.querySelectorAll('span')].find(
      (s) => s.textContent === 'Detalle',
    );
    expect(description?.className).toContain('text-gray-700');
  });

  it('con onActivate es un botón con aria-pressed y foco compartido', () => {
    const onActivate = jest.fn();
    act(() =>
      root.render(
        <MetricCard label="Vencidos" value={2} tone="error" isActive onActivate={onActivate} />,
      ),
    );
    const button = container.querySelector('button');
    expect(button?.getAttribute('type')).toBe('button');
    expect(button?.getAttribute('aria-pressed')).toBe('true');
    expect(button?.className).toContain('ring-iwana-primary/40');
    expect(button?.className).toContain('focus-visible:ring-2');
    expect(button?.className).toContain('hover:shadow-iwana-active');
    act(() => button?.click());
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('sin isActive el botón no emite aria-pressed (solo enfoca, no filtra)', () => {
    act(() =>
      root.render(<MetricCard label="Requieren atención" value={3} onActivate={() => {}} />),
    );
    expect(container.querySelector('button')?.hasAttribute('aria-pressed')).toBe(false);
  });

  it('isActive={false} emite aria-pressed="false"', () => {
    act(() =>
      root.render(<MetricCard label="Filtro" value={3} isActive={false} onActivate={() => {}} />),
    );
    expect(container.querySelector('button')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('interactive=false fuerza article aunque haya onActivate', () => {
    act(() =>
      root.render(<MetricCard label="Cero" value={0} interactive={false} onActivate={() => {}} />),
    );
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('article')).not.toBeNull();
  });

  it('asChild delega en el hijo y conserva su href', () => {
    act(() =>
      root.render(
        <MetricCard asChild label="Activos" value={7} size="compact" aria-label="Activos: 7">
          <a href="/tenants?status=active" />
        </MetricCard>,
      ),
    );
    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/tenants?status=active');
    expect(link?.getAttribute('aria-label')).toBe('Activos: 7');
    expect(link?.className).toContain('min-h-22');
    expect(link?.textContent).toBe('7Activos');
  });

  it('emphasized solo aplica si no está activa', () => {
    act(() => root.render(<MetricCard label="A" value={1} emphasized />));
    expect(container.querySelector('article')?.className).toContain('ring-iwana-primary/25');
  });

  it('en carga muestra un esqueleto con la misma caja', () => {
    act(() => root.render(<MetricCard label="A" value={1} state="loading" size="compact" />));
    const skeleton = container.querySelector('[aria-hidden="true"]');
    expect(skeleton?.className).toContain('min-h-22');
    expect(skeleton?.className).toContain('animate-pulse');
    expect(container.textContent).toBe('');
  });

  it('metricCardVariants expone la carcasa por tono y tamaño', () => {
    const classes = metricCardVariants({ tone: 'warning', size: 'compact' });
    expect(classes).toContain('min-h-22');
    expect(classes).toContain('bg-warning-50');
    expect(metricCardVariants()).toContain('min-h-37');
  });
});

describe('ErrorState', () => {
  it('sin onRetry no hay botón', () => {
    act(() => root.render(<ErrorState message="No se pudo cargar." retryLabel="Reintentar" />));
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('No se pudo cargar.');
    expect(container.querySelector('button')).toBeNull();
  });

  it('con onRetry muestra el rótulo y reintenta', () => {
    const onRetry = jest.fn();
    act(() =>
      root.render(<ErrorState message="Falló." onRetry={onRetry} retryLabel="Reintentar" />),
    );
    const button = container.querySelector('button');
    expect(button?.textContent).toContain('Reintentar');
    act(() => button?.click());
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('reintentando deja el botón deshabilitado y ocupado', () => {
    act(() =>
      root.render(
        <ErrorState message="Falló." onRetry={() => {}} retryLabel="Reintentar" isRetrying />,
      ),
    );
    const button = container.querySelector('button');
    expect(button?.disabled).toBe(true);
    expect(button?.getAttribute('aria-busy')).toBe('true');
  });
});

describe('EmptyState', () => {
  it('muestra el mensaje y la acción opcional sin rol vivo', () => {
    act(() => root.render(<EmptyState message="Sin actividad." action={<a href="/x">Ver</a>} />));
    expect(container.querySelector('p')?.textContent).toBe('Sin actividad.');
    expect(container.querySelector('a')).not.toBeNull();
    expect(container.querySelector('[role]')).toBeNull();
  });
});

describe('StackedBar', () => {
  it('omite tramos en cero y nombra la barra con valores formateados', () => {
    act(() =>
      root.render(
        <StackedBar
          ariaLabel="Distribución"
          formatValue={(value) => `${value} clientes`}
          segments={[
            { key: 'a', label: 'Activos', value: 3, tone: 'success' },
            { key: 'b', label: 'Suspendidos', value: 0, tone: 'warning' },
            { key: 'c', label: 'Cancelados', value: 1, tone: 'error' },
          ]}
        />,
      ),
    );
    const bar = container.querySelector('[role="img"]');
    expect(bar?.getAttribute('aria-label')).toBe(
      'Distribución: Activos 3 clientes, Cancelados 1 clientes',
    );
    expect(bar?.className).toContain('h-2.5');
    const spans = bar?.querySelectorAll('span') ?? [];
    expect(spans).toHaveLength(2);
    expect((spans[0] as HTMLElement).style.width).toBe('75%');
    expect((spans[1] as HTMLElement).className).toContain('bg-error-500');
  });

  it('aplica emphasis por tramo', () => {
    act(() =>
      root.render(
        <StackedBar
          ariaLabel="Prioridad"
          segments={[
            { key: 'c', label: 'Crítica', value: 1, tone: 'error', emphasis: 'strong' },
            { key: 'u', label: 'Urgente', value: 1, tone: 'error', emphasis: 'soft' },
          ]}
        />,
      ),
    );
    const spans = container.querySelectorAll('[role="img"] span');
    expect((spans[0] as HTMLElement).className).toContain('bg-error-600');
    expect((spans[1] as HTMLElement).className).toContain('bg-error-400');
  });

  it('con total 0 no renderiza nada', () => {
    act(() =>
      root.render(
        <StackedBar
          ariaLabel="Vacía"
          size="sm"
          segments={[{ key: 'a', label: 'A', value: 0, tone: 'neutral' }]}
        />,
      ),
    );
    expect(container.innerHTML).toBe('');
  });
});

describe('Card variant outline', () => {
  it('lleva borde sin sombra', () => {
    act(() => root.render(<Card variant="outline" />));
    const card = container.firstElementChild;
    expect(card?.className).toContain('border-gray-200');
    expect(card?.className).not.toContain('shadow-iwana-card');
  });
});
