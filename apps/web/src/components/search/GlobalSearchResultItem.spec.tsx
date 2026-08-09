import '@testing-library/jest-dom';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { GlobalSearchResultItem } from './GlobalSearchResultItem';
import { parseSearchHighlight } from './SearchHighlight';
import type { GlobalSearchItem } from '@/lib/api-client';

function buildItem(highlights: string[]): GlobalSearchItem {
  return {
    id: 'user-1',
    type: 'user',
    title: 'Liliana Ruiz',
    subtitle: 'Empresa Demo · lili@empresa.com',
    meta: 'Administrador · Activo',
    route: '/users?tenant=empresa-demo&openUser=user-1',
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

describe('GlobalSearchResultItem — resaltado', () => {
  it('should resaltar la coincidencia devuelta por el buscador', () => {
    const { container } = renderItem(['<mark>lili</mark>@empresa.com']);

    const mark = container.querySelector('mark');
    expect(mark).not.toBeNull();
    expect(mark).toHaveTextContent('lili');
    expect(mark?.parentElement).toHaveTextContent('lili@empresa.com');
  });

  it('should resaltar varias coincidencias dentro del mismo fragmento', () => {
    const { container } = renderItem(['<mark>lili</mark> Ruiz <mark>lili</mark>']);

    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(2);
    expect(container.textContent).toContain('lili Ruiz lili');
  });

  it('should mostrar el fragmento sin coincidencias como texto plano', () => {
    const { container } = renderItem(['Sin coincidencias']);

    expect(container.querySelector('mark')).toBeNull();
    expect(container.textContent).toContain('Sin coincidencias');
  });
});

/**
 * Control negativo del hallazgo C-7
 * (SECURITY-REVIEW-TRANSVERSAL-XSS-BUSQUEDA-GLOBAL-v1.0).
 *
 * Los fragmentos provienen de campos de texto libre editables por el tenant y
 * llegan sin escapar. Estas pruebas fallan si se reintroduce un sink de HTML
 * crudo en el render del resaltado: con el sink, el marcado del payload se
 * convierte en elementos del DOM y el texto deja de ser literal.
 */
describe('GlobalSearchResultItem — control negativo de XSS almacenado', () => {
  const scriptPayload = '<mark>lili</mark><script>window.__xssProbe = true;</script>';
  const attributePayload = '<mark>lili</mark><img src="x" onerror="window.__xssProbe = true" />';

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

    expect(container.querySelector('mark')).toHaveTextContent('lili');
  });

  it('should mantener el directorio de busqueda libre de sinks de HTML crudo', () => {
    // Se compone en tiempo de ejecucion para que este archivo no sea su propia
    // coincidencia. CA-XSS-01.
    const sink = ['dangerously', 'SetInnerHTML'].join('');
    const directory = __dirname;

    const offenders = readdirSync(directory)
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => readFileSync(join(directory, file), 'utf8').includes(sink));

    expect(offenders).toEqual([]);
  });
});

describe('parseSearchHighlight', () => {
  it('should separar el fragmento en segmentos coincidentes y no coincidentes', () => {
    expect(parseSearchHighlight('ab<mark>cd</mark>ef')).toEqual([
      { text: 'ab', isMatch: false },
      { text: 'cd', isMatch: true },
      { text: 'ef', isMatch: false },
    ]);
  });

  it('should devolver un unico segmento cuando no hay resaltado', () => {
    expect(parseSearchHighlight('sin resaltado')).toEqual([
      { text: 'sin resaltado', isMatch: false },
    ]);
  });

  it('should conservar el marcado del payload como texto del segmento', () => {
    expect(parseSearchHighlight('<script>alert(1)</script>')).toEqual([
      { text: '<script>alert(1)</script>', isMatch: false },
    ]);
  });

  it('should tolerar un fragmento vacio', () => {
    expect(parseSearchHighlight('')).toEqual([]);
  });
});
