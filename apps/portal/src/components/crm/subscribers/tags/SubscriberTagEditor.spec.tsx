/**
 * Editor «Asignar etiqueta» de la ficha (ADR-110 D8, plan transversal importación UISP, bloque T).
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SubscriberTag } from '@iwana/shared';
import { ApiError, subscriberTagsApi } from '@/lib/api-client';
import { SubscriberTagEditor } from './SubscriberTagEditor';

const SUBSCRIBER_ID = '00000000-0000-4000-8000-0000000000aa';

function tag(n: number, name: string): SubscriberTag {
  return {
    id: `00000000-0000-4000-8000-00000000000${n}`,
    name,
    color: '#2563EB',
    assignedCount: 1,
    createdAt: '2026-11-11T00:00:00.000Z',
    updatedAt: '2026-11-11T00:00:00.000Z',
  };
}

const VIP = tag(1, 'VIP');
const MOROSO = tag(2, 'Moroso');
const chipOf = ({ id, name, color }: SubscriberTag) => ({ id, name, color });

describe('SubscriberTagEditor', () => {
  beforeEach(() => {
    jest.spyOn(subscriberTagsApi, 'list').mockResolvedValue([MOROSO, VIP]);
  });

  afterEach(() => jest.restoreAllMocks());

  it('marca las etiquetas asignadas y asigna una nueva con PUT', async () => {
    const onTagsChange = jest.fn();
    const assign = jest
      .spyOn(subscriberTagsApi, 'assign')
      .mockResolvedValue([chipOf(MOROSO), chipOf(VIP)]);
    render(
      <SubscriberTagEditor
        subscriberId={SUBSCRIBER_ID}
        tags={[chipOf(VIP)]}
        onTagsChange={onTagsChange}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Editar etiquetas' }));
    const moroso = await screen.findByRole('checkbox', { name: 'Moroso' });
    expect(screen.getByRole('checkbox', { name: 'VIP' })).toBeChecked();
    expect(moroso).not.toBeChecked();

    await userEvent.click(moroso);
    await waitFor(() => expect(onTagsChange).toHaveBeenCalledTimes(1));
    expect(assign).toHaveBeenCalledWith(SUBSCRIBER_ID, MOROSO.id);
    expect(onTagsChange).toHaveBeenCalledWith([chipOf(MOROSO), chipOf(VIP)]);
  });

  it('quita una etiqueta asignada con DELETE', async () => {
    const onTagsChange = jest.fn();
    const unassign = jest.spyOn(subscriberTagsApi, 'unassign').mockResolvedValue([]);
    render(
      <SubscriberTagEditor
        subscriberId={SUBSCRIBER_ID}
        tags={[chipOf(VIP)]}
        onTagsChange={onTagsChange}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Editar etiquetas' }));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'VIP' }));
    await waitFor(() => expect(onTagsChange).toHaveBeenCalledWith([]));
    expect(unassign).toHaveBeenCalledWith(SUBSCRIBER_ID, VIP.id);
  });

  it('muestra el error del titular bloqueado sin cambiar los chips', async () => {
    const onTagsChange = jest.fn();
    jest
      .spyOn(subscriberTagsApi, 'assign')
      .mockRejectedValue(new ApiError(409, 'PRIVACY_DATA_BLOCKED', 'bloqueado'));
    render(
      <SubscriberTagEditor subscriberId={SUBSCRIBER_ID} tags={[]} onTagsChange={onTagsChange} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Asignar etiqueta' }));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'VIP' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/están bloqueados/);
    expect(onTagsChange).not.toHaveBeenCalled();
  });

  it('si el catálogo falla ofrece reintentar', async () => {
    const list = jest
      .spyOn(subscriberTagsApi, 'list')
      .mockRejectedValueOnce(new Error('red'))
      .mockResolvedValueOnce([VIP]);
    render(<SubscriberTagEditor subscriberId={SUBSCRIBER_ID} tags={[]} onTagsChange={jest.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Asignar etiqueta' }));
    expect(await screen.findByText('No pudimos cargar las etiquetas.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('checkbox', { name: 'VIP' })).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('con catálogo vacío orienta hacia Ajustes', async () => {
    jest.spyOn(subscriberTagsApi, 'list').mockResolvedValue([]);
    render(<SubscriberTagEditor subscriberId={SUBSCRIBER_ID} tags={[]} onTagsChange={jest.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Asignar etiqueta' }));
    expect(
      await screen.findByText(/Un administrador puede crearlas en Ajustes/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver etiquetas en Ajustes' })).toHaveAttribute(
      'href',
      '/dashboard/settings/subscriber-tags',
    );
  });
});
