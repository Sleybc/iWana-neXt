import { fireEvent, render, screen } from '@testing-library/react';
import type { Contract, Subscriber360Response } from '@/lib/api-client';
import { ServiciosTab } from './ServiciosTab';

jest.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {},
  commercialApi: { getPlanById: jest.fn(), getCatalogItemById: jest.fn() },
  contractsApi: { remove: jest.fn() },
}));
jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: () => ({ hasPermission: () => false }),
}));
jest.mock('./use-billing-cycles', () => ({
  useBillingCycles: () => ({ cycles: [], loading: false, error: null, retry: jest.fn() }),
}));
jest.mock('./ContractCard', () => ({
  ContractCard: ({ contract }: { contract: Contract }) => <div>{contract.alias}</div>,
}));
jest.mock('./ContractDetailDrawer', () => ({ ContractDetailDrawer: () => null }));
jest.mock('./ConvertExpedienteToContractDialog', () => ({
  ConvertExpedienteToContractDialog: () => null,
}));
jest.mock('./CreateContractDialog', () => ({ CreateContractDialog: () => null }));
jest.mock('./ActivateServiceDialog', () => ({ ActivateServiceDialog: () => null }));

function contract(id: string, alias: string, status: Contract['status']): Contract {
  return { id, alias, status } as Contract;
}

function build360(contracts: Contract[]): Subscriber360Response {
  return {
    subscriber: { id: 'subscriber-synthetic', privacyRestricted: false, hasLiveContracts: true },
    contacts: [],
    contracts,
    quotes: [],
    habeasData: [],
    arcoRequests: [],
    privacyMarks: [],
    timelineSeed: [],
    expedienteSummary: null,
  } as unknown as Subscriber360Response;
}

function renderTab(contracts: Contract[]) {
  return render(
    <ServiciosTab
      subscriber360={build360(contracts)}
      onReload={jest.fn(async () => undefined)}
      onOpenLifecycle={jest.fn()}
    />,
  );
}

const MIXED = [
  contract('c1', 'Activo sintético', 'ACTIVE'),
  contract('c2', 'Borrador sintético', 'DRAFT'),
  contract('c3', 'Terminado sintético', 'TERMINATED'),
];

describe('ServiciosTab — filtros por estado', () => {
  beforeEach(() =>
    window.history.replaceState(null, '', '/dashboard/crm/subscribers/s1?tab=servicios'),
  );

  it('ofrece solo los estados con servicios, con conteo, incluido «Terminados»', () => {
    renderTab(MIXED);
    const group = screen.getByRole('group', { name: 'Filtrar servicios por estado' });
    expect(group).toHaveTextContent('Todos3');
    expect(screen.getByRole('button', { name: /Activos/ })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /Terminados/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Suspendidos/ })).toBeNull();
  });

  it('oculta los filtros cuando todos los servicios están en el mismo estado', () => {
    renderTab([contract('c1', 'A', 'ACTIVE'), contract('c2', 'B', 'ACTIVE')]);
    expect(screen.queryByRole('group', { name: 'Filtrar servicios por estado' })).toBeNull();
  });

  it('guarda el filtro en la URL sin perder los demás parámetros', () => {
    renderTab(MIXED);
    fireEvent.click(screen.getByRole('button', { name: /Terminados/ }));

    expect(screen.getByRole('button', { name: /Terminados/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('Terminado sintético')).toBeInTheDocument();
    expect(screen.queryByText('Activo sintético')).toBeNull();
    const params = new URLSearchParams(window.location.search);
    expect(params.get('estado')).toBe('terminados');
    expect(params.get('tab')).toBe('servicios');

    fireEvent.click(screen.getByRole('button', { name: /Todos/ }));
    expect(new URLSearchParams(window.location.search).get('estado')).toBeNull();
  });

  it('restaura el filtro desde la URL al cargar', () => {
    window.history.replaceState(
      null,
      '',
      '/dashboard/crm/subscribers/s1?tab=servicios&estado=borradores',
    );
    renderTab(MIXED);
    expect(screen.getByRole('button', { name: /Borradores/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('Borrador sintético')).toBeInTheDocument();
    expect(screen.queryByText('Activo sintético')).toBeNull();
  });

  it('ignora un valor de filtro desconocido en la URL', () => {
    window.history.replaceState(null, '', '/dashboard/crm/subscribers/s1?estado=otro');
    renderTab(MIXED);
    expect(screen.getByRole('button', { name: /Todos/ })).toHaveAttribute('aria-pressed', 'true');
  });
});
