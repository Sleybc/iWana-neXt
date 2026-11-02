import { fireEvent, render, screen } from '@testing-library/react';
import type { RutResponsibility, VatResponsibility } from '@iwana/shared';
import { SubscriberFiscalFields } from './SubscriberFiscalFields';

function renderFields(props: {
  required: boolean;
  vat?: VatResponsibility | '';
  rut?: RutResponsibility[];
  rutError?: string;
}) {
  return render(
    <SubscriberFiscalFields
      rutResponsibilitiesRequired={props.required}
      vatResponsibility={props.vat ?? ''}
      rutResponsibilities={props.rut ?? []}
      onVatResponsibilityChange={jest.fn()}
      onRutResponsibilitiesChange={jest.fn()}
      rutError={props.rutError}
    />,
  );
}

const ADD = 'Agregar responsabilidades del RUT';

describe('SubscriberFiscalFields — catálogo del RUT plegable', () => {
  it('pliega el catálogo opcional y lo despliega a pedido', () => {
    renderFields({ required: false, vat: 'NO_RESPONSABLE' as VatResponsibility });

    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: ADD }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(5);
  });

  it('muestra el catálogo cuando es obligatorio', () => {
    renderFields({ required: true, vat: 'RESPONSABLE' as VatResponsibility });

    expect(screen.queryByRole('button', { name: ADD })).toBeNull();
    expect(screen.getAllByRole('checkbox')).toHaveLength(5);
  });

  it('no esconde responsabilidades ya marcadas aunque sean opcionales', () => {
    renderFields({ required: false, rut: ['R-99-PN'] as RutResponsibility[] });

    expect(screen.getByRole('checkbox', { name: /No aplica, otros/ })).toBeChecked();
  });

  it('despliega el catálogo si hay un error que mostrar', () => {
    renderFields({ required: false, rutError: 'Revisa las responsabilidades del RUT.' });

    expect(screen.getAllByRole('checkbox')).toHaveLength(5);
    expect(screen.getByRole('alert')).toHaveTextContent('Revisa las responsabilidades del RUT.');
  });
});
