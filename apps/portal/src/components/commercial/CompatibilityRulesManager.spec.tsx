import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CompatibilityRulesManager } from './CompatibilityRulesManager';
import { EMPTY_LIST_META } from '@/lib/list-meta';

const getCompatibilityRulesMock = jest.fn();
const getPlansMock = jest.fn();
const getAdditionalProductsMock = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    commercialApi: {
      ...actual.commercialApi,
      getCompatibilityRules: (...args: unknown[]) => getCompatibilityRulesMock(...args),
      getPlans: (...args: unknown[]) => getPlansMock(...args),
      getAdditionalProducts: (...args: unknown[]) => getAdditionalProductsMock(...args),
    },
  };
});

function buildRule(id: string) {
  return {
    id,
    tenantId: 'tenant-test',
    ruleType: 'REPLACES' as const,
    sourceItemId: 'source-item',
    targetItemId: 'target-item',
    isActive: true,
    effectiveFrom: null,
    note: 'Nota operativa de prueba',
    updatedAt: '2026-08-01T00:00:00.000Z',
    createdAt: '2026-08-01T00:00:00.000Z',
    sourceItem: { id: 'source-item', name: 'Equipo anterior' },
    targetItem: { id: 'target-item', name: 'Equipo sucesor' },
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

describe('CompatibilityRulesManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getCompatibilityRulesMock.mockResolvedValue({
      data: [buildRule('compatibility-1')],
      meta: buildMeta(2, 'cursor-2'),
    });
    getPlansMock.mockResolvedValue({ data: [], meta: buildMeta(0, null) });
    getAdditionalProductsMock.mockResolvedValue({ data: [], meta: buildMeta(0, null) });
  });

  it('realiza la primera carga y muestra la regla y el CTA de continuación', async () => {
    render(<CompatibilityRulesManager canEdit={false} />);

    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(await screen.findByText('Equipo anterior')).toBeInTheDocument();
    expect(screen.getByText('Equipo sucesor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cargar más' })).toBeEnabled();
    expect(getCompatibilityRulesMock).toHaveBeenCalledWith({ limit: 20 });
  });

  it('ejecuta Cargar más y omite el pie cuando ya no hay más resultados', async () => {
    const secondPage = { data: [buildRule('compatibility-2')], meta: buildMeta(2, null) };
    getCompatibilityRulesMock
      .mockResolvedValueOnce({
        data: [buildRule('compatibility-1')],
        meta: buildMeta(2, 'cursor-2'),
      })
      .mockResolvedValueOnce(secondPage);

    render(<CompatibilityRulesManager canEdit={false} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cargar más' }));

    await waitFor(() => expect(screen.getAllByText('Equipo anterior')).toHaveLength(2));
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
    expect(getCompatibilityRulesMock).toHaveBeenLastCalledWith({ limit: 20, cursor: 'cursor-2' });
  });
});
