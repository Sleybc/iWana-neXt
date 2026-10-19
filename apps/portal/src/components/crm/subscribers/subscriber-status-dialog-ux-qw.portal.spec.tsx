import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SubscriberStatus } from '@iwana/shared';
import type { TransitionStatusPayload } from '@iwana/shared';
import { ApiError } from '@/lib/api-client';
import { SubscriberStatusTransitionDialog } from './SubscriberStatusTransitionDialog';

function setup({
  mode = 'advance',
  currentStatus = SubscriberStatus.LEAD,
  onTransition = jest.fn(async (_payload: TransitionStatusPayload) => undefined),
  onOpenChange = jest.fn(),
  onGoToServices = jest.fn(),
}: {
  mode?: 'advance' | 'cancel';
  currentStatus?: SubscriberStatus;
  onTransition?: (payload: TransitionStatusPayload) => Promise<void>;
  onOpenChange?: (open: boolean) => void;
  onGoToServices?: () => void;
} = {}) {
  render(
    <SubscriberStatusTransitionDialog
      currentStatus={currentStatus}
      mode={mode}
      open
      onOpenChange={onOpenChange}
      onAddContact={jest.fn()}
      onGoToServices={onGoToServices}
      onTransition={onTransition}
    />,
  );
  return userEvent.setup();
}

async function chooseOption(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  option: string,
) {
  await user.click(screen.getByRole('combobox', { name: label }));
  await user.click(await screen.findByRole('option', { name: option }));
}

describe('MOD05 — transición heredada y cancelación explícita', () => {
  it('conserva Cambiar estado solo para LEAD → PROSPECT', async () => {
    const onTransition = jest.fn(async (_payload: TransitionStatusPayload) => undefined);
    const user = setup({ onTransition });

    await chooseOption(user, 'Estado destino', 'Prospecto');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(onTransition).toHaveBeenCalledWith({ targetStatus: SubscriberStatus.PROSPECT });
  });

  it('CA-LC-10: un prospecto no ofrece transición directa a suspendido', async () => {
    const user = setup({ currentStatus: SubscriberStatus.PROSPECT });

    await user.click(screen.getByRole('combobox', { name: 'Estado destino' }));

    expect(screen.queryByRole('option', { name: 'Suspendido' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
  });

  it('CA-LC-10: exige un motivo de cancelación del catálogo y envía nota opcional sin texto libre', async () => {
    const onTransition = jest.fn(async (_payload: TransitionStatusPayload) => undefined);
    const onOpenChange = jest.fn();
    const user = setup({ mode: 'cancel', onTransition, onOpenChange });

    expect(screen.getByRole('heading', { name: 'Cancelar suscriptor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
    await chooseOption(user, 'Motivo *', 'Solicitud del titular');
    const note = screen.getByRole('textbox', { name: 'Nota (opcional)' });
    expect(note).toHaveAttribute('maxLength', '500');
    await user.type(note, 'Solicitud confirmada por el titular.');
    expect(
      screen.queryByRole('option', { name: 'Descarte de expediente' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() =>
      expect(onTransition).toHaveBeenCalledWith({
        targetStatus: SubscriberStatus.CANCELLED,
        reasonCode: 'SOLICITUD_TITULAR',
        note: 'Solicitud confirmada por el titular.',
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('explica el 409 de servicios vigentes y ofrece ir a Servicios sin exponer IDs', async () => {
    const onTransition = jest.fn(async (_payload: TransitionStatusPayload) => {
      throw new ApiError(409, 'SUBSCRIBER_HAS_LIVE_CONTRACTS', 'contract-uuid-sentinel');
    });
    const onGoToServices = jest.fn();
    const user = setup({ mode: 'cancel', onTransition, onGoToServices });

    await chooseOption(user, 'Motivo *', 'Servicio duplicado');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(
      await screen.findByText(
        'No puedes cancelar al suscriptor mientras tenga servicios vigentes. Termínalos primero.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('contract-uuid-sentinel')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ir a servicios' }));
    expect(onGoToServices).toHaveBeenCalledTimes(1);
  });
});
