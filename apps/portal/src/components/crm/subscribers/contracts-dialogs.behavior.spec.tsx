import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ServiceUsage } from '@iwana/shared';
import type { Contract, PlanCatalogItem, Subscriber360Response } from '@/lib/api-client';
import { ApiError, commercialApi, contractsApi } from '@/lib/api-client';
import { ContractDetailDrawer } from './ContractDetailDrawer';
import { ConvertExpedienteToContractDialog } from './ConvertExpedienteToContractDialog';
import { CreateContractDialog } from './CreateContractDialog';

const CONTRACT: Contract = {
  id: 'contract-1',
  tenantId: 'tenant-test',
  quoteId: null,
  subscriberId: 'subscriber-test',
  planId: 'plan-1',
  planSnapshotJson: { name: 'Fibra 300', downloadSpeedMbps: 300, uploadSpeedMbps: 100 },
  status: 'ACTIVE',
  statusReasonCode: null,
  statusChangedAt: null,
  titularAnonymizedAt: null,
  alias: 'Sede principal',
  installationAddress: 'Calle 1 # 2-3',
  installationCity: 'Bogotá',
  installationDepartment: 'Cundinamarca',
  installationPostalCode: '110111',
  installationNotes: null,
  customerSegment: null,
  serviceUsage: ServiceUsage.RESIDENTIAL,
  installationStratum: 2,
  stratumEvidenceMediaId: null,
  vatSnapshot: null,
  additionalProductIds: [],
  additionalServiceIds: [],
  paymentMethod: 'PSE',
  billingCycle: 'Mensual',
  fiscalName: null,
  fiscalDocument: null,
  fiscalAddress: null,
  startDate: null,
  endDate: null,
  createdAt: '2026-10-12T12:00:00.000Z',
  updatedAt: '2026-10-12T12:00:00.000Z',
  deletedAt: null,
};

const EXPEDIENTE: NonNullable<Subscriber360Response['expedienteSummary']> = {
  id: 'exp-1',
  fullName: 'Prospecto de prueba',
  status: 'QUALIFIED',
  source: null,
  createdAt: '2026-10-01T10:00:00.000Z',
  statusChangedAt: null,
  paymentMethod: null,
  billingCycle: null,
  fiscalName: null,
  interestedPlanId: null,
  additionalProductIds: [],
  additionalServiceIds: [],
  commercialNotes: null,
};

const PLAN = {
  id: 'plan-1',
  name: 'Fibra 300',
  technology: 'FTTH',
  installationRule: 'ALWAYS',
  downloadSpeedMbps: 300,
  uploadSpeedMbps: 100,
  basePrice: 99000,
  installationFee: 0,
  currentPrice: '99000',
  vatConcept: null,
  networkType: 'FIXED',
  isActive: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
} as PlanCatalogItem;

async function chooseOption(label: string, option: string) {
  fireEvent.click(screen.getByRole('combobox', { name: label }));
  fireEvent.click(await screen.findByRole('option', { name: option }));
}

function renderDrawer(
  contract: Contract = CONTRACT,
  props: Partial<React.ComponentProps<typeof ContractDetailDrawer>> = {},
) {
  const onClose = props.onClose ?? jest.fn();
  const onReload = props.onReload ?? jest.fn(async () => undefined);
  return {
    onClose,
    onReload,
    ...render(
      <ContractDetailDrawer contract={contract} onClose={onClose} onReload={onReload} {...props} />,
    ),
  };
}

