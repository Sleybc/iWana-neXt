// Ayudas de prueba del índice activo de requisitos (spec 2026-11-18 bloque D).
// Cada línea del índice es un botón de navegación; solo el requisito activo
// monta su acción, su historial y su captura.
import { fireEvent, screen, within } from '@testing-library/react';

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Botón de navegación de la línea cuya etiqueta empieza por `label`. */
export function requirementLine(label: string | RegExp, root: HTMLElement = document.body) {
  const name =
    typeof label === 'string'
      ? new RegExp(`^${escape(label)}\\s*,`)
      : new RegExp(`^(?:${label.source})`);
  const nav = within(root).getByRole('navigation', { name: 'Requisitos de la orden' });
  return within(nav).getByRole('button', { name });
}

/** Elige la línea del índice para montar su cuerpo. */
export function selectRequirementLine(label: string | RegExp, root?: HTMLElement) {
  fireEvent.click(requirementLine(label, root));
}

/**
 * Regla de fondo en lectura: los únicos botones de la región son líneas del
 * índice (navegación) y no hay ningún disparador de captura.
 */
export function expectOnlyIndexNavigation(region: HTMLElement) {
  expect(region.querySelectorAll('[id^="requirement-trigger-"]')).toHaveLength(0);
  const nav = within(region).queryByRole('navigation', { name: 'Requisitos de la orden' });
  for (const button of within(region).queryAllByRole('button')) {
    expect(nav?.contains(button)).toBe(true);
  }
}

/** El cuerpo montado del requisito activo, por su título. */
export function activeRequirementBody(label: string) {
  return screen.getByRole('region', { name: label });
}

/**
 * Recorre todas las líneas del índice y, tras elegir cada una, afirma que su
 * cuerpo no ofrece ninguna captura: cero disparadores, y fuera de la
 * navegación solo los controles propios del panel de aprovisionamiento.
 * Devuelve cuántas líneas recorrió.
 */
export function expectNoCaptureInAnyLine(region: HTMLElement): number {
  const nav = within(region).getByRole('navigation', { name: 'Requisitos de la orden' });
  const lines = within(nav).getAllByRole('button');
  for (const line of lines) {
    fireEvent.click(line);
    expect(line).toHaveAttribute('aria-current', 'step');
    expect(region.querySelectorAll('[id^="requirement-trigger-"]')).toHaveLength(0);
    const provisioning = region.querySelector('#execution-order-provisioning');
    for (const button of within(region).queryAllByRole('button')) {
      expect(nav.contains(button) || provisioning?.contains(button) === true).toBe(true);
    }
  }
  return lines.length;
}
