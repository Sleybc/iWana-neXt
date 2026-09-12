import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
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

function HarnessCollapsible() {
  const [value, setValue] = useState<QuoteTaxState>(createInitialQuoteTaxState(PRESETS));
  return (
    <QuoteTaxFields
      value={value}
      onChange={setValue}
      presets={PRESETS}
      collapsible
      defaultExpanded={false}
    />
  );
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

  it('Fase 28: el nombre no se repite y la tasa vive en la misma línea', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('checkbox', { name: 'IVA' }));

    // El nombre aparece una sola vez como texto visible (el input usa aria-label).
    expect(screen.getAllByText('IVA')).toHaveLength(1);
    expect(screen.queryByText('Tasa de IVA (%)')).not.toBeInTheDocument();

    const checkbox = screen.getByRole('checkbox', { name: 'IVA' });
    const rateInput = screen.getByLabelText('Tasa de IVA (%)');
    expect(checkbox.closest('div')).toContainElement(rateInput);
    expect(within(checkbox.closest('div') as HTMLElement).getByText('%')).toBeInTheDocument();
  });

  it('Fase 29: colapsa y expande preservando el estado', async () => {
    const user = userEvent.setup();
    render(<HarnessCollapsible />);

    expect(screen.queryByRole('checkbox', { name: 'IVA' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Mostrar' }));
    const checkbox = screen.getByRole('checkbox', { name: 'IVA' });
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(screen.getByLabelText('Tasa de IVA (%)')).toHaveValue(19);

    await user.click(screen.getByRole('button', { name: 'Ocultar' }));
    expect(screen.queryByRole('checkbox', { name: 'IVA' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Mostrar' }));
    expect(screen.getByRole('checkbox', { name: 'IVA' })).toBeChecked();
  });

  it('Fase 29: se auto-expande ante tasa inválida', async () => {
    const user = userEvent.setup();
    render(<HarnessCollapsible />);

    await user.click(screen.getByRole('button', { name: 'Mostrar' }));
    await user.click(screen.getByRole('checkbox', { name: 'IVA' }));
    const rateInput = screen.getByLabelText('Tasa de IVA (%)');
    await user.clear(rateInput);
    await user.type(rateInput, '200');
    await user.click(screen.getByRole('button', { name: 'Ocultar' }));

    // La tasa inválida fuerza la expansión para permitir la corrección.
    expect(screen.getByRole('checkbox', { name: 'IVA' })).toBeInTheDocument();
  });
});
