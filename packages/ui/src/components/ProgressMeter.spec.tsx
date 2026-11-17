/** @jest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { ProgressMeter } from './ProgressMeter';

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

describe('ProgressMeter', () => {
  it('por defecto muestra rótulo, porcentaje y barra', () => {
    act(() => root.render(<ProgressMeter value={81} label="De lo facturado" />));
    expect(container.textContent).toContain('De lo facturado');
    expect(container.textContent).toContain('81%');
    const bar = container.querySelector('progress');
    expect(bar?.getAttribute('aria-label')).toBe('De lo facturado: 81%');
    expect(bar?.getAttribute('value')).toBe('81');
  });

  it('compact: solo la barra, con el mismo nombre accesible y el valor recortado a 0–100', () => {
    act(() =>
      root.render(
        <ProgressMeter compact value={130} label="Recaudo" ariaLabel="Recaudo del mes" />,
      ),
    );
    const bar = container.querySelector('progress');
    expect(bar?.getAttribute('aria-label')).toBe('Recaudo del mes');
    expect(bar?.getAttribute('value')).toBe('100');
    expect(bar?.className).toMatch(/\bh-2\b/);
    expect(container.textContent).toBe('');
  });
});
