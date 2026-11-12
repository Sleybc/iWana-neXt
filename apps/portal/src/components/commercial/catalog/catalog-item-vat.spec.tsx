import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { VatTreatment } from '@iwana/shared';
import { CatalogVatTreatmentField } from './CatalogVatTreatmentField';
import {
  catalogVatFormSchema,
  catalogVatLegalBasisError,
  catalogVatPayload,
  catalogVatTreatmentLabel,
  toCatalogVatFormValue,
  type CatalogVatFormValue,
} from './catalog-item-vat';

describe('IVA por ítem del catálogo (spec MOD14 2026-11-12 R1, D2)', () => {
  it('sin tratamiento registrado propone el 19 % general', () => {
    expect(toCatalogVatFormValue(null, null)).toEqual({
      treatment: VatTreatment.STANDARD,
      legalBasis: '',
    });
    expect(catalogVatTreatmentLabel(null)).toBe('IVA general (19 %)');
    expect(catalogVatTreatmentLabel(VatTreatment.EXCLUDED)).toBe('Excluido (no causa IVA)');
  });

  it('exige base legal válida solo para exento o excluido', () => {
    expect(catalogVatLegalBasisError(VatTreatment.STANDARD, '')).toBeNull();
    expect(catalogVatLegalBasisError(VatTreatment.EXEMPT, '')).toMatch(/base legal/u);
    expect(catalogVatLegalBasisError(VatTreatment.EXCLUDED, 'no válida')).toMatch(/código/u);
    expect(catalogVatLegalBasisError(VatTreatment.EXCLUDED, 'et_476_7')).toBeNull();
    expect(
      catalogVatFormSchema.safeParse({ treatment: VatTreatment.EXEMPT, legalBasis: '' }).success,
    ).toBe(false);
  });

  it('envía el 19 % sin base legal y normaliza el código del exento', () => {
    expect(catalogVatPayload({ treatment: VatTreatment.STANDARD, legalBasis: 'ET_468' })).toEqual({
      treatment: VatTreatment.STANDARD,
      legalBasis: null,
    });
    expect(catalogVatPayload({ treatment: VatTreatment.EXEMPT, legalBasis: ' et_481_h ' })).toEqual(
      { treatment: VatTreatment.EXEMPT, legalBasis: 'ET_481_H' },
    );
  });
});

function Harness({ initial }: { initial: CatalogVatFormValue }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <CatalogVatTreatmentField
        label="IVA del producto"
        helperText="Ayuda"
        value={value}
        onChange={setValue}
      />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
}

describe('CatalogVatTreatmentField', () => {
  it('pide la base legal solo cuando el ítem no es del 19 %', () => {
    render(<Harness initial={{ treatment: VatTreatment.STANDARD, legalBasis: '' }} />);
    expect(screen.queryByLabelText(/Base legal/u)).not.toBeInTheDocument();
  });

  it('muestra la base legal de un exento y la guarda en mayúsculas', () => {
    render(<Harness initial={{ treatment: VatTreatment.EXEMPT, legalBasis: '' }} />);
    fireEvent.change(screen.getByLabelText(/Base legal/u), { target: { value: 'et_481_h' } });
    expect(screen.getByTestId('value')).toHaveTextContent('"legalBasis":"ET_481_H"');
  });
});
