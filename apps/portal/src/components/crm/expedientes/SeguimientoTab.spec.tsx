import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CatalogItemType } from '@iwana/shared';
import { SeguimientoTab } from './SeguimientoTab';
import {
  commercialApi,
  type ExpedienteDetailSummary,
  type ExpedienteTimelinePageResponse,
} from '@/lib/api-client';
import { clearExpedienteDetailCache } from './expediente-detail-cache';
import { dedupeTimelineEvents } from './ExpedienteTimelinePanel';

type CrmApi = typeof import('@/lib/api-client').crmApi;
type GetTimelinePage = CrmApi['getExpedienteTimelinePage'];

const mockGetTimelinePage: jest.MockedFunction<GetTimelinePage> = jest.fn();
const mockLegacyTimeline = jest.fn();
const mockLegacyAttributionHistory = jest.fn();
const mockLegacyResponsibilityHistory = jest.fn();
const mockLegacyContactAttempts = jest.fn();
const mockGetPlanById = commercialApi.getPlanById as jest.MockedFunction<
  typeof commercialApi.getPlanById
>;
const mockGetCatalogItemById = commercialApi.getCatalogItemById as jest.MockedFunction<
  typeof commercialApi.getCatalogItemById
>;

jest.mock('@/lib/api-client', () => ({
  crmApi: {
    getExpedienteTimelinePage: (...args: Parameters<GetTimelinePage>) =>
      mockGetTimelinePage(...args),
    getExpediente: (...args: Parameters<CrmApi['getExpediente']>) => mockLegacyTimeline(...args),
    getExpedienteTimeline: (...args: Parameters<CrmApi['getExpedienteTimeline']>) =>
      mockLegacyTimeline(...args),
    getAttributionHistory: (...args: Parameters<CrmApi['getAttributionHistory']>) =>
      mockLegacyAttributionHistory(...args),
    getResponsibilityHistory: (...args: Parameters<CrmApi['getResponsibilityHistory']>) =>
      mockLegacyResponsibilityHistory(...args),
    listContactAttempts: (...args: Parameters<CrmApi['listContactAttempts']>) =>
      mockLegacyContactAttempts(...args),
    createContactAttempt: jest.fn(),
    updateResponsibility: jest.fn(),
    createAttribution: jest.fn(),
    revokeAttribution: jest.fn(),
  },
  usersApi: {
    searchForPicker: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  },
  commercialApi: {
    getPlanById: jest.fn(),
    getCatalogItemById: jest.fn(),
  },
  mapPickerSearchResponse: ({
    data,
    total,
  }: {
    data: Array<{ id: string; label: string; sublabel?: string | null }>;
    total: number;
  }) => ({ items: data, total }),
}));

