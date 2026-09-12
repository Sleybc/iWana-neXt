import { waitFor } from '@testing-library/react';
import {
  focusElementById,
  focusFirstMatchingInput,
  focusFirstVisibleTaxRateInput,
  focusLastMatchingInput,
} from './line-focus';

describe('line-focus (Fase 27)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });

  it('enfoca el elemento por id', async () => {
    document.body.innerHTML = '<input id="campo-1" />';
    focusElementById('campo-1');

    await waitFor(() => {
      expect(document.getElementById('campo-1')).toHaveFocus();
    });
  });

  it('no falla con un id inexistente', () => {
    expect(() => focusElementById('no-existe')).not.toThrow();
  });

  it('enfoca el último input con el prefijo (línea recién agregada)', async () => {
    document.body.innerHTML =
      '<input id="purchase-draft-qty-a" /><input id="purchase-draft-qty-b" />';
    focusLastMatchingInput('purchase-draft-qty-');

    await waitFor(() => {
      expect(document.getElementById('purchase-draft-qty-b')).toHaveFocus();
    });
  });

  it('enfoca el primer input con el prefijo (primera fila a corregir)', async () => {
    document.body.innerHTML =
      '<input id="purchase-draft-qty-a" /><input id="purchase-draft-qty-b" />';
    focusFirstMatchingInput('purchase-draft-qty-');

    await waitFor(() => {
      expect(document.getElementById('purchase-draft-qty-a')).toHaveFocus();
    });
  });

  it('enfoca la primera tasa de tributo visible', async () => {
    document.body.innerHTML = '<input id="quote-tax-rate-iva" /><input id="quote-tax-rate-rete" />';
    expect(focusFirstVisibleTaxRateInput()).toBe(true);

    await waitFor(() => {
      expect(document.getElementById('quote-tax-rate-iva')).toHaveFocus();
    });
  });

  it('no falla sin coincidencias', () => {
    expect(() => {
      focusLastMatchingInput('sin-coincidencias-');
      focusFirstMatchingInput('sin-coincidencias-');
    }).not.toThrow();
    expect(focusFirstVisibleTaxRateInput()).toBe(false);
  });
});
