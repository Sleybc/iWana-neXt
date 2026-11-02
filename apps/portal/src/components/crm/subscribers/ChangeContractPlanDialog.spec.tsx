import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { CustomerSegment, ServiceUsage } from '@iwana/shared';
import type { Contract, PlanCatalogItem } from '@/lib/api-client';
import { ApiError, commercialApi, contractsApi } from '@/lib/api-client';
import { ChangeContractPlanDialog, ContractPlanSummary } from './ChangeContractPlanDialog';
import { ContractDetailDrawer } from './ContractDetailDrawer';

function buildContract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'contract-1',
    tenantId: 'tenant-test',
    quoteId: null,
    subscriberId: 'subscriber-test',
    planId: 'plan-1',
    planSnapshotJson: {
      name: 'Fibra 300',
      technology: 'FTTH',
      basePrice: 75000,
      downloadSpeedMbps: 300,
      uploadSpeedMbps: 100,
    },
    status: 'DRAFT',
    statusReasonCode: null,
    statusChangedAt: null,
    titularAnonymizedAt: null,
    alias: 'Sede principal',
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
    billingCycleDay: null,
    billingCycle: 'Mensual',
    fiscalName: null,
    fiscalDocument: null,
    fiscalAddress: null,
    startDate: null,
    endDate: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}
function buildPlan(overrides: Partial<PlanCatalogItem> = {}): PlanCatalogItem {
  return {
    id: 'plan-2',
    name: 'Fibra 600',
    technology: 'FTTH',
    installationRule: 'FIBER',
    downloadSpeedMbps: 600,
    uploadSpeedMbps: 300,
    basePrice: 95000,
    installationFee: 0,
    isActive: true,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  } as PlanCatalogItem;
}
function setupDialog(contract = buildContract()) {
  const onClose = jest.fn();
  const onUpdated = jest.fn();
  render(
    <ChangeContractPlanDialog
      contract={contract}
      customerSegment={CustomerSegment.CORPORATE}
      onClose={onClose}
      onUpdated={onUpdated}
    />,
  );
  return { onClose, onUpdated };
}
async function choosePlan() {
  const picker = screen.getByRole('combobox', { name: 'Nuevo plan' });
  fireEvent.focus(picker);
  fireEvent.change(picker, { target: { value: 'Fibra' } });
  fireEvent.click(await screen.findByRole('option', { name: /Fibra 600/ }));
}
function confirmButton() {
  return screen.getByRole('button', { name: 'Confirmar cambio de plan' });
}

