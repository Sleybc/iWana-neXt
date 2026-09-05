import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuoteShippingArrangement } from '@iwana/shared';
import {
  INITIAL_QUOTE_SHIPPING,
  QuoteShippingFields,
  isQuoteShippingValid,
  parseQuoteShippingAmount,
  resolveShippingCost,
  type QuoteShippingValue,
} from './QuoteShippingFields';
import { useState } from 'react';

function Harness({ initial = INITIAL_QUOTE_SHIPPING }: { initial?: QuoteShippingValue }) {
  const [value, setValue] = useState(initial);
  return <QuoteShippingFields value={value} onChange={setValue} />;
}

describe('QuoteShippingFields', () => {
  it('vacío vale cero y no invalida el formulario', () => {
    expect(parseQuoteShippingAmount('')).toBe(0);
    expect(parseQuoteShippingAmount('  ')).toBe(0);
    expect(isQuoteShippingValid(INITIAL_QUOTE_SHIPPING)).toBe(true);
    expect(resolveShippingCost(INITIAL_QUOTE_SHIPPING)).toBe(0);
  });

  it('rechaza montos negativos o no numéricos', () => {
    expect(parseQuoteShippingAmount('-1')).toBeNull();
    expect(parseQuoteShippingAmount('abc')).toBeNull();
    expect(
      isQuoteShippingValid({
        arrangement: QuoteShippingArrangement.ON_INVOICE,
        amount: '-5',
      }),
    ).toBe(false);
  });

  it('muestra las tres condiciones sin enums crudos', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByRole('radio', { name: /Es gratis/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Lo cobra el proveedor/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Lo paga al transportador/i })).toBeInTheDocument();
    expect(screen.queryByText('ON_INVOICE')).not.toBeInTheDocument();
    expect(screen.queryByText('PAY_CARRIER')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Monto del envío')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /Es gratis/i }));
    expect(screen.queryByLabelText('Monto del envío')).not.toBeInTheDocument();
  });
});