describe('SeguimientoTab', () => {
  const timelineResponse: ExpedienteTimelinePageResponse = {
    data: {
      events: [],
      metadata: {
        createdBy: { userId: null, name: null, role: null },
        lastEditedBy: { userId: null, name: null, role: null },
        lastActivityAt: null,
      },
    },
    meta: { page: 1, limit: 5, total: 0, totalPages: 0, truncated: false, hasMore: false },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    clearExpedienteDetailCache();
    mockGetTimelinePage.mockResolvedValue(timelineResponse);
    mockGetPlanById.mockRejectedValue(new Error('plan no mockeado'));
    mockGetCatalogItemById.mockImplementation(async (id) => ({
      id,
      type: CatalogItemType.PRODUCT,
      name: `Nombre ${id}`,
      description: null,
      taxClassificationId: null,
      retentionApplicable: false,
      isActive: true,
    }));
  });

  it('should mostrar resumen contextual del panel activo', async () => {
    const expediente = {
      interestedPlanId: null,
      additionalProductIds: [],
      acquisitionChannel: 'OTRO',
    } as unknown as Pick<
      ExpedienteDetailSummary,
      'interestedPlanId' | 'additionalProductIds' | 'additionalServiceIds' | 'acquisitionChannel'
    >;

    render(
      <SeguimientoTab
        expedienteId="expediente-1"
        expediente={expediente}
        canManageAttribution
        originCreator={null}
        responsibility={null}
        responsibilityHistory={[]}
        currentAttribution={null}
        attributionHistory={[]}
        recentActivity={[]}
        pipelineChanges={[]}
        onSaved={jest.fn(async () => undefined)}
      />,
    );

    await waitFor(() => expect(mockGetTimelinePage).toHaveBeenCalledTimes(1));

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

  it('muestra la etiqueta amigable del rol del responsable', async () => {
    const expediente = {
      interestedPlanId: null,
      additionalProductIds: [],
      acquisitionChannel: 'OTRO',
    } as unknown as Pick<
      ExpedienteDetailSummary,
      'interestedPlanId' | 'additionalProductIds' | 'additionalServiceIds' | 'acquisitionChannel'
    >;

    render(
      <SeguimientoTab
        expedienteId="expediente-1"
        expediente={expediente}
        canManageAttribution={false}
        originCreator={null}
        responsibility={{
          currentResponsibleUserId: 'user-1',
          currentResponsibleAssignedAt: '2026-08-17T16:29:00.000Z',
          currentResponsible: {
            userId: 'user-1',
            name: 'Usuario de prueba 1',
            role: 'ADMIN',
          },
          expedienteId: 'expediente-1',
        }}
        responsibilityHistory={[]}
        currentAttribution={null}
        attributionHistory={[]}
        recentActivity={[]}
        pipelineChanges={[]}
        onSaved={jest.fn(async () => undefined)}
      />,
    );

    expect(await screen.findByText('Administrador')).toBeInTheDocument();
    expect(screen.queryByText('ADMIN')).not.toBeInTheDocument();
  });

  it('muestra al creador cuando no existe una atribución activa', async () => {
    const expediente = {
      interestedPlanId: null,
      additionalProductIds: [],
      acquisitionChannel: 'OTRO',
    } as unknown as Pick<
      ExpedienteDetailSummary,
      'interestedPlanId' | 'additionalProductIds' | 'additionalServiceIds' | 'acquisitionChannel'
    >;

    render(
      <SeguimientoTab
        expedienteId="expediente-1"
        expediente={expediente}
        canManageAttribution={false}
        originCreator={{ userId: 'user-creator', name: 'Usuario creador' }}
        responsibility={null}
        responsibilityHistory={[]}
        currentAttribution={null}
        attributionHistory={[]}
        recentActivity={[]}
        pipelineChanges={[]}
        onSaved={jest.fn(async () => undefined)}
      />,
    );

    expect(await screen.findByText('Usuario creador')).toBeInTheDocument();
    expect(screen.getByText('Creado por')).toBeInTheDocument();
    expect(screen.queryByText('Sin atribución activa')).not.toBeInTheDocument();
  });

  it('muestra productos y servicios adicionales por separado', async () => {
    mockGetCatalogItemById.mockImplementation(async (id) => ({
      id,
      type: id === 'product-1' ? CatalogItemType.PRODUCT : CatalogItemType.SERVICE,
      name: id === 'product-1' ? 'Router WiFi' : 'TV Box',
      description: null,
      taxClassificationId: null,
      retentionApplicable: false,
      isActive: true,
    }));

    const expediente = {
      interestedPlanId: null,
      additionalProductIds: ['product-1'],
      additionalServiceIds: ['service-1'],
      acquisitionChannel: 'OTRO',
    } as unknown as Pick<
      ExpedienteDetailSummary,
      'interestedPlanId' | 'additionalProductIds' | 'additionalServiceIds' | 'acquisitionChannel'
    >;

    render(
      <SeguimientoTab
        expedienteId="expediente-1"
        expediente={expediente}
        canManageAttribution={false}
        originCreator={null}
        responsibility={null}
        responsibilityHistory={[]}
        currentAttribution={null}
        attributionHistory={[]}
        recentActivity={[]}
        pipelineChanges={[]}
        onSaved={jest.fn(async () => undefined)}
      />,
    );

    expect(await screen.findByText('Productos adicionales')).toBeInTheDocument();
    expect(screen.getByText('Router WiFi')).toBeInTheDocument();
    expect(screen.getByText('Servicios adicionales')).toBeInTheDocument();
    expect(screen.getByText('TV Box')).toBeInTheDocument();
  });

  it('resuelve el plan y los adicionales a nombres legibles sin mostrar UUID', async () => {
    const planId = '3b388d7e-cf67-45ed-9b17-6df39230238a';
    const productId = 'f97060a7-c846-4c0e-8397-d0e356f294e8';
    const serviceId = 'fdb25cb1-9fb9-454c-9b0e-71bfd66fa02e';

    mockGetPlanById.mockResolvedValue({
      id: planId,
      name: 'Plan Fibra 300',
      technology: 'FTTH',
      installationRule: 'ALWAYS' as never,
      downloadSpeedMbps: 300,
      uploadSpeedMbps: 150,
      basePrice: 89900,
      installationFee: 0,
      currentPrice: '89900.00',
      description: null,
      retentionApplicable: false,
      taxClassificationId: null,
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockGetCatalogItemById.mockImplementation(async (id) => ({
      id,
      type: id === productId ? CatalogItemType.PRODUCT : CatalogItemType.SERVICE,
      name: id === productId ? 'Router mesh' : 'IPTV',
      description: null,
      taxClassificationId: null,
      retentionApplicable: false,
      isActive: true,
    }));

    const expediente = {
      interestedPlanId: planId,
      additionalProductIds: [productId],
      additionalServiceIds: [serviceId],
      acquisitionChannel: 'OTRO',
    } as unknown as Pick<
      ExpedienteDetailSummary,
      'interestedPlanId' | 'additionalProductIds' | 'additionalServiceIds' | 'acquisitionChannel'
    >;

    render(
      <SeguimientoTab
        expedienteId="expediente-1"
        expediente={expediente}
        canManageAttribution={false}
        originCreator={null}
        responsibility={null}
        responsibilityHistory={[]}
        currentAttribution={null}
        attributionHistory={[]}
        recentActivity={[]}
        pipelineChanges={[]}
        onSaved={jest.fn(async () => undefined)}
      />,
    );

    expect(await screen.findByText('Plan Fibra 300')).toBeInTheDocument();
    expect(screen.getByText('Router mesh')).toBeInTheDocument();
    expect(screen.getByText('IPTV')).toBeInTheDocument();
    expect(screen.queryByText(planId)).not.toBeInTheDocument();
    expect(screen.queryByText(productId)).not.toBeInTheDocument();
    expect(screen.queryByText(serviceId)).not.toBeInTheDocument();
  });

  it('no expone UUID cuando el catálogo no resuelve el plan', async () => {
    const planId = '3b388d7e-cf67-45ed-9b17-6df39230238a';
    mockGetPlanById.mockRejectedValue(new Error('404'));

    const expediente = {
      interestedPlanId: planId,
      additionalProductIds: [],
      additionalServiceIds: [],
      acquisitionChannel: 'OTRO',
    } as unknown as Pick<
      ExpedienteDetailSummary,
      'interestedPlanId' | 'additionalProductIds' | 'additionalServiceIds' | 'acquisitionChannel'
    >;

    render(
      <SeguimientoTab
        expedienteId="expediente-1"
        expediente={expediente}
        canManageAttribution={false}
        originCreator={null}
        responsibility={null}
        responsibilityHistory={[]}
        currentAttribution={null}
        attributionHistory={[]}
        recentActivity={[]}
        pipelineChanges={[]}
        onSaved={jest.fn(async () => undefined)}
      />,
    );

    expect(await screen.findByText('Plan no disponible')).toBeInTheDocument();
    expect(screen.queryByText(planId)).not.toBeInTheDocument();
  });

  it('abre Seguimiento con una sola llamada al timeline paginado y no usa fuentes legacy', async () => {
    const expediente = {
      interestedPlanId: null,
      additionalProductIds: [],
      additionalServiceIds: [],
      acquisitionChannel: 'OTRO',
    } as unknown as Pick<
      ExpedienteDetailSummary,
      'interestedPlanId' | 'additionalProductIds' | 'additionalServiceIds' | 'acquisitionChannel'
    >;

    render(
      <SeguimientoTab
        expedienteId="expediente-1"
        expediente={expediente}
        canManageAttribution={false}
        originCreator={null}
        responsibility={null}
        currentAttribution={null}
        onSaved={jest.fn(async () => undefined)}
      />,
    );

    await waitFor(() => expect(mockGetTimelinePage).toHaveBeenCalledTimes(1));
    expect(mockGetTimelinePage).toHaveBeenCalledWith('expediente-1', {
      page: 1,
      limit: 5,
      filter: 'all',
    });
    expect(mockLegacyTimeline).not.toHaveBeenCalled();
    expect(mockLegacyAttributionHistory).not.toHaveBeenCalled();
    expect(mockLegacyResponsibilityHistory).not.toHaveBeenCalled();
    expect(mockLegacyContactAttempts).not.toHaveBeenCalled();
  });

  it('envía filtro y página al servidor sin filtrar ni paginar en memoria', async () => {
    mockGetTimelinePage.mockResolvedValue({
      ...timelineResponse,
      meta: { page: 1, limit: 5, total: 15, totalPages: 3, truncated: false, hasMore: true },
    });
    const expediente = {
      interestedPlanId: null,
      additionalProductIds: [],
      additionalServiceIds: [],
      acquisitionChannel: 'OTRO',
    } as unknown as Pick<
      ExpedienteDetailSummary,
      'interestedPlanId' | 'additionalProductIds' | 'additionalServiceIds' | 'acquisitionChannel'
    >;

    render(
      <SeguimientoTab
        expedienteId="expediente-1"
        expediente={expediente}
        canManageAttribution={false}
        originCreator={null}
        responsibility={null}
        currentAttribution={null}
        onSaved={jest.fn(async () => undefined)}
      />,
    );

    await waitFor(() => expect(mockGetTimelinePage).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Contactos' }));
    await waitFor(() =>
      expect(mockGetTimelinePage).toHaveBeenLastCalledWith('expediente-1', {
        page: 1,
        limit: 5,
        filter: 'contact',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Página 2' }));
    await waitFor(() =>
      expect(mockGetTimelinePage).toHaveBeenLastCalledWith('expediente-1', {
        page: 2,
        limit: 5,
        filter: 'contact',
      }),
    );
  });

  it('limita la navegación al máximo de 500 eventos aunque el API reporte más páginas', async () => {
    mockGetTimelinePage.mockResolvedValue({
      ...timelineResponse,
      meta: { page: 1, limit: 5, total: 500, totalPages: 140, truncated: true, hasMore: true },
    });
    const expediente = {
      interestedPlanId: null,
      additionalProductIds: [],
      additionalServiceIds: [],
      acquisitionChannel: 'OTRO',
    } as unknown as Pick<
      ExpedienteDetailSummary,
      'interestedPlanId' | 'additionalProductIds' | 'additionalServiceIds' | 'acquisitionChannel'
    >;

    render(
      <SeguimientoTab
        expedienteId="expediente-1"
        expediente={expediente}
        canManageAttribution={false}
        originCreator={null}
        responsibility={null}
        currentAttribution={null}
        onSaved={jest.fn(async () => undefined)}
      />,
    );

    expect(await screen.findByText('Página 1 de 100')).toBeInTheDocument();
    expect(screen.queryByText('Página 1 de 140')).not.toBeInTheDocument();
  });

  it('recarga la página actual del timeline después de crear un contacto', async () => {
    mockGetTimelinePage.mockResolvedValue({
      ...timelineResponse,
      meta: { page: 1, limit: 5, total: 1, totalPages: 1, truncated: false, hasMore: false },
    });
    const createContactAttempt = (await import('@/lib/api-client')).crmApi
      .createContactAttempt as jest.MockedFunction<CrmApi['createContactAttempt']>;
    createContactAttempt.mockResolvedValue({
      data: {
        id: 'contact-1',
        attemptedAt: '2026-08-24T10:00:00.000Z',
        channel: 'TELEFONO',
        result: 'EXITOSO',
        durationMinutes: null,
        notes: null,
        advisorId: 'user-1',
      },
    });
    const expediente = {
      interestedPlanId: null,
      additionalProductIds: [],
      additionalServiceIds: [],
      acquisitionChannel: 'OTRO',
    } as unknown as Pick<
      ExpedienteDetailSummary,
      'interestedPlanId' | 'additionalProductIds' | 'additionalServiceIds' | 'acquisitionChannel'
    >;

    render(
      <SeguimientoTab
        expedienteId="expediente-1"
        expediente={expediente}
        canManageAttribution={false}
        originCreator={null}
        responsibility={null}
        currentAttribution={null}
        onSaved={jest.fn(async () => undefined)}
      />,
    );

    await waitFor(() => expect(mockGetTimelinePage).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar contacto' }));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar contacto' }));

    await waitFor(() => expect(mockGetTimelinePage).toHaveBeenCalledTimes(2));
    expect(mockLegacyContactAttempts).not.toHaveBeenCalled();
  });

  it('conserva el éxito de la escritura si falla la recarga del timeline', async () => {
    mockGetTimelinePage
      .mockResolvedValueOnce(timelineResponse)
      .mockRejectedValueOnce(new Error('fallo de lectura'));
    const createContactAttempt = (await import('@/lib/api-client')).crmApi
      .createContactAttempt as jest.MockedFunction<CrmApi['createContactAttempt']>;
    createContactAttempt.mockResolvedValue({
      data: {
        id: 'contact-1',
        attemptedAt: '2026-08-24T10:00:00.000Z',
        channel: 'TELEFONO',
        result: 'EXITOSO',
        durationMinutes: null,
        notes: null,
        advisorId: 'user-1',
      },
    });
    const expediente = {
      interestedPlanId: null,
      additionalProductIds: [],
      additionalServiceIds: [],
      acquisitionChannel: 'OTRO',
    } as unknown as Pick<
      ExpedienteDetailSummary,
      'interestedPlanId' | 'additionalProductIds' | 'additionalServiceIds' | 'acquisitionChannel'
    >;

    render(
      <SeguimientoTab
        expedienteId="expediente-1"
        expediente={expediente}
        canManageAttribution={false}
        originCreator={null}
        responsibility={null}
        currentAttribution={null}
        onSaved={jest.fn(async () => undefined)}
      />,
    );

    await waitFor(() => expect(mockGetTimelinePage).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar contacto' }));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar contacto' }));

    await waitFor(() =>
      expect(
        screen.getByText(
          'Intento de contacto guardado. No fue posible actualizar la bitácora; puedes reintentar.',
        ),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText('No fue posible registrar el intento.')).not.toBeInTheDocument();
  });

  it('descarta la carga anterior y vuelve a consultar cuando cambia la revisión del timeline', async () => {
    const resolvers: Array<(response: ExpedienteTimelinePageResponse) => void> = [];
    mockGetTimelinePage.mockImplementation(
      () => new Promise<ExpedienteTimelinePageResponse>((resolve) => resolvers.push(resolve)),
    );
    const expediente = {
      interestedPlanId: null,
      additionalProductIds: [],
      acquisitionChannel: 'OTRO',
    } as unknown as Pick<
      ExpedienteDetailSummary,
      'interestedPlanId' | 'additionalProductIds' | 'additionalServiceIds' | 'acquisitionChannel'
    >;

    const { rerender } = render(
      <SeguimientoTab
        expedienteId="expediente-1"
        timelineRevision={0}
        expediente={expediente}
        canManageAttribution={false}
        originCreator={null}
        responsibility={null}
        currentAttribution={null}
        onSaved={jest.fn(async () => undefined)}
      />,
    );

    await waitFor(() => expect(mockGetTimelinePage).toHaveBeenCalledTimes(1));
    rerender(
      <SeguimientoTab
        expedienteId="expediente-1"
        timelineRevision={1}
        expediente={expediente}
        canManageAttribution={false}
        originCreator={null}
        responsibility={null}
        currentAttribution={null}
        onSaved={jest.fn(async () => undefined)}
      />,
    );

    await waitFor(() => expect(mockGetTimelinePage).toHaveBeenCalledTimes(2));
    const currentResponse = {
      ...timelineResponse,
      data: {
        ...timelineResponse.data,
        events: [
          {
            kind: 'system' as const,
            id: 'system-new',
            occurredAt: '2026-08-24T12:00:00.000Z',
            type: 'CREATED' as const,
            sectionLabel: null,
            reason: null,
            actor: { userId: null, name: null, role: null },
          },
        ],
      },
      meta: { page: 1, limit: 5, total: 1, totalPages: 1, truncated: false, hasMore: false },
    } satisfies ExpedienteTimelinePageResponse;
    const staleResponse = {
      ...currentResponse,
      data: {
        ...currentResponse.data,
        events: [
          {
            kind: 'system' as const,
            id: 'system-old',
            occurredAt: '2026-08-24T11:00:00.000Z',
            type: 'SECTION_UPDATED' as const,
            sectionLabel: 'Contacto',
            reason: 'Respuesta obsoleta',
            actor: { userId: null, name: null, role: null },
          },
        ],
      },
    } satisfies ExpedienteTimelinePageResponse;

    await act(async () => {
      resolvers[1]?.(currentResponse);
    });
    expect(await screen.findByText('Oportunidad creada')).toBeInTheDocument();

    await act(async () => {
      resolvers[0]?.(staleResponse);
    });
    expect(screen.queryByText('Actualización de sección')).not.toBeInTheDocument();
    expect(mockGetTimelinePage).toHaveBeenLastCalledWith('expediente-1', {
      page: 1,
      limit: 5,
      filter: 'all',
    });
  });

  it('actualiza responsabilidad, refresca el timeline y notifica al padre', async () => {
    const updateResponsibility = (await import('@/lib/api-client')).crmApi
      .updateResponsibility as jest.MockedFunction<CrmApi['updateResponsibility']>;
    const onSaved = jest.fn(async () => undefined);
    updateResponsibility.mockResolvedValue({ data: {} } as never);
    (await import('@/lib/api-client')).usersApi.searchForPicker = jest.fn().mockResolvedValue({
      data: [{ id: 'user-2', label: 'Usuario de prueba 2', sublabel: null }],
      total: 1,
    });
    const expediente = {
      interestedPlanId: null,
      additionalProductIds: [],
      acquisitionChannel: 'OTRO',
    } as unknown as Pick<
      ExpedienteDetailSummary,
      'interestedPlanId' | 'additionalProductIds' | 'additionalServiceIds' | 'acquisitionChannel'
    >;

    render(
      <SeguimientoTab
        expedienteId="expediente-1"
        expediente={expediente}
        canManageAttribution
        originCreator={null}
        responsibility={null}
        currentAttribution={null}
        onSaved={onSaved}
      />,
    );

    await waitFor(() => expect(mockGetTimelinePage).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Reasignar responsable' }));
    fireEvent.change(screen.getByLabelText('Nuevo responsable'), {
      target: { value: 'usu' },
    });
    fireEvent.click(await screen.findByRole('option', { name: /Usuario de prueba 2/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar responsable' }));

    await waitFor(() =>
      expect(updateResponsibility).toHaveBeenCalledWith('expediente-1', expect.any(Object)),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(mockGetTimelinePage).toHaveBeenCalledTimes(2);
  });

  it('actualiza atribución, refresca el timeline y notifica al padre', async () => {
    const createAttribution = (await import('@/lib/api-client')).crmApi
      .createAttribution as jest.MockedFunction<CrmApi['createAttribution']>;
    const onSaved = jest.fn(async () => undefined);
    createAttribution.mockResolvedValue({ data: {} } as never);
    (await import('@/lib/api-client')).usersApi.searchForPicker = jest.fn().mockResolvedValue({
      data: [{ id: 'user-3', label: 'Usuario de prueba 3', sublabel: null }],
      total: 1,
    });
    const expediente = {
      interestedPlanId: null,
      additionalProductIds: [],
      acquisitionChannel: 'OTRO',
    } as unknown as Pick<
      ExpedienteDetailSummary,
      'interestedPlanId' | 'additionalProductIds' | 'additionalServiceIds' | 'acquisitionChannel'
    >;

    render(
      <SeguimientoTab
        expedienteId="expediente-1"
        expediente={expediente}
        canManageAttribution
        originCreator={null}
        responsibility={null}
        currentAttribution={null}
        onSaved={onSaved}
      />,
    );

    await waitFor(() => expect(mockGetTimelinePage).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Gestionar originador' }));
    fireEvent.change(screen.getByLabelText('Actor originador'), {
      target: { value: 'usu' },
    });
    fireEvent.click(await screen.findByRole('option', { name: /Usuario de prueba 3/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar atribución' }));

    await waitFor(() =>
      expect(createAttribution).toHaveBeenCalledWith('expediente-1', expect.any(Object)),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(mockGetTimelinePage).toHaveBeenCalledTimes(2);
  });

  it('elimina eventos repetidos del fixture antes de pintarlos', () => {
    const event = {
      kind: 'system' as const,
      id: 'system-1',
      occurredAt: '2026-08-24T10:00:00.000Z',
      type: 'CREATED' as const,
      sectionLabel: null,
      reason: null,
      actor: { userId: null, name: null, role: null },
    };

    expect(dedupeTimelineEvents([event, event])).toHaveLength(1);
  });
});