describe('Cambio de plan del contrato', () => {
  beforeEach(() => {
    jest
      .spyOn(commercialApi, 'searchPlansForPicker')
      .mockResolvedValue({ data: [{ id: 'plan-2', label: 'Fibra 600' }], total: 1 });
    jest.spyOn(commercialApi, 'getPlanById').mockResolvedValue(buildPlan());
    jest.spyOn(commercialApi, 'getPlanPrice').mockResolvedValue({ basePrice: '105000.00' });
    jest.spyOn(contractsApi, 'changePlan').mockResolvedValue(
      buildContract({
        planId: 'plan-2',
        planSnapshotJson: {
          name: 'Fibra 600',
          technology: 'FTTH',
          basePrice: 105000,
          downloadSpeedMbps: 600,
          uploadSpeedMbps: 300,
        },
        updatedAt: '2026-10-30T15:00:00.000Z',
      }),
    );
  });
  afterEach(() => jest.restoreAllMocks());

  it('apila el panel sobre su velo para que el diálogo reciba interacción', () => {
    setupDialog();
    // El velo de ModalLayer es absoluto y precede al panel en el DOM: sin
    // posición propia, el panel pinta debajo y ningún clic lo alcanza.
    expect(screen.getByRole('dialog', { name: 'Cambiar plan' })).toHaveClass('relative');
  });

  it('precarga el plan contratado, bloquea el mismo plan y cancelar no modifica el servidor', () => {
    const { onClose } = setupDialog();
    expect(screen.getByRole('combobox', { name: 'Nuevo plan' })).toHaveValue('Fibra 300');
    expect(confirmButton()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalled();
    expect(contractsApi.changePlan).not.toHaveBeenCalled();
  });
  it('actualiza la precarga cuando el nombre contratado se resuelve desde catálogo', async () => {
    jest
      .spyOn(commercialApi, 'getPlanById')
      .mockResolvedValue(buildPlan({ id: 'plan-1', name: 'Plan contratado sintético' }));
    setupDialog(buildContract({ planSnapshotJson: {} }));
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Nuevo plan' })).toHaveValue(
        'Plan contratado sintético',
      ),
    );
    expect(confirmButton()).toBeDisabled();
    expect(contractsApi.changePlan).not.toHaveBeenCalled();
  });
  it.each(['XGS-PON', 'N/A', undefined])('no expone la tecnología técnica %s', (technology) => {
    render(
      <ContractPlanSummary
        plan={{
          name: 'Plan sintético',
          technology,
          price: 75000,
          downloadSpeedMbps: 100,
          uploadSpeedMbps: 50,
        }}
      />,
    );
    expect(screen.getByText('Tecnología no especificada')).toBeInTheDocument();
    if (technology)
      expect(screen.queryByText(technology, { exact: false })).not.toBeInTheDocument();
  });
  it('compara el snapshot conservado y la tarifa del segmento antes de enviar la versión y precio revisados', async () => {
    const { onUpdated } = setupDialog();
    await choosePlan();
    await waitFor(() => expect(confirmButton()).toBeEnabled());
    expect(screen.getByText('Plan actual')).toBeInTheDocument();
    expect(screen.getByText('Plan seleccionado')).toBeInTheDocument();
    expect(screen.getByText(/75[.,]000/)).toBeInTheDocument();
    expect(screen.getByText(/105[.,]000/)).toBeInTheDocument();
    expect(screen.getByLabelText('Bajada: 600 Mbps. Subida: 300 Mbps')).toBeInTheDocument();
    expect(commercialApi.getPlanPrice).toHaveBeenCalledWith('plan-2', CustomerSegment.CORPORATE);
    fireEvent.click(confirmButton());
    await waitFor(() =>
      expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ planId: 'plan-2' }), true),
    );
    expect(contractsApi.changePlan).toHaveBeenCalledWith('contract-1', {
      planId: 'plan-2',
      expectedUpdatedAt: '2026-10-01T10:00:00.000Z',
      expectedMonthlyPrice: 105000,
    });
  });
  it('mantiene deshabilitada la confirmación hasta resolver el detalle', async () => {
    let resolvePlan!: (value: PlanCatalogItem) => void;
    jest.spyOn(commercialApi, 'getPlanById').mockReturnValue(
      new Promise((resolve) => {
        resolvePlan = resolve;
      }),
    );
    setupDialog();
    await choosePlan();
    expect(confirmButton()).toBeDisabled();
    expect(screen.getByRole('status', { name: 'Cargando detalle del plan' })).toBeInTheDocument();
    await act(async () => resolvePlan(buildPlan()));
    await waitFor(() => expect(confirmButton()).toBeEnabled());
  });
  it('preserva la selección ante error de detalle y permite reintentar', async () => {
    jest
      .spyOn(commercialApi, 'getPlanById')
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValue(buildPlan());
    setupDialog();
    await choosePlan();
    expect(
      await screen.findByText('No fue posible cargar el plan seleccionado'),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Nuevo plan' })).toHaveValue('Fibra 600');
    expect(screen.getByText('Fibra 300')).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(confirmButton()).toBeEnabled());
  });
  it('no permite confirmar un plan sin tarifa para el segmento', async () => {
    jest
      .spyOn(commercialApi, 'getPlanPrice')
      .mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'No disponible'));
    setupDialog();
    await choosePlan();
    expect(
      await screen.findByText('Este plan no tiene una tarifa vigente. Elige otro.'),
    ).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });
  it('conserva la selección cuando falla el guardado y permite confirmar nuevamente', async () => {
    jest
      .spyOn(contractsApi, 'changePlan')
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValue(buildContract({ planId: 'plan-2' }));
    const { onUpdated } = setupDialog();
    await choosePlan();
    await waitFor(() => expect(confirmButton()).toBeEnabled());
    fireEvent.click(confirmButton());
    expect(await screen.findByText(/Reintenta conservando tu selección/)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Nuevo plan' })).toHaveValue('Fibra 600');
    fireEvent.click(confirmButton());
    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
  });
  it('bloquea una versión obsoleta y recarga únicamente por acción explícita', async () => {
    jest
      .spyOn(contractsApi, 'changePlan')
      .mockRejectedValue(new ApiError(409, 'CONTRACT_CHANGED', 'Contrato actualizado'));
    const get = jest
      .spyOn(contractsApi, 'getById')
      .mockResolvedValue(buildContract({ updatedAt: '2026-10-30T15:00:00.000Z' }));
    const { onUpdated, onClose } = setupDialog();
    await choosePlan();
    await waitFor(() => expect(confirmButton()).toBeEnabled());
    fireEvent.click(confirmButton());
    expect(await screen.findByText(/El contrato cambió mientras/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(confirmButton()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar datos del contrato' }));
    await waitFor(() =>
      expect(onUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ updatedAt: '2026-10-30T15:00:00.000Z' }),
        false,
      ),
    );
  });
  it('requiere revisar el nuevo precio después de un cambio concurrente de tarifa', async () => {
    jest
      .spyOn(contractsApi, 'changePlan')
      .mockRejectedValueOnce(new ApiError(409, 'PLAN_PRICE_CHANGED', 'Tarifa actualizada'));
    setupDialog();
    await choosePlan();
    await waitFor(() => expect(confirmButton()).toBeEnabled());
    fireEvent.click(confirmButton());
    expect(await screen.findByText(/La tarifa del plan cambió/)).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
    jest.spyOn(commercialApi, 'getPlanPrice').mockResolvedValue({ basePrice: '115000' });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar precio del plan' }));
    expect(await screen.findByText(/115[.,]000/)).toBeInTheDocument();
    await waitFor(() => expect(confirmButton()).toBeEnabled());
  });
  it('evita respuestas obsoletas del catálogo al limpiar una selección pendiente', async () => {
    let resolvePlan!: (value: PlanCatalogItem) => void;
    jest.spyOn(commercialApi, 'getPlanById').mockReturnValue(
      new Promise((resolve) => {
        resolvePlan = resolve;
      }),
    );
    setupDialog();
    await choosePlan();
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar selección' }));
    await act(async () => resolvePlan(buildPlan()));
    expect(screen.queryByText('Plan seleccionado')).not.toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });
  it('impide cambiar plan con campos pendientes y no guarda parcialmente', () => {
    const update = jest.spyOn(contractsApi, 'update');
    render(
      <ContractDetailDrawer
        contract={buildContract()}
        onClose={jest.fn()}
        onReload={jest.fn(async () => undefined)}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Editar contrato' }));
    expect(screen.getByRole('button', { name: 'Cambiar plan' })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Alias del servicio'), {
      target: { value: 'Otro servicio' },
    });
    expect(screen.getByRole('button', { name: 'Cambiar plan' })).toBeDisabled();
    expect(
      screen.getByText('Guarda o cancela los cambios pendientes antes de cambiar el plan.'),
    ).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
    expect(contractsApi.changePlan).not.toHaveBeenCalled();
  });
  it('actualiza drawer y tarjeta y anuncia el éxito sin guardar el formulario', async () => {
    const onUpdated = jest.fn(),
      onReload = jest.fn(async () => undefined),
      update = jest.spyOn(contractsApi, 'update');
    render(
      <ContractDetailDrawer
        contract={buildContract({ customerSegment: CustomerSegment.CORPORATE })}
        onClose={jest.fn()}
        onReload={onReload}
        onContractUpdated={onUpdated}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Editar contrato' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar plan' }));
    await choosePlan();
    await waitFor(() => expect(confirmButton()).toBeEnabled());
    fireEvent.click(confirmButton());
    await waitFor(() => expect(screen.getByText('Plan actualizado')).toBeInTheDocument());
    expect(screen.getByText('Fibra 600')).toBeInTheDocument();
    expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ planId: 'plan-2' }));
    expect(onReload).toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
  it.each(['SUSPENDED', 'TERMINATED'] as const)(
    'explica la restricción comercial en %s',
    (status) => {
      render(
        <ContractDetailDrawer
          contract={buildContract({ status })}
          onClose={jest.fn()}
          onReload={jest.fn(async () => undefined)}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Editar contrato' }));
      expect(screen.getByRole('button', { name: 'Cambiar plan' })).toBeDisabled();
      expect(
        screen.getByText('Solo puedes cambiar el plan de un contrato en borrador o activo.'),
      ).toBeInTheDocument();
    },
  );
});
