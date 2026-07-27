import { render, screen } from '@testing-library/react';
import { Select } from '@iwana/ui';

/**
 * Regresión del placeholder de `Select` — §7.3 del contrato de estados
 * atenuados (docs/specs/2026-07-26-estados-atenuados-contraste-ds-contrato.md)
 * y defecto D-3 del programa ADR-065.
 *
 * El placeholder es texto NO exento de contraste (WCAG 2.2 SC 1.4.3):
 *
 * | Variante | Valor contratado | Ratio medido | Valor prohibido | Ratio |
 * | --- | --- | --- | --- | --- |
 * | Claro (sobre blanco) | `text-gray-500` | 4,84:1 ✓ | `text-gray-400` | 2,60:1 ✗ |
 * | Oscuro (sobre dark-surface-3) | `dark:text-gray-400` | 5,52:1 ✓ | `dark:text-gray-500` | 2,97:1 ✗ |
 *
 * Si alguien devuelve el claro a `text-gray-400` o el oscuro a
 * `dark:text-gray-500`, este test muere.
 */
describe('Select — contraste del placeholder (contrato §7.3 / D-3)', () => {
  /**
   * El placeholder se aplica al botón trigger (`role="combobox"`) cuando no hay
   * selección — ver Select.tsx:479. El `<select>` nativo hermano va oculto y
   * fuera del árbol de accesibilidad, así que solo hay un combobox accesible.
   */
  function renderTrigger(): HTMLElement {
    render(
      <Select
        aria-label="Campo de prueba"
        placeholder="Elige una opción"
        options={[
          { value: 'a', label: 'Opción A' },
          { value: 'b', label: 'Opción B' },
        ]}
      />,
    );
    return screen.getByRole('combobox', { name: 'Campo de prueba' });
  }

  it('el placeholder claro usa text-gray-500 (nunca text-gray-400)', () => {
    const trigger = renderTrigger();
    const classes = trigger.className.split(/\s+/);

    expect(classes).toContain('text-gray-500');
    expect(classes).not.toContain('text-gray-400');
  });

  it('el placeholder oscuro usa dark:text-gray-400 (nunca dark:text-gray-500)', () => {
    const trigger = renderTrigger();
    const classes = trigger.className.split(/\s+/);

    expect(classes).toContain('dark:text-gray-400');
    expect(classes).not.toContain('dark:text-gray-500');
  });
});
