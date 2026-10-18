import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SubscriberStatus } from '@iwana/shared';
import { ApiError } from '@/lib/api-client';
import { SubscriberStatusTransitionDialog } from './SubscriberStatusTransitionDialog';

function setup(
  onTransition: (status: SubscriberStatus, reason?: string) => Promise<void> = jest.fn(
    async () => undefined,
  ),
) {
  render(
    <SubscriberStatusTransitionDialog
      currentStatus={SubscriberStatus.PROSPECT}
      open
      onOpenChange={jest.fn()}
      onAddContact={jest.fn()}
      onTransition={onTransition}
    />,
  );
  return userEvent.setup();
}
async function destination(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('combobox', { name: 'Estado destino' }));
  await user.click(screen.getByRole('option', { name }));
}
describe('QW4 — razón y confirmación del cambio de estado', () => {
  it('oculta la razón sin destino y al activar', async () => {
    const user = setup();
    expect(screen.queryByRole('textbox', { name: /Razón/ })).toBeNull();
    await destination(user, 'Activo');
    expect(screen.queryByRole('textbox', { name: /Razón/ })).toBeNull();
  });
  it.each(['Suspendido', 'Cancelado'])('exige razón para %s con marca visible', async (name) => {
    const user = setup();
    await destination(user, name);
    const reason = screen.getByRole('textbox', { name: /Razón/ });
    expect(reason).toBeRequired();
    expect(reason).toHaveAttribute('aria-required', 'true');
    expect(screen.getByText('*')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
  });
  it('limpia la razón al elegir un destino que no la requiere', async () => {
    const onTransition = jest.fn(async () => undefined);
    const user = setup(onTransition);
    await destination(user, 'Suspendido');
    fireEvent.change(screen.getByRole('textbox', { name: /Razón/ }), {
      target: { value: 'Motivo sintético' },
    });
    await destination(user, 'Activo');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() =>
      expect(onTransition).toHaveBeenCalledWith(SubscriberStatus.ACTIVE, undefined),
    );
  });
  it.each([
    [
      new ApiError(409, 'CONFLICT', 'La transición no está disponible.'),
      'La transición no está disponible.',
    ],
    [
      new Error('Detalle interno sintético'),
      'No fue posible completar la transición. Inténtalo de nuevo.',
    ],
  ])('muestra el mensaje público o el respaldo seguro', async (error, expected) => {
    const user = setup(jest.fn().mockRejectedValue(error));
    await destination(user, 'Activo');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByText(expected)).toBeVisible();
    expect(screen.queryByText('Detalle interno sintético')).toBeNull();
  });
  it('anuncia la confirmación pendiente con aria-busy y texto estable', async () => {
    const user = setup(jest.fn(() => new Promise<void>(() => undefined)));
    await destination(user, 'Activo');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(screen.getByRole('button', { name: 'Confirmar' })).toHaveAttribute('aria-busy', 'true');
  });
});
