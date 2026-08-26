import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TaxApplicationRulesManager } from './TaxApplicationRulesManager';
import { EMPTY_LIST_META } from '@/lib/list-meta';

const listApplicationsMock = jest.fn();
const getTaxRulesMock = jest.fn();
const listTaxDefinitionsMock = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    commercialApi: {
      ...actual.commercialApi,
      listTaxRuleApplications: (...args: unknown[]) => listApplicationsMock(...args),
      getTaxRules: (...args: unknown[]) => getTaxRulesMock(...args),
      listTaxDefinitions: (...args: unknown[]) => listTaxDefinitionsMock(...args),
    },
  };
});

function buildApplication(id: string) {
  return {
    id,
    tenantId: 'tenant-test',
    taxRuleId: 'rule-iva',
    taxDefinitionId: 'definition-iva',
    treatment: 'STANDARD' as const,
    rateOverride: null,
    priority: 1,
    isActive: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  };
}

function buildMeta(total: number, nextCursor: string | null) {
  return {
    ...EMPTY_LIST_META,
    total,
    nextCursor,
    mode: 'cursor' as const,
    capabilities: { randomAccess: false, sortableFields: [] },
  };
}

describe('TaxApplicationRulesManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listApplicationsMock.mockResolvedValue({
      data: [buildApplication('application-1')],
      meta: buildMeta(2, 'cursor-2'),
    });
    getTaxRulesMock.mockResolvedValue({
      data: [
        {
          id: 'rule-iva',
          taxType: 'IVA',
          ratePercentage: '19.00',
          stratumFrom: null,
          stratumTo: null,
          customerSegment: null,
          isActive: true,
        },
      ],
      meta: buildMeta(1, null),
    });
    listTaxDefinitionsMock.mockResolvedValue({
      data: [{ id: 'definition-iva', name: 'IVA general', code: 'IVA-19' }],
      meta: buildMeta(1, null),
    });
  });

  it('realiza la primera carga y muestra el registro y su meta de continuación', async () => {
    render(<TaxApplicationRulesManager canEdit={false} />);

    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(await screen.findByText('IVA · 19,00%')).toBeInTheDocument();
    expect(screen.getByText('IVA general')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cargar más' })).toBeEnabled();
    expect(listApplicationsMock).toHaveBeenCalledWith({ limit: 20 });
  });

  it('muestra el segmento Gobierno sin enum crudo', async () => {
    getTaxRulesMock.mockResolvedValue({
      data: [
        {
          id: 'rule-iva',
          taxType: 'IVA',
          ratePercentage: '19.00',
          stratumFrom: null,
          stratumTo: null,
          customerSegment: 'GOVERNMENT',
          isActive: true,
        },
      ],
      meta: buildMeta(1, null),
    });

    render(<TaxApplicationRulesManager canEdit={false} />);

    expect(await screen.findByText('IVA · 19,00% · Gobierno')).toBeInTheDocument();
    expect(screen.queryByText(/GOVERNMENT/)).not.toBeInTheDocument();
  });

  it('ejecuta Cargar más y conserva el estado disabled mientras llega la segunda página', async () => {
    const secondPage = {
      data: [buildApplication('application-2')],
      meta: buildMeta(2, null),
    };
    let releaseSecondPage: (value: typeof secondPage) => void = () => undefined;
    const pendingSecondPage = new Promise<typeof secondPage>((resolve) => {
      releaseSecondPage = resolve;
    });
    listApplicationsMock
      .mockResolvedValueOnce({
        data: [buildApplication('application-1')],
        meta: buildMeta(2, 'cursor-2'),
      })
      .mockImplementationOnce(() => pendingSecondPage);

    render(<TaxApplicationRulesManager canEdit={false} />);
    const loadMore = await screen.findByRole('button', { name: 'Cargar más' });
    fireEvent.click(loadMore);

    expect(screen.getByRole('button', { name: 'Cargar más' })).toBeDisabled();
    releaseSecondPage(secondPage);

    await waitFor(() => expect(screen.getAllByText('IVA · 19,00%')).toHaveLength(2));
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
    expect(listApplicationsMock).toHaveBeenLastCalledWith({ limit: 20, cursor: 'cursor-2' });
  });
});
