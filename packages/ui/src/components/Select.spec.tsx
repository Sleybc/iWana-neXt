import { describe, expect, it } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';
import { Select } from './Select';

const options = [
  { value: 'a', label: 'Opción A' },
  { value: 'b', label: 'Opción B' },
];

function combobox(html: string): string {
  const match = html.match(/<button[^>]*role="combobox"[^>]*>/);
  if (!match) throw new Error('No se renderizó el combobox.');
  return match[0];
}

describe('Select', () => {
  it('anuncia en el combobox visible que el campo es obligatorio', () => {
    const html = renderToStaticMarkup(
      <Select label="Motivo" options={options} required defaultValue="" />,
    );

    expect(combobox(html)).toContain('aria-required="true"');
    // La validación nativa del formulario se conserva en el select oculto.
    expect(html).toMatch(/<select[^>]*required=""/);
  });

  it('respeta un aria-required explícito sin required', () => {
    const html = renderToStaticMarkup(
      <Select label="Motivo" options={options} aria-required="true" defaultValue="" />,
    );

    expect(combobox(html)).toContain('aria-required="true"');
  });

  it('no marca como obligatorio un campo opcional', () => {
    const html = renderToStaticMarkup(<Select label="Motivo" options={options} defaultValue="" />);

    expect(html).not.toContain('aria-required');
  });
});
