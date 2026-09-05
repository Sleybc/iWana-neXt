import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuoteTaxFields } from './QuoteTaxFields';
import {
  QUOTE_TAX_NOT_SUPPLIER_PROFILE_COPY,
  createInitialQuoteTaxState,
  type QuoteTaxState,
} from './quote-tax-calc';

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

function Harness() {
  const [value, setValue] = useState<QuoteTaxState>(createInitialQuoteTaxState(PRESETS));
  return <QuoteTaxFields value={value} onChange={setValue} presets={PRESETS} />;
}

describe('QuoteTaxFields', () => {
  it('CA-25-03: arranca con los cuatro tributos apagados y sin tasas visibles', () => {
    render(<Harness />);

    expect(screen.getByRole('checkbox', { name: 'IVA' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Retención en la fuente' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Rete ICA' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Rete IVA' })).not.toBeChecked();
    expect(screen.queryByLabelText(/Tasa de /i)).not.toBeInTheDocument();
    expect(screen.getByText(QUOTE_TAX_NOT_SUPPLIER_PROFILE_COPY)).toBeInTheDocument();
    expect(screen.queryByText('IVA_19')).not.toBeInTheDocument();
    expect(screen.queryByText('WITHHOLDING')).not.toBeInTheDocument();
    expect(screen.queryByText('TAX')).not.toBeInTheDocument();
    expect(screen.queryByText(/payableAmount/i)).not.toBeInTheDocument();
  });

  it('CA-25-03: encender revela la tasa con el default del catálogo', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('checkbox', { name: 'IVA' }));
    expect(screen.getByLabelText('Tasa de IVA (%)')).toHaveValue(19);

    await user.click(screen.getByRole('checkbox', { name: 'Rete ICA' }));
    expect(screen.getByLabelText('Tasa de Rete ICA (%)')).toHaveValue(0.414);
  });
});
