'use client';

/**
 * Foco gestionado para los flujos de creación de Compras (Fase 27).
 * Tras agregar una línea o ante un error de validación, el foco va al campo
 * correspondiente en vez de dejarlo perdido. Guarda de entorno para SSR/tests.
 */
export function focusElementById(id: string): void {
  if (typeof document === 'undefined') {
    return;
  }
  requestAnimationFrame(() => {
    document.getElementById(id)?.focus({ preventScroll: false });
  });
}

/**
 * Enfoca el último input visible cuyo id empieza con `prefix`.
 * Las líneas de borrador siempre se agregan al final, así que el último
 * coincide con la recién agregada. La búsqueda ocurre en el siguiente frame,
 * cuando React ya confirmó la fila nueva en el DOM.
 */
export function focusLastMatchingInput(prefix: string): void {
  if (typeof document === 'undefined' || typeof requestAnimationFrame === 'undefined') {
    return;
  }
  requestAnimationFrame(() => {
    const nodes = document.querySelectorAll<HTMLElement>(`input[id^="${prefix}"]`);
    nodes[nodes.length - 1]?.focus();
  });
}

/**
 * Enfoca el primer input visible cuyo id empieza con `prefix`.
 * Útil para errores en tablas de líneas (primera fila a corregir).
 * La búsqueda ocurre en el siguiente frame, cuando el DOM está al día.
 */
export function focusFirstMatchingInput(prefix: string): void {
  if (typeof document === 'undefined' || typeof requestAnimationFrame === 'undefined') {
    return;
  }
  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>(`input[id^="${prefix}"]`)?.focus();
  });
}

/**
 * Enfoca el primer input de tasa de tributo visible (`quote-tax-rate-*`).
 * Retorna true si encontró y enfocó uno.
 */
export function focusFirstVisibleTaxRateInput(root?: ParentNode): boolean {
  const scope: ParentNode | undefined =
    root ?? (typeof document === 'undefined' ? undefined : document);
  if (!scope || typeof scope.querySelector !== 'function') {
    return false;
  }
  const target = scope.querySelector<HTMLElement>('input[id^="quote-tax-rate-"]');
  if (!target) {
    return false;
  }
  target.focus();
  return true;
}
