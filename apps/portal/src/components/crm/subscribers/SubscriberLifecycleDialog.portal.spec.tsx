import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SubscriberStatus, type LifecycleAction } from '@iwana/shared';
import type { LifecyclePreviewResponse } from '@iwana/shared';
import type { Contract } from '@/lib/api-client';
import { ApiError, contractsApi, subscribersApi } from '@/lib/api-client';
import { SubscriberLifecycleDialog } from './SubscriberLifecycleDialog';

function contractFixture(
  id: string,
  alias: string,
  status: Contract['status'] = 'ACTIVE',
): Contract {
  return {
    id,
    tenantId: 'tenant-1',
    quoteId: null,
    subscriberId: 'subscriber-1',
    planId: 'plan-1',
    planSnapshotJson: { name: 'Fibra 300' },
    status,
    statusReasonCode: null,
    statusChangedAt: null,
    titularAnonymizedAt: null,
    alias,
    installationAddress: null,
    installationCity: null,
    installationDepartment: null,
    installationPostalCode: null,
    installationNotes: null,
    customerSegment: null,
    serviceUsage: null,
    installationStratum: null,
    stratumEvidenceMediaId: null,
    vatSnapshot: null,
    additionalProductIds: [],
    additionalServiceIds: [],
    paymentMethod: null,
    billingCycle: null,
    fiscalName: null,
    fiscalDocument: null,
    fiscalAddress: null,
    startDate: null,
    endDate: null,
    createdAt: '2026-10-15T10:00:00.000Z',
    updatedAt: '2026-10-15T10:00:00.000Z',
    deletedAt: null,
  };
}

function previewFixture(
  overrides: Partial<LifecyclePreviewResponse> = {},
): LifecyclePreviewResponse {
  return {
    action: 'SUSPEND',
    affectedContracts: [
      { id: 'contract-1', fromStatus: 'ACTIVE', toStatus: 'SUSPENDED' },
      { id: 'contract-2', fromStatus: 'ACTIVE', toStatus: 'SUSPENDED' },
    ],
    subscriberStatus: { from: SubscriberStatus.ACTIVE, to: SubscriberStatus.SUSPENDED },
    hasLiveContracts: true,
    warnings: [],
    ...overrides,
  };
}

function renderDialog(
  contracts: Contract[] = [
    contractFixture('contract-1', 'Sede norte'),
    contractFixture('contract-2', 'Sede sur'),
  ],
  options: {
    action?: LifecycleAction;
    contractId?: string | null;
    onOpenChange?: (open: boolean) => void;
    onSuccess?: (action: LifecycleAction, affectedCount: number) => Promise<void> | void;
  } = {},
) {
  const onOpenChange = options.onOpenChange ?? jest.fn();
  const onSuccess = options.onSuccess ?? jest.fn();
  const { unmount } = render(
    <SubscriberLifecycleDialog
      open
      onOpenChange={onOpenChange}
      subscriberId="subscriber-1"
      contracts={contracts}
      action={options.action ?? 'SUSPEND'}
      {...(options.contractId !== undefined ? { contractId: options.contractId } : {})}
      onSuccess={onSuccess}
      onGoToServices={jest.fn()}
    />,
  );
  return { onOpenChange, onSuccess, unmount };
}

async function chooseReason(user: ReturnType<typeof userEvent.setup>, label = 'Mora en el pago') {
  await user.click(screen.getByRole('combobox', { name: 'Motivo *' }));
  await user.click(await screen.findByRole('option', { name: label }));
}

/**
 * Retiene los `requestAnimationFrame` hasta que el test decide ejecutarlos, y
 * respeta `cancelAnimationFrame`. Así se reproduce sin depender de la carga del
 * runner un frame de foco que llega tarde (CI de main, run 39282324929).
 */
