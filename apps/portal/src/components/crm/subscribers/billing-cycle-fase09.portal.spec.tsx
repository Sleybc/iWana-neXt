import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { ServiceUsage } from '@iwana/shared';
import type { BillingCycleOption, Contract, Subscriber360Response } from '@/lib/api-client';
import { ApiError, billingCyclesApi, commercialApi, contractsApi } from '@/lib/api-client';
import { ActivateServiceDialog } from './ActivateServiceDialog';
import { ContractDetailDrawer } from './ContractDetailDrawer';
import { CreateContractDialog } from './CreateContractDialog';
import { ServiciosTab } from './ServiciosTab';

const CYCLES: BillingCycleOption[] = [
  { cycleDay: 1, cutoffDay: 15, active: true, nextCutoffDate: '2026-11-15' },
  { cycleDay: 15, cutoffDay: 30, active: true, nextCutoffDate: '2026-10-30' },
];

const CONTRACT: Contract = {
  id: 'contract-1',
  tenantId: 'tenant-test',
  quoteId: null,
  subscriberId: 'subscriber-test',
  planId: 'plan-1',
  planSnapshotJson: { name: 'Fibra 300' },
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
};

function ActivationDialogHarness() {
  const [contract, setContract] = useState(CONTRACT);
  const [open, setOpen] = useState(true);

  return (
    <>
      <p>Estado del contrato: {contract.status === 'DRAFT' ? 'Borrador' : 'Activo'}</p>
      {open ? (
        <ActivateServiceDialog
          contract={contract}
          onClose={() => setOpen(false)}
          onSuccess={async () => setContract((current) => ({ ...current, status: 'ACTIVE' }))}
        />
      ) : null}
    </>
  );
}

