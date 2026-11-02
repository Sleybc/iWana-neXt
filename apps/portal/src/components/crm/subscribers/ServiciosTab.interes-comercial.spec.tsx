import { render, screen, waitFor } from '@testing-library/react';
import type { Contract, Subscriber360Response } from '@/lib/api-client';
import { commercialApi } from '@/lib/api-client';
import { ServiciosTab } from './ServiciosTab';

jest.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {},
  commercialApi: {
    getPlanById: jest.fn(),
    getCatalogItemById: jest.fn(),
  },
  contractsApi: { remove: jest.fn() },
}));
jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: () => ({ hasPermission: () => false }),
}));
jest.mock('./use-billing-cycles', () => ({ useBillingCycles: () => [] }));
jest.mock('./ContractCard', () => ({
  ContractCard: ({ contract }: { contract: Contract }) => <div>{contract.alias}</div>,
}));
jest.mock('./ContractDetailDrawer', () => ({ ContractDetailDrawer: () => null }));
jest.mock('./ConvertExpedienteToContractDialog', () => ({
  ConvertExpedienteToContractDialog: () => null,
}));
jest.mock('./CreateContractDialog', () => ({ CreateContractDialog: () => null }));
jest.mock('./ActivateServiceDialog', () => ({ ActivateServiceDialog: () => null }));

const PANEL = 'Interés comercial de la oportunidad';

function build360(contracts: Contract[]): Subscriber360Response {
  return {
    subscriber: { id: 'subscriber-synthetic', privacyRestricted: false },
    contacts: [],
    contracts,
    quotes: [],
    habeasData: [],
    arcoRequests: [],
    privacyMarks: [],
    timelineSeed: [],
    expedienteSummary: {
      id: 'opportunity-synthetic',
      interestedPlanId: 'plan-synthetic',
      additionalProductIds: [],
      additionalServiceIds: [],
      commercialNotes: 'Nota sintética',
    },
  } as unknown as Subscriber360Response;
}

describe('ServiciosTab — interés comercial de la oportunidad', () => {
  beforeEach(() => {
    (commercialApi.getPlanById as jest.Mock).mockResolvedValue({ name: 'Plan sintético' });
  });

  it('lo muestra mientras el suscriptor no tiene servicios', async () => {
    render(
      <ServiciosTab
        subscriber360={build360([])}
        onReload={jest.fn(async () => undefined)}
        onOpenLifecycle={jest.fn()}
      />,
    );
    expect(await screen.findByText(PANEL)).toBeInTheDocument();
  });

  it('lo oculta cuando el suscriptor ya tiene servicios', async () => {
    render(
      <ServiciosTab
        subscriber360={build360([
          { id: 'contract-synthetic', alias: 'Servicio sintético', status: 'ACTIVE' } as Contract,
        ])}
        onReload={jest.fn(async () => undefined)}
        onOpenLifecycle={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText('Servicio sintético')).toBeInTheDocument());
    expect(screen.queryByText(PANEL)).toBeNull();
  });
});