describe('ContractDetailDrawer — edición y transiciones', () => {
  afterEach(() => jest.restoreAllMocks());

  it('exige uso y estrato antes de actualizar el punto de servicio', async () => {
    const updateServicePoint = jest.spyOn(contractsApi, 'updateServicePoint');
    renderDrawer({ ...CONTRACT, serviceUsage: null, installationStratum: null });

    fireEvent.click(screen.getByRole('button', { name: 'Actualizar punto de servicio' }));
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar punto de servicio' }));
    expect(
      await screen.findByText('Selecciona el uso del servicio para actualizar el contrato.'),
    ).toBeInTheDocument();
    expect(updateServicePoint).not.toHaveBeenCalled();

    await chooseOption('Uso del servicio', 'Residencial');
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar punto de servicio' }));
    expect(
      await screen.findByText('Selecciona el estrato del predio de instalación.'),
    ).toBeInTheDocument();
    expect(updateServicePoint).not.toHaveBeenCalled();
  });

  it('muestra el error de validación del servicio y permite cancelar sin cambiar el contrato', async () => {
    const updateServicePoint = jest
      .spyOn(contractsApi, 'updateServicePoint')
      .mockRejectedValue(new ApiError(422, 'VALIDATION_ERROR', 'serviceUsage no válido'));
    renderDrawer();

    fireEvent.click(screen.getByRole('button', { name: 'Actualizar punto de servicio' }));
    await chooseOption('Uso del servicio', 'No residencial');
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar punto de servicio' }));

    expect(
      await screen.findByText('Selecciona el uso del servicio para continuar.'),
    ).toBeInTheDocument();
    expect(updateServicePoint).toHaveBeenCalledWith('contract-1', {
      serviceUsage: ServiceUsage.NON_RESIDENTIAL,
      installationStratum: null,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByText('Residencial')).toBeInTheDocument();
    expect(screen.queryByText('Selecciona el uso del servicio para continuar.')).toBeNull();
  });

  it('cancela una edición general y vuelve a mostrar los valores guardados', () => {
    renderDrawer();
    fireEvent.click(screen.getByRole('button', { name: 'Editar contrato' }));
    fireEvent.change(screen.getByDisplayValue('Sede principal'), {
      target: { value: 'Alias sin guardar' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.getByRole('heading', { name: 'Sede principal' })).toBeInTheDocument();
    expect(screen.queryByText('Alias sin guardar')).toBeNull();
  });

  it('muestra la restricción de mora al intentar activar y deja el contrato como borrador', async () => {
    jest
      .spyOn(contractsApi, 'activate')
      .mockRejectedValue(
        new ApiError(409, 'SUBSCRIBER_SUSPENDED_FOR_DELINQUENCY', 'Activación no permitida'),
      );
    renderDrawer({ ...CONTRACT, status: 'DRAFT' });

    fireEvent.click(screen.getByRole('button', { name: 'Activar' }));

    expect(await screen.findByText('No puedes activar este servicio')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dejar como borrador' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dejar como borrador' }));
    expect(screen.queryByText('No puedes activar este servicio')).toBeNull();
    expect(screen.getByRole('button', { name: 'Editar contrato' })).toBeInTheDocument();
  });

  it('archiva un contrato suspendido después de recargar y cerrar el panel', async () => {
    const archive = jest.spyOn(contractsApi, 'archive').mockResolvedValue(CONTRACT);
    const onClose = jest.fn();
    const onReload = jest.fn(async () => undefined);
    renderDrawer({ ...CONTRACT, status: 'SUSPENDED' }, { onClose, onReload });

    fireEvent.click(screen.getByRole('button', { name: 'Archivar' }));

    await waitFor(() => expect(archive).toHaveBeenCalledWith(CONTRACT.id));
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('permite eliminar un borrador desde el detalle', async () => {
    const onRemove = jest.fn(async () => undefined);
    const onClose = jest.fn();
    renderDrawer({ ...CONTRACT, status: 'DRAFT' }, { onRemove, onClose });

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar borrador' }));

    await waitFor(() => expect(onRemove).toHaveBeenCalledWith(CONTRACT.id));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ConvertExpedienteToContractDialog — búsqueda y validación', () => {
  afterEach(() => jest.restoreAllMocks());

  it('valida estrato residencial antes de convertir', async () => {
    const createFromExpediente = jest.spyOn(contractsApi, 'createFromExpediente');
    render(
      <ConvertExpedienteToContractDialog
        subscriberId="subscriber-test"
        expedienteSummary={EXPEDIENTE}
        onClose={jest.fn()}
        onSuccess={jest.fn(async () => undefined)}
      />,
    );

    await chooseOption('Uso del servicio', 'Residencial');
    fireEvent.click(screen.getByRole('button', { name: 'Convertir a contrato' }));

    expect(
      await screen.findByText('Selecciona el estrato del predio de instalación.'),
    ).toBeInTheDocument();
    expect(createFromExpediente).not.toHaveBeenCalled();
  });

  it('carga el nombre del plan de interés y presenta un error recuperable si falla la conversión', async () => {
    jest.spyOn(commercialApi, 'getPlanById').mockResolvedValue(PLAN);
    jest
      .spyOn(contractsApi, 'createFromExpediente')
      .mockRejectedValue(new Error('network failure'));
    const expediente = { ...EXPEDIENTE, interestedPlanId: 'plan-1' };
    render(
      <ConvertExpedienteToContractDialog
        subscriberId="subscriber-test"
        expedienteSummary={expediente}
        onClose={jest.fn()}
        onSuccess={jest.fn(async () => undefined)}
      />,
    );

    await waitFor(() => expect(commercialApi.getPlanById).toHaveBeenCalledWith('plan-1'));
    fireEvent.click(screen.getByRole('button', { name: 'Convertir a contrato' }));

    expect(await screen.findByText('No fue posible convertir la oportunidad.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Convertir a contrato' })).toBeEnabled();
  });
});

describe('CreateContractDialog — selección y guardado', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('permite agregar complementos al contrato y envía sus identificadores al crear', async () => {
    jest.useFakeTimers();
    jest.spyOn(commercialApi, 'searchPlansForPicker').mockResolvedValue({
      data: [{ id: 'plan-1', label: 'Fibra 300', sublabel: 'FTTH' }],
      total: 1,
    });
    jest.spyOn(commercialApi, 'getPlanById').mockResolvedValue(PLAN);
    jest.spyOn(commercialApi, 'searchAdditionalProductsForPicker').mockResolvedValue({
      data: [{ id: 'product-1', label: 'Router Wi-Fi', sublabel: 'Equipo' }],
      total: 1,
    });
    jest.spyOn(commercialApi, 'searchAdditionalServicesForPicker').mockResolvedValue({
      data: [{ id: 'service-1', label: 'Soporte prioritario', sublabel: 'Asistencia' }],
      total: 1,
    });
    const create = jest.spyOn(contractsApi, 'createForSubscriber').mockResolvedValue(CONTRACT);
    const onSuccess = jest.fn(async () => undefined);
    render(
      <CreateContractDialog
        subscriberId="subscriber-test"
        onClose={jest.fn()}
        onSuccess={onSuccess}
      />,
    );

    const planPicker = screen.getByRole('combobox', { name: /^Plan/ });
    fireEvent.change(planPicker, { target: { value: 'Fi' } });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    fireEvent.click(screen.getByRole('option', { name: /Fibra 300/ }));
    await waitFor(() => expect(commercialApi.getPlanById).toHaveBeenCalledWith('plan-1'));

    const productPicker = screen.getByRole('combobox', { name: 'Productos adicionales' });
    fireEvent.change(productPicker, { target: { value: 'Router' } });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    fireEvent.click(screen.getByRole('option', { name: /Router Wi-Fi/ }));

    const servicePicker = screen.getByRole('combobox', { name: 'Servicios adicionales' });
    fireEvent.change(servicePicker, { target: { value: 'Soporte' } });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    fireEvent.click(screen.getByRole('option', { name: /Soporte prioritario/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Crear servicio en borrador' }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledWith(
      'subscriber-test',
      expect.objectContaining({
        planId: 'plan-1',
        additionalProductIds: ['product-1'],
        additionalServiceIds: ['service-1'],
      }),
    );
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('muestra el error de uso devuelto por el alta y conserva el formulario', async () => {
    jest.useFakeTimers();
    jest.spyOn(commercialApi, 'searchPlansForPicker').mockResolvedValue({
      data: [{ id: 'plan-1', label: 'Fibra 300', sublabel: 'FTTH' }],
      total: 1,
    });
    jest.spyOn(commercialApi, 'getPlanById').mockResolvedValue(PLAN);
    jest
      .spyOn(contractsApi, 'createForSubscriber')
      .mockRejectedValue(new ApiError(422, 'VALIDATION_ERROR', 'serviceUsage no válido'));
    render(
      <CreateContractDialog
        subscriberId="subscriber-test"
        onClose={jest.fn()}
        onSuccess={jest.fn(async () => undefined)}
      />,
    );

    fireEvent.change(screen.getByRole('combobox', { name: /^Plan/ }), {
      target: { value: 'Fi' },
    });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    fireEvent.click(screen.getByRole('option', { name: /Fibra 300/ }));
    await waitFor(() => expect(commercialApi.getPlanById).toHaveBeenCalledWith('plan-1'));
    await chooseOption('Uso del servicio', 'No residencial');
    fireEvent.click(screen.getByRole('button', { name: 'Crear servicio en borrador' }));

    expect(
      await screen.findByText('Selecciona el uso del servicio para continuar.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear servicio en borrador' })).toBeEnabled();
  });
});