describe('MOD05 Fase 09 — experiencia de ciclo de facturación', () => {
  it('devuelve el foco a la tarjeta activada aunque el filtro mostrara borradores', async () => {
    window.history.replaceState(null, '', '/dashboard/crm/subscribers/synthetic?estado=borradores');
    jest.spyOn(billingCyclesApi, 'list').mockResolvedValue(CYCLES);
    jest.spyOn(contractsApi, 'activate').mockResolvedValue({ ...CONTRACT, status: 'ACTIVE' });
    function Harness() {
      const [contract, setContract] = useState({ ...CONTRACT, billingCycleDay: 15 });
      return (
        <ServiciosTab
          subscriber360={
            {
              subscriber: { id: 'subscriber-test', privacyRestricted: false },
              contracts: [contract],
              expedienteSummary: null,
            } as unknown as Subscriber360Response
          }
          onReload={async () => setContract((current) => ({ ...current, status: 'ACTIVE' }))}
          onOpenLifecycle={jest.fn()}
        />
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Activar' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Activar servicio' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Activar servicio' }));
    await waitFor(() =>
      expect(document.getElementById('subscriber-contract-contract-1')).toHaveFocus(),
    );
    expect(screen.queryByRole('button', { name: 'Activar' })).not.toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get('estado')).toBeNull();
  });
  beforeEach(() => {
    jest.spyOn(commercialApi, 'getPlanById').mockResolvedValue({
      id: 'plan-1',
      name: 'Plan elegido del catálogo',
      downloadSpeedMbps: 500,
      uploadSpeedMbps: 250,
      basePrice: 85000,
    } as Awaited<ReturnType<typeof commercialApi.getPlanById>>);
  });
  afterEach(() => jest.restoreAllMocks());

  it('resuelve el plan elegido del contrato cuando la conversión no guardó su nombre', async () => {
    const getPlan = jest.spyOn(commercialApi, 'getPlanById').mockResolvedValue({
      id: 'plan-1',
      name: 'Plan elegido del catálogo',
      downloadSpeedMbps: 500,
      uploadSpeedMbps: 250,
      basePrice: 85000,
    } as Awaited<ReturnType<typeof commercialApi.getPlanById>>);
    render(
      <ContractDetailDrawer
        contract={{ ...CONTRACT, planSnapshotJson: { id: 'plan-1', source: 'expediente' } }}
        onClose={jest.fn()}
        onReload={jest.fn(async () => undefined)}
      />,
    );
    expect(await screen.findByText('Plan elegido del catálogo')).toBeInTheDocument();
    expect(getPlan).toHaveBeenCalledWith('plan-1');
    expect(screen.queryByText('plan-1')).not.toBeInTheDocument();
    expect(screen.getByText('↓ 500 Mbps · ↑ 250 Mbps')).toBeInTheDocument();
    expect(screen.getByText(/85[.,]000/)).toBeInTheDocument();
    expect(screen.getByText('Precio actual del plan')).toBeInTheDocument();
  });

  it('conserva el nombre contratado del snapshot sin sustituirlo por el catálogo actual', () => {
    const getPlan = jest.spyOn(commercialApi, 'getPlanById');
    render(
      <ContractDetailDrawer
        contract={{
          ...CONTRACT,
          planSnapshotJson: {
            name: 'Fibra 300',
            downloadSpeedMbps: 300,
            uploadSpeedMbps: 100,
            basePrice: 60000,
          },
        }}
        onClose={jest.fn()}
        onReload={jest.fn(async () => undefined)}
      />,
    );
    expect(screen.getByText('Fibra 300')).toBeInTheDocument();
    expect(screen.getByText('↓ 300 Mbps · ↑ 100 Mbps')).toBeInTheDocument();
    expect(screen.getByText(/60[.,]000/)).toBeInTheDocument();
    expect(getPlan).not.toHaveBeenCalled();
  });

  it('completa velocidad y precio aunque el snapshot ya tenga nombre', async () => {
    render(
      <ContractDetailDrawer
        contract={CONTRACT}
        onClose={jest.fn()}
        onReload={jest.fn(async () => undefined)}
      />,
    );
    expect(await screen.findByText('↓ 500 Mbps · ↑ 250 Mbps')).toBeInTheDocument();
    expect(screen.getByText('Fibra 300')).toBeInTheDocument();
    expect(screen.getByText(/85[.,]000/)).toBeInTheDocument();
  });

  it('no convierte un precio ausente en cero pesos', async () => {
    jest.spyOn(commercialApi, 'getPlanById').mockResolvedValue({
      id: 'plan-1',
      name: 'Plan sin tarifa',
      downloadSpeedMbps: 100,
      uploadSpeedMbps: 50,
      basePrice: null,
    } as Awaited<ReturnType<typeof commercialApi.getPlanById>>);
    render(
      <ContractDetailDrawer
        contract={CONTRACT}
        onClose={jest.fn()}
        onReload={jest.fn(async () => undefined)}
      />,
    );
    expect(await screen.findByText('Precio no disponible')).toBeInTheDocument();
    expect(screen.queryByText(/\$\s*0\s*\/mes/)).not.toBeInTheDocument();
  });

  it.each(['DRAFT', 'ACTIVE'] as const)(
    'guarda el ciclo del %s sin reenviar otros datos',
    async (status) => {
      const contract = { ...CONTRACT, status, serviceUsage: ServiceUsage.RESIDENTIAL };
      const update = jest.spyOn(contractsApi, 'update').mockResolvedValue({
        ...contract,
        billingCycleDay: 1,
      });
      render(
        <ContractDetailDrawer
          contract={contract}
          billingCycles={CYCLES}
          onClose={jest.fn()}
          onReload={jest.fn(async () => undefined)}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Editar contrato' }));
      fireEvent.click(screen.getByRole('combobox', { name: 'Ciclo de facturación' }));
      fireEvent.click(await screen.findByRole('option', { name: 'Día 1' }));
      fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
      await waitFor(() =>
        expect(update).toHaveBeenCalledWith('contract-1', { billingCycleDay: 1 }),
      );
      expect(
        await screen.findByText(status === 'ACTIVE' ? 'Ciclo: día 1' : 'Día 1'),
      ).toBeInTheDocument();
    },
  );

  it('muestra el rechazo de la API junto al botón de guardar', async () => {
    jest
      .spyOn(contractsApi, 'update')
      .mockRejectedValue(new ApiError(422, 'VALIDATION_ERROR', 'Revisa los datos del contrato.'));
    render(
      <ContractDetailDrawer
        contract={CONTRACT}
        billingCycles={CYCLES}
        onClose={jest.fn()}
        onReload={jest.fn(async () => undefined)}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Editar contrato' }));
    const save = screen.getByRole('button', { name: 'Guardar cambios' });
    fireEvent.click(save);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Revisa los datos del contrato.');
    expect(save.parentElement?.parentElement).toContainElement(alert);
    expect(save).toBeEnabled();
  });

  it('CA-CF-10 deja activar solo después de elegir ciclo y muestra la fecha recibida del catálogo', async () => {
    const listCycles = jest.spyOn(billingCyclesApi, 'list').mockResolvedValue(CYCLES);
    const activate = jest.spyOn(contractsApi, 'activate').mockResolvedValue({
      ...CONTRACT,
      status: 'ACTIVE',
      billingCycleDay: 15,
    });
    const onSuccess = jest.fn(async () => undefined);

    render(<ActivateServiceDialog contract={CONTRACT} onClose={jest.fn()} onSuccess={onSuccess} />);

    const confirm = screen.getByRole('button', { name: 'Activar servicio' });
    expect(confirm).toBeDisabled();

    const cycleSelect = await screen.findByRole('combobox', { name: 'Ciclo de facturación' });
    await waitFor(() => expect(listCycles).toHaveBeenCalledTimes(1));
    fireEvent.click(cycleSelect);
    fireEvent.click(await screen.findByRole('option', { name: 'Día 15' }));

    expect(screen.getByText('Próximo corte: 30 de octubre de 2026')).toBeInTheDocument();
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(activate).toHaveBeenCalledWith('contract-1', { billingCycleDay: 15 }),
    );
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('deja el contrato en borrador después del 409 de mora y permite cerrar el aviso', async () => {
    jest.spyOn(billingCyclesApi, 'list').mockResolvedValue(CYCLES);
    const activate = jest
      .spyOn(contractsApi, 'activate')
      .mockRejectedValue(
        new ApiError(
          409,
          'SUBSCRIBER_SUSPENDED_FOR_DELINQUENCY',
          'No puedes activar este servicio.',
        ),
      );
    render(<ActivationDialogHarness />);

    const cycleSelect = await screen.findByRole('combobox', { name: 'Ciclo de facturación' });
    await waitFor(() => expect(cycleSelect).toBeEnabled());
    fireEvent.click(cycleSelect);
    fireEvent.click(await screen.findByRole('option', { name: 'Día 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Activar servicio' }));

    expect(await screen.findByText('No puedes activar este servicio')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dejar como borrador' })).toBeInTheDocument();
    expect(activate).toHaveBeenCalledWith('contract-1', { billingCycleDay: 1 });
    expect(screen.getByText('Estado del contrato: Borrador')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dejar como borrador' }));

    await waitFor(() => {
      expect(screen.queryByText('No puedes activar este servicio')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Estado del contrato: Borrador')).toBeInTheDocument();
  });

  it('CA-CF-11 ofrece el selector de catálogo al crear y editar un contrato', async () => {
    jest.spyOn(billingCyclesApi, 'list').mockResolvedValue(CYCLES);

    const { unmount } = render(
      <CreateContractDialog
        subscriberId="subscriber-test"
        onClose={jest.fn()}
        onSuccess={jest.fn(async () => undefined)}
      />,
    );
    expect(
      await screen.findByRole('combobox', { name: 'Ciclo de facturación' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Ciclo de facturación' })).not.toBeInTheDocument();
    unmount();

    render(
      <ContractDetailDrawer
        contract={CONTRACT}
        billingCycles={CYCLES}
        onClose={jest.fn()}
        onReload={jest.fn(async () => undefined)}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Editar contrato' }));
    expect(
      await screen.findByRole('combobox', { name: 'Ciclo de facturación' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Ciclo de facturación' })).not.toBeInTheDocument();
  });
});
