/**
 * Chips de etiquetas (ADR-110 D8, plan transversal importación UISP, bloque T).
 */
import { render, screen, within } from '@testing-library/react';
import { ApiError } from '@/lib/api-client';
import { SubscriberTagChips } from './SubscriberTagChips';
import { subscriberTagErrorMessage, subscriberTagTextColor } from './subscriber-tag-ui';

function chip(n: number, color = '#2563EB') {
  return { id: `00000000-0000-4000-8000-00000000000${n}`, name: `Etiqueta ${n}`, color };
}

describe('subscriberTagTextColor', () => {
  it.each([
    ['#FFFF00', '#000000'],
    ['#FFFFFF', '#000000'],
    ['#000000', '#FFFFFF'],
    ['#1E3A8A', '#FFFFFF'],
    ['#22C55E', '#000000'],
  ])('sobre %s elige %s', (background, expected) => {
    expect(subscriberTagTextColor(background)).toBe(expected);
  });

  it('con un color inválido usa texto negro', () => {
    expect(subscriberTagTextColor('azul')).toBe('#000000');
  });
});

describe('SubscriberTagChips', () => {
  it('sin etiquetas no pinta nada', () => {
    const { container } = render(<SubscriberTagChips tags={[]} />);
    expect(container).toBeEmptyDOMElement();
    const { container: undefinedTags } = render(<SubscriberTagChips tags={undefined} />);
    expect(undefinedTags).toBeEmptyDOMElement();
  });

  it('pinta cada chip con su color y texto contrastado', () => {
    render(<SubscriberTagChips tags={[chip(1, '#000000'), chip(2, '#FFFF00')]} />);
    const list = screen.getByRole('list', { name: 'Etiquetas' });
    const dark = within(list).getByText('Etiqueta 1').parentElement as HTMLElement;
    const light = within(list).getByText('Etiqueta 2').parentElement as HTMLElement;
    expect(dark).toHaveStyle({ backgroundColor: '#000000', color: '#FFFFFF' });
    expect(light).toHaveStyle({ backgroundColor: '#FFFF00', color: '#000000' });
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it('muestra 3 y resume el resto con «+N» accesible', () => {
    render(<SubscriberTagChips tags={[1, 2, 3, 4, 5].map((n) => chip(n))} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.queryByText('Etiqueta 4')).not.toBeInTheDocument();
    const more = screen.getByText('+2');
    expect(more).toHaveAttribute('aria-label', '2 etiquetas más: Etiqueta 4, Etiqueta 5');
    expect(more).toHaveAttribute('title', 'Etiqueta 4, Etiqueta 5');
  });
});

describe('subscriberTagErrorMessage', () => {
  it.each([
    ['SUBSCRIBER_TAG_NAME_TAKEN', 409, /Ya existe una etiqueta con ese nombre/],
    ['SUBSCRIBER_TAG_CATALOG_FULL', 409, /máximo de etiquetas/],
    ['SUBSCRIBER_TAG_NOT_FOUND', 404, /ya no existe/],
    ['PRIVACY_TITULAR_ANONYMIZED', 409, /anonimizados/],
    ['PRIVACY_DATA_BLOCKED', 409, /bloqueados/],
    ['FORBIDDEN', 403, /No tienes acceso para cambiar etiquetas/],
  ])('traduce %s', (code, status, expected) => {
    expect(subscriberTagErrorMessage(new ApiError(status, code, 'x'))).toMatch(expected);
  });

  it('un error desconocido da el mensaje genérico', () => {
    expect(subscriberTagErrorMessage(new Error('red'))).toBe(
      'No pudimos guardar el cambio. Reintenta en unos minutos.',
    );
  });
});