function holdAnimationFrames() {
  const pending = new Map<number, FrameRequestCallback>();
  let nextId = 0;
  const rafSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    nextId += 1;
    pending.set(nextId, callback);
    return nextId;
  });
  const cancelSpy = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    pending.delete(id);
  });

  return {
    pendingCount() {
      return pending.size;
    },
    flush() {
      const callbacks = [...pending.values()];
      pending.clear();
      act(() => {
        callbacks.forEach((callback) => callback(0));
      });
    },
    restore() {
      rafSpy.mockRestore();
      cancelSpy.mockRestore();
    },
  };
}

describe('SubscriberLifecycleDialog · RF-LC-25..29', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('CA-LC-10: inicia con contratos elegibles seleccionados y exige una vista previa con action', async () => {
    const preview = jest
      .spyOn(subscribersApi, 'previewServices')
      .mockResolvedValue(previewFixture());
    jest.spyOn(subscribersApi, 'suspendServices').mockResolvedValue(undefined);
    const { onOpenChange, onSuccess } = renderDialog();
    const user = userEvent.setup();

    expect(screen.getByLabelText(/Sede norte/)).toBeChecked();
    expect(screen.getByLabelText(/Sede sur/)).toBeChecked();
    expect(screen.getByRole('button', { name: 'Ver vista previa' })).toBeDisabled();
    await chooseReason(user);
    await user.type(screen.getByRole('textbox', { name: 'Nota (opcional)' }), 'Pago pendiente');
    await user.click(screen.getByRole('button', { name: 'Ver vista previa' }));

    await screen.findByRole('heading', { name: 'Revisa el cambio' });
    expect(preview).toHaveBeenCalledWith('subscriber-1', {
      action: 'SUSPEND',
      reasonCode: 'MORA',
      note: 'Pago pendiente',
      contractIds: ['contract-1', 'contract-2'],
    });
    expect(screen.getByText('Se suspenderán 2 servicios.')).toBeInTheDocument();
    expect(screen.getByText('El suscriptor quedará Suspendido.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Suspender 2 servicios' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('SUSPEND', 2));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(subscribersApi.suspendServices).toHaveBeenCalledWith('subscriber-1', {
      reasonCode: 'MORA',
      note: 'Pago pendiente',
      contractIds: ['contract-1', 'contract-2'],
    });
  });

  it('muestra solo avisos devueltos por API y conserva la relación de equipos sin exponer IDs', async () => {
    jest.spyOn(subscribersApi, 'previewServices').mockResolvedValue(
      previewFixture({
        warnings: [
          { code: 'EQUIPMENT_ON_LOAN', contractIds: ['contract-2'] },
          { code: 'OPEN_WITHDRAWAL_ORDERS', contractIds: [] },
        ],
      }),
    );
    const user = userEvent.setup();
    renderDialog();
    await chooseReason(user);
    await user.click(screen.getByRole('button', { name: 'Ver vista previa' }));

    const equipmentCopy = await screen.findByText(
      'Este servicio tiene equipos en comodato. La terminación no los retira automáticamente.',
    );
    const equipmentAlert = equipmentCopy.closest('[role="status"]');
    expect(equipmentAlert).not.toBeNull();
    expect(
      within(equipmentAlert as HTMLElement).getByText(/Servicios relacionados: Sede sur/),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Hay órdenes de retiro abiertas. Debes gestionarlas por separado.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('contract-2')).not.toBeInTheDocument();
  });

  it('el cambio de nota invalida la vista previa y obliga a calcularla de nuevo', async () => {
    const preview = jest
      .spyOn(subscribersApi, 'previewServices')
      .mockResolvedValue(previewFixture());
    const user = userEvent.setup();
    renderDialog();
    await chooseReason(user);
    await user.click(screen.getByRole('button', { name: 'Ver vista previa' }));
    await screen.findByRole('heading', { name: 'Revisa el cambio' });
    await user.click(screen.getByRole('button', { name: 'Volver' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nota (opcional)' }), {
      target: { value: 'Cambio de detalle' },
    });

    expect(screen.queryByRole('heading', { name: 'Revisa el cambio' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver vista previa' })).toBeEnabled();
    expect(preview).toHaveBeenCalledTimes(1);
  });

  it('muestra el estado de carga mientras calcula la vista previa y bloquea otra solicitud', async () => {
    let resolvePreview: (response: LifecyclePreviewResponse) => void = () => undefined;
    const preview = jest.spyOn(subscribersApi, 'previewServices').mockReturnValue(
      new Promise<LifecyclePreviewResponse>((resolve) => {
        resolvePreview = resolve;
      }),
    );
    const user = userEvent.setup();
    renderDialog();
    await chooseReason(user);
    await user.click(screen.getByRole('button', { name: 'Ver vista previa' }));

    const loadingMessage = await screen.findByText('Calculando la vista previa…');
    expect(loadingMessage.closest('[aria-busy="true"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ver vista previa' })).toBeDisabled();
    expect(preview).toHaveBeenCalledTimes(1);

    resolvePreview(previewFixture());
    expect(await screen.findByText('Se suspenderán 2 servicios.')).toBeInTheDocument();
  });

  it('no permite aplicar una vista previa vacía y ofrece volver a editar', async () => {
    jest.spyOn(subscribersApi, 'previewServices').mockResolvedValue(
      previewFixture({
        affectedContracts: [],
        subscriberStatus: {
          from: SubscriberStatus.ACTIVE,
          to: SubscriberStatus.ACTIVE,
        },
      }),
    );
    const user = userEvent.setup();
    renderDialog();
    await chooseReason(user);
    await user.click(screen.getByRole('button', { name: 'Ver vista previa' }));

    expect(await screen.findByText('No hay cambios para aplicar.')).toBeInTheDocument();
    expect(
      screen.getByText('Revisa los servicios seleccionados y vuelve a intentarlo.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Volver a editar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suspender 2 servicios' })).not.toBeInTheDocument();
  });

  it('presenta el error de vista previa y permite reintentar con los datos conservados', async () => {
    jest
      .spyOn(subscribersApi, 'previewServices')
      .mockRejectedValueOnce(
        new ApiError(500, 'PREVIEW_FAILED', 'No se pudieron evaluar los servicios.'),
      )
      .mockResolvedValueOnce(previewFixture());
    const user = userEvent.setup();
    renderDialog();
    await chooseReason(user);
    await user.click(screen.getByRole('button', { name: 'Ver vista previa' }));

    expect(await screen.findByText('No pudimos cargar la vista previa')).toBeInTheDocument();
    expect(screen.getByText('No se pudieron evaluar los servicios.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar vista previa' })).toBeEnabled();
    expect(screen.getByRole('combobox', { name: 'Motivo *' })).toHaveTextContent('Mora en el pago');

    await user.click(screen.getByRole('button', { name: 'Reintentar vista previa' }));
    expect(await screen.findByText('Se suspenderán 2 servicios.')).toBeInTheDocument();
  });

  it('explica el 409 de suscriptor cancelado al reactivar y no expone el código', async () => {
    const preview: LifecyclePreviewResponse = {
      action: 'REACTIVATE',
      affectedContracts: [{ id: 'contract-1', fromStatus: 'SUSPENDED', toStatus: 'ACTIVE' }],
      subscriberStatus: { from: SubscriberStatus.SUSPENDED, to: SubscriberStatus.ACTIVE },
      hasLiveContracts: true,
      warnings: [],
    };
    jest.spyOn(subscribersApi, 'previewServices').mockResolvedValue(preview);
    jest
      .spyOn(contractsApi, 'reactivate')
      .mockRejectedValue(
        new ApiError(409, 'SUBSCRIBER_CANCELLED', 'SUBSCRIBER_CANCELLED_SENTINEL'),
      );
    const user = userEvent.setup();
    renderDialog([contractFixture('contract-1', 'Sede norte', 'SUSPENDED')], {
      action: 'REACTIVATE',
      contractId: 'contract-1',
    });
    await chooseReason(user, 'Pago registrado');
    await user.click(screen.getByRole('button', { name: 'Ver vista previa' }));
    await screen.findByText('Se reactivarán 1 servicio.');
    await user.click(screen.getByRole('button', { name: 'Reactivar 1 servicio' }));

    expect(await screen.findByText('No puedes crear ni activar servicios')).toBeInTheDocument();
    expect(
      screen.getByText('No puedes crear ni activar servicios para un suscriptor cancelado.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('SUBSCRIBER_CANCELLED_SENTINEL')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeInTheDocument();
  });

  it('protege el diálogo ante cierres durante la aplicación y lo cierra solo al recibir éxito', async () => {
    let resolveApply: () => void = () => undefined;
    const onOpenChange = jest.fn();
    jest.spyOn(subscribersApi, 'previewServices').mockResolvedValue(previewFixture());
    jest.spyOn(subscribersApi, 'suspendServices').mockReturnValue(
      new Promise<void>((resolve) => {
        resolveApply = resolve;
      }),
    );
    const user = userEvent.setup();
    renderDialog(undefined, { onOpenChange });
    await chooseReason(user);
    await user.click(screen.getByRole('button', { name: 'Ver vista previa' }));
    await screen.findByRole('button', { name: 'Suspender 2 servicios' });
    await user.click(screen.getByRole('button', { name: 'Suspender 2 servicios' }));

    expect(await screen.findByRole('button', { name: 'Suspendiendo…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cerrar diálogo' })).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Revisa el cambio' })).toBeInTheDocument();

    resolveApply();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('reactiva el servicio seleccionado desde el flujo de dos pasos', async () => {
    const preview: LifecyclePreviewResponse = {
      action: 'REACTIVATE',
      affectedContracts: [{ id: 'contract-1', fromStatus: 'SUSPENDED', toStatus: 'ACTIVE' }],
      subscriberStatus: { from: SubscriberStatus.SUSPENDED, to: SubscriberStatus.ACTIVE },
      hasLiveContracts: true,
      warnings: [],
    };
    const previewRequest = jest.spyOn(subscribersApi, 'previewServices').mockResolvedValue(preview);
    const reactivate = jest
      .spyOn(contractsApi, 'reactivate')
      .mockResolvedValue(contractFixture('contract-1', 'Sede norte', 'ACTIVE'));
    const onSuccess = jest.fn();
    const user = userEvent.setup();
    renderDialog(
      [
        contractFixture('contract-1', 'Sede norte', 'SUSPENDED'),
        contractFixture('contract-2', 'Sede sur', 'SUSPENDED'),
      ],
      { action: 'REACTIVATE', contractId: 'contract-1', onSuccess },
    );
    await chooseReason(user, 'Pago registrado');
    await user.click(screen.getByRole('button', { name: 'Ver vista previa' }));
    await screen.findByText('Se reactivarán 1 servicio.');
    await user.click(screen.getByRole('button', { name: 'Reactivar 1 servicio' }));

    expect(previewRequest).toHaveBeenCalledWith('subscriber-1', {
      action: 'REACTIVATE',
      reasonCode: 'PAGO_REGISTRADO',
      contractIds: ['contract-1'],
    });
    expect(reactivate).toHaveBeenCalledWith('contract-1', { reasonCode: 'PAGO_REGISTRADO' });
    expect(onSuccess).toHaveBeenCalledWith('REACTIVATE', 1);
  });

  it('termina el servicio seleccionado usando motivo y vista previa', async () => {
    const preview: LifecyclePreviewResponse = {
      action: 'TERMINATE',
      affectedContracts: [{ id: 'contract-1', fromStatus: 'ACTIVE', toStatus: 'TERMINATED' }],
      subscriberStatus: { from: SubscriberStatus.ACTIVE, to: SubscriberStatus.ACTIVE },
      hasLiveContracts: false,
      warnings: [],
    };
    const previewRequest = jest.spyOn(subscribersApi, 'previewServices').mockResolvedValue(preview);
    const terminate = jest
      .spyOn(contractsApi, 'terminate')
      .mockResolvedValue(contractFixture('contract-1', 'Sede norte', 'TERMINATED'));
    const user = userEvent.setup();
    renderDialog([contractFixture('contract-1', 'Sede norte')], {
      action: 'TERMINATE',
      contractId: 'contract-1',
    });
    await chooseReason(user, 'Servicio duplicado');
    await user.click(screen.getByRole('button', { name: 'Ver vista previa' }));
    await screen.findByText('Se terminará 1 servicio.');
    await user.click(screen.getByRole('button', { name: 'Terminar servicio' }));

    expect(previewRequest).toHaveBeenCalledWith('subscriber-1', {
      action: 'TERMINATE',
      reasonCode: 'DUPLICADO',
      contractIds: ['contract-1'],
    });
    expect(terminate).toHaveBeenCalledWith('contract-1', {
      reasonCode: 'DUPLICADO',
      contractIds: ['contract-1'],
    });
  });

  describe('foco al cambiar de paso', () => {
    it('un frame pendiente de un diálogo desmontado no cierra el motivo del diálogo siguiente', async () => {
      const frames = holdAnimationFrames();
      jest.spyOn(subscribersApi, 'previewServices').mockResolvedValue(previewFixture());
      const user = userEvent.setup();

      // Diálogo anterior: pasa a la vista previa y deja programado el foco del
      // cambio de paso sin ejecutarlo, como cuando el runner va cargado.
      const first = renderDialog();
      frames.flush();
      await chooseReason(user);
      await user.click(screen.getByRole('button', { name: 'Ver vista previa' }));
      await screen.findByRole('heading', { name: 'Revisa el cambio' });
      expect(frames.pendingCount()).toBe(1);
      first.unmount();
      // Desmontar cancela el frame del cambio de paso: no queda nada que caiga
      // sobre el diálogo siguiente.
      expect(frames.pendingCount()).toBe(0);

      // Diálogo nuevo: el operador abre el motivo antes de que llegue ese frame.
      renderDialog();
      const reason = screen.getByRole('combobox', { name: 'Motivo *' });
      await user.click(reason);
      expect(await screen.findByRole('option', { name: 'Mora en el pago' })).toBeInTheDocument();

      frames.flush();

      expect(reason).toHaveFocus();
      expect(reason).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('option', { name: 'Mora en el pago' })).toBeInTheDocument();
      frames.restore();
    });

    it('no le quita el foco al motivo si el operador lo abre antes del frame al volver a editar', async () => {
      const frames = holdAnimationFrames();
      jest.spyOn(subscribersApi, 'previewServices').mockResolvedValue(previewFixture());
      const user = userEvent.setup();
      renderDialog();
      frames.flush();
      await chooseReason(user);
      await user.click(screen.getByRole('button', { name: 'Ver vista previa' }));
      await screen.findByRole('heading', { name: 'Revisa el cambio' });
      await user.click(screen.getByRole('button', { name: 'Volver' }));

      const reason = screen.getByRole('combobox', { name: 'Motivo *' });
      await user.click(reason);
      expect(await screen.findByRole('option', { name: 'Mora en el pago' })).toBeInTheDocument();

      frames.flush();

      expect(reason).toHaveFocus();
      expect(reason).toHaveAttribute('aria-expanded', 'true');
      frames.restore();
    });

    it('lleva el foco al título del paso cuando nadie lo reclamó', async () => {
      const frames = holdAnimationFrames();
      jest.spyOn(subscribersApi, 'previewServices').mockResolvedValue(previewFixture());
      const user = userEvent.setup();
      renderDialog();
      frames.flush();
      await chooseReason(user);
      await user.click(screen.getByRole('button', { name: 'Ver vista previa' }));
      const reviewTitle = await screen.findByRole('heading', { name: 'Revisa el cambio' });

      frames.flush();
      expect(reviewTitle).toHaveFocus();

      await user.click(screen.getByRole('button', { name: 'Volver' }));
      frames.flush();
      expect(screen.getByRole('heading', { name: 'Suspender servicios' })).toHaveFocus();
      frames.restore();
    });
  });
});
