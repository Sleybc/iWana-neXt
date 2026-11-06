import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CutoffAgendaResponse } from '@/lib/api-client';
import { billingCyclesApi } from '@/lib/api-client';
import { CutoffAgendaClient } from './CutoffAgendaClient';

jest.mock('next/navigation', () => {
  const router = { push: jest.fn(), replace: jest.fn() };
  const searchParams = new URLSearchParams('date=2026-11-15');
  return {
    useRouter: () => router,
    usePathname: () => '/dashboard/crm/subscribers/agenda-corte',
    useSearchParams: () => searchParams,
  };
});

const EMPTY_AGENDA: CutoffAgendaResponse = {
  date: '2026-11-15',
  items: [],
  meta: {
    nextCursor: null,
    total: 0,
    totalIsEstimate: false,
    page: 1,
    limit: 25,
    totalPages: 0,
    hasMore: false,
    mode: 'page',
    capabilities: { randomAccess: true, sortableFields: [] },
    sort: null,
  },
  withoutCycleCount: 2,
};

describe('CutoffAgendaClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('distingue una fecha sin resultados y mantiene el contador de servicios sin ciclo', async () => {
    jest.spyOn(billingCyclesApi, 'cutoffAgenda').mockResolvedValue(EMPTY_AGENDA);

    render(<CutoffAgendaClient />);

    expect(
      await screen.findByText('No hay servicios con corte programado para esta fecha'),
    ).toBeInTheDocument();
    expect(screen.getByText('2 servicios activos sin ciclo de facturación')).toBeInTheDocument();
    expect(
      screen.getByText('Consulta el estado de pago de los servicios con corte programado.'),
    ).toBeInTheDocument();
  });

  it('presenta pago parcial con sus importes accesibles y distingue un estado ausente', async () => {
    const item = {
      contractId: 'contract-fixture',
      subscriberId: 'subscriber-fixture',
      subscriberDisplayName: 'Suscriptor de prueba',
      planName: null,
      billingCycleDay: 15,
      cutoffDate: '2026-11-15',
    };
    jest.spyOn(billingCyclesApi, 'cutoffAgenda').mockResolvedValue({
      ...EMPTY_AGENDA,
      items: [
        {
          ...item,
          paymentState: 'PARCIAL',
          paymentPaidAmount: '50.00',
          paymentTotalAmount: '100.00',
        },
        { ...item, contractId: 'legacy-contract-fixture' },
      ],
      meta: { ...EMPTY_AGENDA.meta, total: 2, totalPages: 1 },
    });

    render(<CutoffAgendaClient />);

    expect(await screen.findByRole('columnheader', { name: 'Estado de pago' })).toBeInTheDocument();
    expect(screen.getAllByText('Pago parcial')).toHaveLength(2);
    expect(screen.getAllByText(/Pagado.+50.+de.+100/)).toHaveLength(2);
    expect(screen.getAllByText('No disponible')).toHaveLength(2);
  });

  it('muestra un error recuperable si falla la carga de la agenda', async () => {
    const load = jest
      .spyOn(billingCyclesApi, 'cutoffAgenda')
      .mockRejectedValueOnce(new Error('fallo de red'))
      .mockResolvedValueOnce(EMPTY_AGENDA);

    render(<CutoffAgendaClient />);

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar la agenda');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByText('No hay servicios con corte programado para esta fecha'),
    ).toBeInTheDocument();
  });

  it('presenta la píldora Sin documento para contratos sin periodo vigente', async () => {
    jest.spyOn(billingCyclesApi, 'cutoffAgenda').mockResolvedValue({
      ...EMPTY_AGENDA,
      items: [
        {
          contractId: 'contract-sin-documento',
          subscriberId: 'subscriber-fixture',
          subscriberDisplayName: 'Suscriptor de prueba',
          planName: null,
          billingCycleDay: 15,
          cutoffDate: '2026-11-15',
          paymentState: 'SIN_DOCUMENTO',
          paymentPaidAmount: null,
          paymentTotalAmount: null,
        },
      ],
      meta: { ...EMPTY_AGENDA.meta, total: 1, totalPages: 1 },
    });

    render(<CutoffAgendaClient />);

    const pills = await screen.findAllByText('Sin documento');
    expect(pills.length).toBeGreaterThanOrEqual(1);
  });
});
