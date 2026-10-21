import { render, screen } from '@testing-library/react';
import { SubscriberContactActions } from './SubscriberContactActions';

describe('SubscriberContactActions', () => {
  it('normaliza al crear los dos destinos sin pintar el teléfono', () => {
    render(
      <SubscriberContactActions
        name="Ana Sintética"
        phone="(300) 123-4567"
        altContactPhone={null}
        whatsapp={null}
        countryPrefix="+57"
      />,
    );

    expect(screen.getByRole('link', { name: 'Llamar a Ana Sintética' })).toHaveAttribute(
      'href',
      'tel:+573001234567',
    );
    expect(
      screen.getByRole('link', { name: 'Escribir por WhatsApp a Ana Sintética' }),
    ).toHaveAttribute('href', 'https://wa.me/573001234567');
    expect(
      screen.getByRole('link', { name: 'Escribir por WhatsApp a Ana Sintética' }),
    ).toHaveAttribute('target', '_blank');
    expect(
      screen.getByRole('link', { name: 'Escribir por WhatsApp a Ana Sintética' }),
    ).toHaveAttribute('rel', 'noopener noreferrer');
    expect(document.body).not.toHaveTextContent('3001234567');
    expect(document.body).not.toHaveTextContent('text=');
  });

  it('usa los candidatos de respaldo y omite las acciones que no puede formar', () => {
    render(
      <SubscriberContactActions
        name="Ana Sintética"
        phone="no válido"
        altContactPhone="300 111 2233"
        whatsapp="no válido"
        countryPrefix="+57"
      />,
    );

    expect(screen.getByRole('link', { name: 'Llamar a Ana Sintética' })).toHaveAttribute(
      'href',
      'tel:+573001112233',
    );
    expect(
      screen.queryByRole('link', { name: 'Escribir por WhatsApp a Ana Sintética' }),
    ).toBeNull();
    expect(screen.queryByText('Teléfono sin formato válido')).toBeNull();
  });

  it('avisa una sola vez cuando hay datos pero ningún candidato es marcable', () => {
    render(
      <SubscriberContactActions
        name="Ana Sintética"
        phone="300 letras"
        altContactPhone="123"
        whatsapp="sin formato"
        countryPrefix="+57"
      />,
    );

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getAllByText('Teléfono sin formato válido')).toHaveLength(1);
    expect(document.body).not.toHaveTextContent('300 letras');
  });

  it.each([
    ['campos ausentes', { phone: undefined, altContactPhone: undefined, whatsapp: undefined }],
    [
      'registro privado',
      { phone: '3001234567', altContactPhone: null, whatsapp: null, hidden: true },
    ],
  ])('no revela acciones ni avisos si aplica %s', (_label, fields) => {
    render(<SubscriberContactActions name="Datos bloqueados" countryPrefix="+57" {...fields} />);

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText('Teléfono sin formato válido')).toBeNull();
  });
});
