import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuoteShippingArrangement } from '@iwana/shared';
import { formatInventoryMoney } from './inventory-labels';
import { QuoteEconomicsFields } from './QuoteEconomicsFields';
import {
  QUOTE_TAX_NO_INVOICE_COPY,
  QUOTE_TAX_RATE_ERROR,
  createInitialQuoteTaxState,
  type QuoteTaxState,
} from './quote-tax-calc';
import { INITIAL_QUOTE_SHIPPING, type QuoteShippingValue } from './QuoteShippingFields';

const PRESETS = [
  {
    code: 'IVA_19',
    name: 'IVA 19%',
    category: 'VAT',
    baseRate: 19,
    treatment: 'STANDARD',
    context: 'PURCHASE',
  },
  {
    code: 'RETE_FUENTE_SERVICIOS',
    name: 'Retención en la fuente — Servicios',
    category: 'WITHHOLDING',
    baseRate: 4,
    treatment: 'STANDARD',
    context: 'PURCHASE',
  },
  {
    code: 'RETE_ICA',
    name: 'ReteICA — Bogotá',
    category: 'MUNICIPAL',
    baseRate: 0.414,
    treatment: 'STANDARD',
    context: 'PURCHASE',
  },
  {
    code: 'RETE_IVA',
    name: 'Rete IVA',
    category: 'WITHHOLDING',
    baseRate: 15,
    treatment: 'STANDARD',
    context: 'PURCHASE',
  },
];

function Harness({ amount = 100 }: { amount?: number }) {
  const [shipping, setShipping] = useState<QuoteShippingValue>(INITIAL_QUOTE_SHIPPING);
  const [taxes, setTaxes] = useState<QuoteTaxState>(createInitialQuoteTaxState(PRESETS));
  return (
    <QuoteEconomicsFields
      shipping={shipping}
      onShippingChange={setShipping}
      taxes={taxes}
      onTaxesChange={setTaxes}
      amount={amount}
      presets={PRESETS}
    />
  );
}

describe('QuoteEconomicsFields', () => {
  it('afirma el neto aunque el monto de envío esté vacío', async () => {
    const user = userEvent.setup();
    render(<Harness amount={100} />);

    await user.click(screen.getByRole('checkbox', { name: 'IVA' }));
    const money = formatInventoryMoney(119).replace(/\u00a0/g, ' ');
    expect(
      screen
        .getByText('Neto a pagar')
        .closest('div')
        ?.textContent?.replace(/\u00a0/g, ' '),
    ).toContain(money);
    expect(screen.getByText('Neto a pagar').closest('div')?.textContent).not.toContain('—');
    expect(screen.getByText('Sin cargo de envío')).toBeInTheDocument();
  });

  it('CA-25-04: preview local coincide con la fórmula de servidor', async () => {
    const user = userEvent.setup();
    render(<Harness amount={100} />);

    await user.click(screen.getByRole('checkbox', { name: 'IVA' }));
    await user.click(screen.getByRole('checkbox', { name: 'Retención en la fuente' }));
    await user.click(screen.getByRole('checkbox', { name: 'Rete ICA' }));
    await user.click(screen.getByRole('checkbox', { name: 'Rete IVA' }));

    const money = (value: number) => formatInventoryMoney(value).replace(/\u00a0/g, ' ');
    expect(
      screen.getByText((_, element) => {
        const text = element?.textContent?.replace(/\u00a0/g, ' ') ?? '';
        return element?.tagName === 'DD' && text === money(19);
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText((_, element) => {
        const text = element?.textContent?.replace(/\u00a0/g, ' ') ?? '';
        return element?.tagName === 'DD' && text === `− ${money(4)}`;
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText((_, element) => {
        const text = element?.textContent?.replace(/\u00a0/g, ' ') ?? '';
        return element?.tagName === 'DD' && text === `− ${money(0.41)}`;
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText((_, element) => {
        const text = element?.textContent?.replace(/\u00a0/g, ' ') ?? '';
        return element?.tagName === 'DD' && text === `− ${money(2.85)}`;
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText((_, element) => {
        const text = element?.textContent?.replace(/\u00a0/g, ' ') ?? '';
        return element?.tagName === 'DD' && text === money(111.74);
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(QUOTE_TAX_NO_INVOICE_COPY)).toBeInTheDocument();
  });

  it('deshabilita el neto y muestra error si la tasa encendida es inválida', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('checkbox', { name: 'IVA' }));
    const rateInput = screen.getByLabelText('Tasa de IVA (%)');
    await user.clear(rateInput);
    await user.type(rateInput, '101');

    expect(screen.getByText(QUOTE_TAX_RATE_ERROR)).toBeInTheDocument();
    expect(screen.getByText('Neto a pagar').closest('div')?.textContent).toContain('—');
  });

  it('el flete al transportador no entra al neto y se muestra como total de la oferta', async () => {
    const user = userEvent.setup();
    render(<Harness amount={100} />);

    await user.click(screen.getByRole('radio', { name: /Lo paga al transportador/i }));
    await user.type(screen.getByLabelText('Monto del envío'), '40');
    await user.click(screen.getByRole('checkbox', { name: 'IVA' }));

    const neto = formatInventoryMoney(119).replace(/\u00a0/g, ' ');
    const offer = formatInventoryMoney(159).replace(/\u00a0/g, ' ');
    expect(
      screen
        .getByText('Neto a pagar')
        .closest('div')
        ?.textContent?.replace(/\u00a0/g, ' '),
    ).toContain(neto);
    expect(
      screen
        .getByText('Total de la oferta')
        .closest('div')
        ?.textContent?.replace(/\u00a0/g, ' '),
    ).toContain(offer);
    expect(screen.queryByText(QuoteShippingArrangement.PAY_CARRIER)).not.toBeInTheDocument();
  });
});
