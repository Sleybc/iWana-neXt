// Extiende los matchers de Jest con los de @testing-library/jest-dom
import '@testing-library/jest-dom';
// Matcher de axe-core para auditorías WCAG en pruebas unitarias (T3 Wave 3)
import { toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

// jsdom no implementa AbortSignal.timeout (disponible en Node 17.3+/browsers
// modernos). El cliente central lo usa como timeout duro de fetch (ADR-081,
// C-2); sin el polyfill la suite unitaria del portal falla en el entorno jsdom.
if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout !== 'function') {
  (AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }).timeout = (ms: number) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new DOMException('Timeout', 'TimeoutError'));
    }, ms);
    controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
    return controller.signal;
  };
}
