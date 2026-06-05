import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SeguimientoTab } from './SeguimientoTab';
import type { ExpedienteRecord } from '@/lib/api-client';

type CrmApi = typeof import('@/lib/api-client').crmApi;
type ListContactAttempts = CrmApi['listContactAttempts'];

const mockListContactAttempts: jest.MockedFunction<ListContactAttempts> = jest.fn();

jest.mock('@/lib/api-client', () => ({
  crmApi: {
    listContactAttempts: (...args: Parameters<ListContactAttempts>) =>
      mockListContactAttempts(...args),
    createContactAttempt: jest.fn(),
    updateResponsibility: jest.fn(),
    createAttribution: jest.fn(),
    revokeAttribution: jest.fn(),
  },
}));

describe('SeguimientoTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListContactAttempts.mockResolvedValue({ data: [], total: 0 });
  });

  it('should mostrar resumen contextual del panel activo', async () => {
    const expediente = {
      interestedPlanId: null,
      additionalProductIds: [],
      acquisitionChannel: 'OTRO',
      sourceDetail: null,
    } as unknown as Pick<
      ExpedienteRecord,
      'interestedPlanId' | 'additionalProductIds' | 'acquisitionChannel' | 'sourceDetail'
    >;

    render(
      <SeguimientoTab
        expedienteId="expediente-1"
        expediente={expediente}
        canManageAttribution={false}
        responsibility={null}
        responsibilityHistory={[]}
        currentAttribution={null}
        attributionHistory={[]}
        sortedAttributionUsers={[]}
        loadingAttributionUsers={false}
        planCatalog={[]}
        additionalProducts={[]}
        recentActivity={[]}
        pipelineChanges={[]}
        onSaved={jest.fn(async () => undefined)}
      />,
    );

    await waitFor(() => {
      expect(mockListContactAttempts).toHaveBeenCalledWith('expediente-1');
    });

    expect(
      screen.getByText(
        'Selecciona una acción rápida para iniciar una gestión operativa en esta oportunidad.',
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Registrar contacto' }));

    expect(screen.getByText('Registro de contacto activo')).toBeInTheDocument();
    expect(
      screen.getByText('Documenta el resultado del intento para mantener trazabilidad comercial.'),
    ).toBeInTheDocument();
  });
});
