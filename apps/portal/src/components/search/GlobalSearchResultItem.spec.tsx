import '@testing-library/jest-dom';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { GlobalSearchResultItem } from './GlobalSearchResultItem';
import { parseSearchHighlight } from '@iwana/ui';
import type { GlobalSearchItem } from '@/lib/api-client';

function buildItem(highlights: string[]): GlobalSearchItem {
  return {
    id: 'subscriber-1',
    type: 'subscriber',
    title: 'Empresa Demo',
    subtitle: 'NIT 900.000.000 · contacto@empresa.com',
    meta: 'Activo',
    route: '/dashboard/crm/subscribers',
    highlights,
  };
}

function renderItem(highlights: string[]) {
  return render(
    <GlobalSearchResultItem
      item={buildItem(highlights)}
      isActive={false}
      onClick={jest.fn()}
      onMouseEnter={jest.fn()}
    />,
  );
}

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(fullPath);
    return /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

describe('GlobalSearchResultItem (portal) — resaltado', () => {
  it('should resaltar la coincidencia del fragmento con marca semantica', () => {
    const { container } = renderItem(['<mark>empresa</mark> demo']);

    const mark = container.querySelector('mark');
    expect(mark).not.toBeNull();
    expect(mark).toHaveTextContent('empresa');
    expect(mark?.parentElement).toHaveTextContent('empresa demo');
  });

  it('should mostrar el fragmento sin coincidencias como texto plano', () => {
    const { container } = renderItem(['Sin coincidencias']);

    expect(container.querySelector('mark')).toBeNull();
    expect(container.textContent).toContain('Sin coincidencias');
  });
});

/**
 * Control negativo del cierre de C-10
 * (SECURITY-REVIEW-TRANSVERSAL-XSS-BUSQUEDA-GLOBAL-v1.0).
 *
 * El portal construia el fragmento en cliente (escapeHtml + highlightMatch) y lo
 * inyectaba con HTML crudo. Desde C-10 el fragmento es dato y lo consume el
 * componente de @iwana/ui: el marcado del payload se muestra literal y ningun
 * elemento de la carga se materializa. Estas pruebas fallan si se reintroduce
 * un sink de HTML crudo en el render del resaltado.
 */
describe('GlobalSearchResultItem (portal) — control negativo de XSS almacenado', () => {
  const scriptPayload = '<mark>empresa</mark><script>window.__xssProbe = true;</script>';
  const attributePayload = '<mark>empresa</mark><img src="x" onerror="window.__xssProbe = true" />';

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__xssProbe;
  });

  it('should renderizar una carga de script como texto literal', () => {
    const { container } = renderItem([scriptPayload]);

    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>window.__xssProbe = true;</script>');
    expect((window as unknown as Record<string, unknown>).__xssProbe).toBeUndefined();
  });

  it('should renderizar una carga basada en atributos como texto literal', () => {
    const { container } = renderItem([attributePayload]);

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src="x" onerror="window.__xssProbe = true" />');
    expect((window as unknown as Record<string, unknown>).__xssProbe).toBeUndefined();
  });

  it('should conservar el resaltado alrededor de la carga', () => {
    const { container } = renderItem([scriptPayload]);

    expect(container.querySelector('mark')).toHaveTextContent('empresa');
  });

  it('should mantener libres de sinks de HTML crudo los directorios del resaltado', () => {
    // Se compone en tiempo de ejecucion para que este archivo no sea su propia
    // coincidencia. CA-C10-01 / P5 del contrato DS.
    const sink = ['dangerously', 'SetInnerHTML'].join('');
    const searchDirectory = __dirname;
    const uiComponentsDirectory = join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      '..',
      'packages',
      'ui',
      'src',
      'components',
    );

    const offenders = [searchDirectory, uiComponentsDirectory]
      .flatMap(collectSourceFiles)
      .filter((file) => readFileSync(file, 'utf8').includes(sink));

    expect(offenders).toEqual([]);
  });
});

describe('parseSearchHighlight (desde @iwana/ui)', () => {
  it('should separar el fragmento en segmentos coincidentes y no coincidentes', () => {
    expect(parseSearchHighlight('ab<mark>cd</mark>ef')).toEqual([
      { text: 'ab', isMatch: false },
      { text: 'cd', isMatch: true },
      { text: 'ef', isMatch: false },
    ]);
  });

  it('should conservar el marcado del payload como texto del segmento', () => {
    expect(parseSearchHighlight('<script>alert(1)</script>')).toEqual([
      { text: '<script>alert(1)</script>', isMatch: false },
    ]);
  });
});
