import type { ReactNode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskExecutionMode, TaskStatus, WfmWorkType } from '@iwana/shared';
import { OperationsClient } from './OperationsClient';
import { ApiError, inventoryApi, tasksApi } from '@/lib/api-client';
import {
  getMissingRequirements,
  isValidFutureEvidenceExpiry,
  deriveTemplateFromDetail,
  normalizeExecutionOrderEvidence,
  normalizeExecutionOrderCollection,
  collectExecutionOrderCollectionPages,
  loadMoreExecutionOrderCollection,
  productRequirementLabel,
} from './OperationsClient';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  inventoryApi: {
    listItems: jest.fn().mockResolvedValue({ data: [] }),
    listLocations: jest.fn().mockResolvedValue({ data: [] }),
    getExecutorCustody: jest.fn(),
  },
  crmApi: {
    listExpedientes: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  },
  subscribersApi: {
    list: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  },
  tasksApi: {
    list: jest.fn().mockResolvedValue({
      data: [
        {
          id: 'task-001',
          taskNumber: 'TSK-20260622-001',
          type: 'INTERNAL_OPERATION',
          status: TaskStatus.OPEN,
          priority: 'NORMAL',
          title: 'Validar equipo retirado',
          responsibleRefId: 'user-123',
          recipientType: 'INTERNAL_AREA',
          recipientRefId: 'operations-area',
          recipientLabel: 'Operaciones',
          executionMode: TaskExecutionMode.IMMEDIATE,
          scheduledRequired: false,
          createdAt: '2026-06-22T14:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    }),
    create: jest.fn(),
    timeline: jest.fn().mockResolvedValue([]),
    assignmentHistory: jest.fn().mockResolvedValue([]),
    transition: jest.fn(),
    executionOrders: {
      get: jest.fn(),
      listActivities: jest.fn().mockResolvedValue([]),
      listItemUsage: jest.fn().mockResolvedValue([]),
      listEvidence: jest.fn().mockResolvedValue({ data: [] }),
      // El detalle debe bastar para operar la OT: el catálogo de versiones de
      // plantilla queda reservado a la gestión (roles ADMIN/NOC/SUPPORT).
      listTemplateVersions: jest.fn(),
    },
  },
  usersApi: {
    list: jest.fn().mockResolvedValue({
      data: [
        {
          id: 'user-123',
          email: 'soporte@demo.co',
          firstName: 'Laura',
          lastName: 'Ruiz',
        },
      ],
      meta: { nextCursor: null },
    }),
  },
}));

function buildTask(index: number) {
  return {
    id: `task-${index}`,
    taskNumber: `TSK-${String(index).padStart(3, '0')}`,
    type: 'INTERNAL_OPERATION',
    status: TaskStatus.OPEN,
    priority: 'NORMAL',
    title: `Tarea operativa ${index}`,
    responsibleRefId: 'user-123',
    recipientType: 'INTERNAL_AREA',
    recipientRefId: 'operations-area',
    recipientLabel: 'Operaciones',
    executionMode: TaskExecutionMode.IMMEDIATE,
    scheduledRequired: false,
    createdAt: '2026-07-24T14:00:00.000Z',
  };
}

describe('OperationsClient', () => {
  beforeEach(() => {
    jest.mocked(tasksApi.list).mockResolvedValue({
      data: [buildTask(1)],
      total: 1,
      page: 1,
      limit: 20,
    } as never);
  });

  it('conserva la etiqueta real de un requisito faltante', () => {
    const error = new ApiError(422, 'CLOSURE_GAP', 'Faltan requisitos');
    Object.assign(error, {
      missingRequirements: [
        {
          requirementId: 'req-photo-install',
          label: 'Foto de instalación',
          kind: 'EVIDENCE',
          reason: 'Adjunta una foto de la instalación.',
        },
      ],
    });
    const missing = getMissingRequirements(error);

    expect(missing[0]).toEqual({
      requirementId: 'req-photo-install',
      label: 'Foto de instalación',
      kind: 'EVIDENCE',
      reason: 'Adjunta una foto de la instalación.',
    });
  });

  it('usa el fallback genérico solo cuando la etiqueta está vacía', () => {
    const error = new ApiError(422, 'CLOSURE_GAP', 'Faltan requisitos');
    Object.assign(error, {
      missingRequirements: [
        {
          requirementId: 'req-photo-install',
          label: '   ',
          kind: 'EVIDENCE',
          reason: '',
        },
      ],
    });
    const missing = getMissingRequirements(error);

    expect(missing).toEqual([
      {
        requirementId: 'req-photo-install',
        label: 'Evidencia requerida',
        kind: 'EVIDENCE',
        reason: 'Adjunta evidencia requerida antes de cerrar la orden.',
      },
    ]);
  });

  it('normaliza evidencias ausentes a una colección vacía', () => {
    expect(normalizeExecutionOrderEvidence(null)).toEqual([]);
    expect(normalizeExecutionOrderEvidence(undefined)).toEqual([]);
    expect(normalizeExecutionOrderEvidence({ data: [] })).toEqual([]);
  });

  it('normaliza colecciones de operaciones tanto planas como paginadas', () => {
    const row = { id: 'activity-001' };

    expect(normalizeExecutionOrderCollection([row])).toEqual([row]);
    expect(
      normalizeExecutionOrderCollection({
        data: [row],
        meta: { page: 1, limit: 25, total: 1 },
      }),
    ).toEqual([row]);
  });

  it('concatena páginas posteriores de actividades y conserva el total', async () => {
    const calls: Array<{ page: number; limit: number }> = [];
    const result = await collectExecutionOrderCollectionPages(
      async (page, limit) => {
        calls.push({ page, limit });
        return page === 1
          ? {
              data: [{ id: 'activity-001' }],
              meta: {
                page: 1,
                limit,
                total: 2,
                totalIsEstimate: false,
                totalPages: 2,
                nextCursor: null,
                hasMore: true,
                mode: 'page' as const,
                capabilities: { randomAccess: true, sortableFields: [] },
                sort: null,
              },
            }
          : {
              data: [{ id: 'activity-002' }],
              meta: {
                page: 2,
                limit,
                total: 2,
                totalIsEstimate: false,
                totalPages: 2,
                nextCursor: null,
                hasMore: false,
                mode: 'page' as const,
                capabilities: { randomAccess: true, sortableFields: [] },
                sort: null,
              },
            };
      },
      { limit: 1, maxPages: 5 },
    );

    expect(calls).toEqual([
      { page: 1, limit: 1 },
      { page: 2, limit: 1 },
    ]);
    expect(result.data).toEqual([{ id: 'activity-001' }, { id: 'activity-002' }]);
    expect(result.meta.total).toBe(2);
    expect(result.meta.hasMore).toBe(false);
  });

  it('deja visible el total y hasMore cuando alcanza la cota de páginas', async () => {
    const result = await collectExecutionOrderCollectionPages(
      async (page, limit) => ({
        data: [{ id: `activity-${page}` }],
        meta: {
          page,
          limit,
          total: 3,
          totalIsEstimate: false,
          totalPages: 3,
          nextCursor: null,
          hasMore: true,
          mode: 'page' as const,
          capabilities: { randomAccess: true, sortableFields: [] },
          sort: null,
        },
      }),
      { limit: 1, maxPages: 2 },
    );

    expect(result.data).toHaveLength(2);
    expect(result.meta.total).toBe(3);
    expect(result.meta.hasMore).toBe(true);
  });

  it('carga la página siguiente cuando hasMore mantiene datos pendientes visibles', async () => {
    const fetchPage = jest.fn().mockResolvedValue({
      data: [{ id: 'activity-002' }],
      meta: {
        page: 21,
        limit: 1,
        total: 2,
        totalIsEstimate: false,
        totalPages: 21,
        nextCursor: null,
        hasMore: false,
        mode: 'page' as const,
        capabilities: { randomAccess: true, sortableFields: [] },
        sort: null,
      },
    });

    const result = await loadMoreExecutionOrderCollection(
      fetchPage,
      {
        page: 20,
        limit: 1,
        total: 2,
        totalIsEstimate: false,
        totalPages: 21,
        nextCursor: null,
        hasMore: true,
        mode: 'page',
        capabilities: { randomAccess: true, sortableFields: [] },
        sort: null,
      },
      1,
    );

    expect(fetchPage).toHaveBeenCalledWith(21, 1);
    expect(result.data).toEqual([{ id: 'activity-002' }]);
    expect(result.meta.hasMore).toBe(false);
    expect(result.meta.total).toBe(2);
  });

  it('conserva labels de producto y deriva copy cuando no hay label', () => {
    expect(productRequirementLabel('Material o equipo', 'MATERIAL', 'ONT')).toBe(
      'Material o equipo',
    );
    expect(productRequirementLabel(undefined, 'EVIDENCE', 'req-photo-install')).toBe(
      'Evidencia requerida',
    );
  });

  it('mantiene la OT visible cuando el endpoint de evidencias todavía no está disponible', async () => {
    const user = userEvent.setup();
    const order = {
      id: 'eo-001',
      number: 'OT-001',
      status: 'IN_PROGRESS',
      workType: WfmWorkType.INSTALLATION,
      template: {
        id: 'tpl-001',
        key: 'INSTALACION_FIBRA',
        version: 1,
        label: 'Instalación fibra',
      },
      schedule: {
        eventId: 'event-001',
        window: {
          startAt: '2026-07-30T14:00:00.000Z',
          endAt: '2026-07-30T16:00:00.000Z',
        },
      },
      site: { id: 'site-001', label: 'Sitio autorizado' },
      completion: { progress: 0 },
      syncState: 'IN_SYNC',
      inventoryReconciliation: 'NOT_REQUIRED',
      allowedActions: [],
      createdAt: '2026-07-30T12:00:00.000Z',
      updatedAt: '2026-07-30T12:00:00.000Z',
    } as never;

    jest.mocked(tasksApi.executionOrders.get).mockResolvedValue(order);
    jest.mocked(tasksApi.executionOrders.listActivities).mockResolvedValue([]);
    jest.mocked(tasksApi.executionOrders.listItemUsage).mockResolvedValue([]);
    jest
      .mocked(tasksApi.executionOrders.listEvidence)
      .mockRejectedValue(new Error('Endpoint no disponible'));
    window.history.pushState({}, '', '/dashboard/operations?executionOrderId=eo-001');

    try {
      render(<OperationsClient />);

      expect(await screen.findByText('Evidencias no disponibles')).toBeInTheDocument();
      expect(screen.getAllByText('OT-001').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText('Sin evidencias registradas')).not.toBeInTheDocument();
      const refreshButtons = screen.getAllByRole('button', { name: 'Actualizar detalle' });
      expect(refreshButtons.length).toBeGreaterThanOrEqual(1);
      await user.click(refreshButtons[0]!);
      expect(screen.getAllByText('OT-001').length).toBeGreaterThanOrEqual(1);
    } finally {
      window.history.pushState({}, '', '/dashboard/operations');
    }
  });

  it('deriva la plantilla del snapshot del detalle sin consultar el catálogo de versiones', async () => {
    const order = {
      id: 'eo-snapshot-001',
      number: 'OT-SNAPSHOT-001',
      version: 1,
      status: 'IN_PROGRESS',
      workType: WfmWorkType.INSTALLATION,
      template: {
        id: 'tpl-001',
        key: 'INSTALACION_FIBRA',
        version: 1,
        label: 'Instalación fibra',
        requirements: [
          {
            key: 'CUSTOMER_SIGNATURE',
            label: 'Firma del cliente',
            required: true,
            kind: 'EVIDENCE',
            evidenceType: 'SIGNATURE',
          },
        ],
      },
      schedule: {
        eventId: 'event-001',
        window: {
          startAt: '2026-07-30T14:00:00.000Z',
          endAt: '2026-07-30T16:00:00.000Z',
        },
      },
      site: { id: 'site-001', label: 'Sitio autorizado' },
      completion: { progress: 0 },
      syncState: 'IN_SYNC',
      inventoryReconciliation: 'NOT_REQUIRED',
      allowedActions: ['CLOSE'],
      createdAt: '2026-07-30T12:00:00.000Z',
      updatedAt: '2026-07-30T12:00:00.000Z',
    } as never;

    jest.mocked(tasksApi.executionOrders.get).mockResolvedValue(order);
    jest.mocked(tasksApi.executionOrders.listActivities).mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 25, total: 0 },
    } as never);
    jest.mocked(tasksApi.executionOrders.listItemUsage).mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 25, total: 0 },
    } as never);
    jest.mocked(tasksApi.executionOrders.listEvidence).mockResolvedValue({
      data: [],
      meta: {
        nextCursor: null,
        total: 0,
        totalIsEstimate: false,
        page: 1,
        limit: 100,
        totalPages: 0,
        hasMore: false,
        mode: 'page',
        capabilities: { randomAccess: true, sortableFields: [] },
        sort: null,
      },
    });
    window.history.pushState({}, '', '/dashboard/operations?executionOrderId=eo-snapshot-001');

    try {
      render(<OperationsClient />);

      expect((await screen.findAllByText('OT-SNAPSHOT-001')).length).toBeGreaterThanOrEqual(1);
      // El checklist se pinta desde el snapshot del detalle…
      expect(await screen.findByText('Firma del cliente')).toBeInTheDocument();
      // …el cierre queda habilitado…
      expect(screen.getByRole('button', { name: 'Cerrar OT' })).toBeInTheDocument();
      // …y no se consulta el catálogo vivo de versiones de plantilla.
      expect(tasksApi.executionOrders.listTemplateVersions).not.toHaveBeenCalled();
    } finally {
      window.history.pushState({}, '', '/dashboard/operations');
    }
  });

  it('mantiene la OT y bloquea el cierre cuando el detalle no trae snapshot de plantilla', async () => {
    const order = {
      id: 'eo-template-error',
      number: 'OT-TEMPLATE-ERROR',
      version: 1,
      status: 'IN_PROGRESS',
      workType: WfmWorkType.INSTALLATION,
      template: {
        id: 'tpl-001',
        key: 'INSTALACION_FIBRA',
        version: 1,
        label: 'Instalación fibra',
      },
      schedule: {
        eventId: 'event-001',
        window: {
          startAt: '2026-07-30T14:00:00.000Z',
          endAt: '2026-07-30T16:00:00.000Z',
        },
      },
      site: { id: 'site-001', label: 'Sitio autorizado' },
      completion: { progress: 0 },
      syncState: 'IN_SYNC',
      inventoryReconciliation: 'NOT_REQUIRED',
      allowedActions: ['CLOSE'],
      createdAt: '2026-07-30T12:00:00.000Z',
      updatedAt: '2026-07-30T12:00:00.000Z',
    } as never;

    jest.mocked(tasksApi.executionOrders.get).mockResolvedValue(order);
    jest.mocked(tasksApi.executionOrders.listActivities).mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 25, total: 0 },
    } as never);
    jest.mocked(tasksApi.executionOrders.listItemUsage).mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 25, total: 0 },
    } as never);
    jest.mocked(tasksApi.executionOrders.listEvidence).mockResolvedValue({
      data: [],
      meta: {
        nextCursor: null,
        total: 0,
        totalIsEstimate: false,
        page: 1,
        limit: 100,
        totalPages: 0,
        hasMore: false,
        mode: 'page',
        capabilities: { randomAccess: true, sortableFields: [] },
        sort: null,
      },
    });
    window.history.pushState({}, '', '/dashboard/operations?executionOrderId=eo-template-error');

    try {
      render(<OperationsClient />);

      expect((await screen.findAllByText('OT-TEMPLATE-ERROR')).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Plantilla no disponible').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Requisitos no disponibles')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Cerrar OT' })).not.toBeInTheDocument();
      // Sin snapshot no hay fallo de red: la OT se consulta en modo degradado.
      expect(screen.queryByText('No fue posible completar la operación')).not.toBeInTheDocument();
      expect(tasksApi.executionOrders.listTemplateVersions).not.toHaveBeenCalled();
    } finally {
      window.history.pushState({}, '', '/dashboard/operations');
    }
  });

  describe('deriveTemplateFromDetail', () => {
    it('devuelve null cuando la OT no tiene plantilla o snapshot', () => {
      expect(deriveTemplateFromDetail(null)).toBeNull();
      expect(deriveTemplateFromDetail({ template: null } as never)).toBeNull();
      expect(
        deriveTemplateFromDetail({
          workType: WfmWorkType.INSTALLATION,
          template: { id: 'tpl-001', key: 'K', version: 1, label: 'L' },
        } as never),
      ).toBeNull();
    });

    it('proyecta la referencia congelada al shape de versión usado por el drawer', () => {
      const detail = {
        workType: WfmWorkType.INSTALLATION,
        template: {
          id: 'tpl-001',
          key: 'INSTALACION_FIBRA',
          version: 2,
          label: 'Instalación fibra',
          requirements: [
            {
              key: 'CUSTOMER_SIGNATURE',
              label: 'Firma del cliente',
              required: true,
              kind: 'EVIDENCE',
              evidenceType: 'SIGNATURE',
            },
          ],
        },
      } as never;

      const template = deriveTemplateFromDetail(detail);

      expect(template).toEqual({
        id: 'tpl-001',
        templateId: 'tpl-001',
        key: 'INSTALACION_FIBRA',
        version: 2,
        label: 'Instalación fibra',
        workType: WfmWorkType.INSTALLATION,
        status: 'PUBLISHED',
        requirements: [
          {
            key: 'CUSTOMER_SIGNATURE',
            label: 'Firma del cliente',
            required: true,
            kind: 'EVIDENCE',
            evidenceType: 'SIGNATURE',
          },
        ],
        reasonCatalogs: [],
      });
    });
  });

  describe('expiración de evidencia', () => {
    const now = Date.parse('2026-07-30T12:00:00.000Z');

    it('acepta únicamente una fecha válida futura', () => {
      expect(isValidFutureEvidenceExpiry('2026-07-30T12:00:01.000Z', now)).toBe(true);
    });

    it.each([
      undefined,
      null,
      'no-es-una-fecha',
      '2026-07-30T11:59:59.000Z',
      '2026-07-30T12:00:00.000Z',
    ])('rechaza expiresAt inválido o no futuro: %s', (expiresAt) => {
      expect(isValidFutureEvidenceExpiry(expiresAt, now)).toBe(false);
    });
  });

  it('renders operations shell with task list', async () => {
    render(<OperationsClient />);

    expect(screen.getByRole('heading', { name: 'Operaciones' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Abrir Programación' })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Tarea operativa 1')).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: 'Crear tarea' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear tarea' })).toBeInTheDocument();
    expect(screen.getByText('1 tarea')).toBeInTheDocument();
    expect(screen.queryByText(/Fin de resultados/i)).not.toBeInTheDocument();
  });

  it('ADR-064: con total>20 muestra Cargar más y concatena la página siguiente', async () => {
    const user = userEvent.setup();
    const page1 = Array.from({ length: 20 }, (_, index) => buildTask(index + 1));
    const page2 = [buildTask(21)];

    jest.mocked(tasksApi.list).mockImplementation(async (params?: { page?: number }) => {
      if (params?.page === 2) {
        return { data: page2, total: 21, page: 2, limit: 20 } as never;
      }
      return { data: page1, total: 21, page: 1, limit: 20 } as never;
    });

    render(<OperationsClient />);

    expect(await screen.findByText('20 de 21 tareas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cargar más' })).toBeInTheDocument();
    expect(screen.getByText('Tarea operativa 1')).toBeInTheDocument();
    expect(screen.queryByText('Tarea operativa 21')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cargar más' }));

    await waitFor(() => {
      expect(tasksApi.list).toHaveBeenCalledWith(expect.objectContaining({ page: 2, limit: 20 }));
    });

    expect(await screen.findByText('Tarea operativa 21')).toBeInTheDocument();
    expect(screen.getByText('Tarea operativa 1')).toBeInTheDocument();
    expect(screen.getByText('21 tareas')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  it('ADR-064: al cambiar filtro de estado reinicia en página 1', async () => {
    const user = userEvent.setup();
    jest.mocked(tasksApi.list).mockResolvedValue({
      data: [buildTask(1)],
      total: 1,
      page: 1,
      limit: 20,
    } as never);

    render(<OperationsClient />);
    await screen.findByText('Tarea operativa 1');

    await user.click(screen.getByRole('combobox', { name: 'Estado' }));
    await user.click(await screen.findByRole('option', { name: 'En progreso' }));

    await waitFor(() => {
      expect(tasksApi.list).toHaveBeenCalledWith(
        expect.objectContaining({ status: TaskStatus.IN_PROGRESS, page: 1, limit: 20 }),
      );
    });
  });

  it('QA-49: no persiste OT en el almacenamiento del navegador al operar la consola', async () => {
    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    const removeItem = jest.spyOn(Storage.prototype, 'removeItem');
    const clear = jest.spyOn(Storage.prototype, 'clear');
    // jsdom no implementa IndexedDB: si el entorno no la expone, no existe
    // superficie de escritura que vigilar.
    const open = typeof indexedDB === 'undefined' ? null : jest.spyOn(indexedDB, 'open');
    const user = userEvent.setup();

    render(<OperationsClient />);
    await screen.findByText('Tarea operativa 1');

    // Cambio de filtro: dispara la recarga de la lista sin tocar storage.
    await user.click(screen.getByRole('combobox', { name: 'Estado' }));
    await user.click(await screen.findByRole('option', { name: 'En progreso' }));

    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    if (open) expect(open).not.toHaveBeenCalled();

    setItem.mockRestore();
    removeItem.mockRestore();
    clear.mockRestore();
    open?.mockRestore();
  });

  describe('custodia del ejecutor', () => {
    beforeEach(() => {
      // El mock del módulo se comparte entre tests: limpia el historial de
      // llamadas para que los conteos arranquen en cero.
      jest.mocked(inventoryApi.getExecutorCustody).mockClear();
    });

    const listMeta = {
      nextCursor: null,
      total: 1,
      totalIsEstimate: false,
      page: 1,
      limit: 25,
      totalPages: 1,
      hasMore: false,
      mode: 'page',
      capabilities: { randomAccess: true, sortableFields: [] },
      sort: null,
    };

    function buildCustodyOrder(id: string, number: string, withAssignee: boolean) {
      return {
        id,
        number,
        version: 1,
        status: 'IN_PROGRESS',
        workType: WfmWorkType.INSTALLATION,
        template: {
          id: 'tpl-001',
          key: 'INSTALACION_FIBRA',
          version: 1,
          label: 'Instalación fibra',
        },
        schedule: {
          eventId: 'event-001',
          window: {
            startAt: '2026-08-31T14:00:00.000Z',
            endAt: '2026-08-31T16:00:00.000Z',
          },
        },
        ...(withAssignee
          ? {
              assignee: { type: 'TECHNICIAN', id: 'tech-001', displayLabel: 'Carlos López' },
            }
          : {}),
        site: { id: 'site-001', label: 'Sitio autorizado' },
        completion: { progress: 0 },
        syncState: 'IN_SYNC',
        inventoryReconciliation: 'NOT_REQUIRED',
        allowedActions: [],
        createdAt: '2026-08-31T12:00:00.000Z',
        updatedAt: '2026-08-31T12:00:00.000Z',
      } as never;
    }

    function buildCustodyResponse(locationName: string, serial: string) {
      return {
        location: {
          id: 'loc-mobile-001',
          name: locationName,
          type: 'MOBILE_TECHNICIAN',
          responsibleType: 'TECHNICIAN',
          responsibleRefId: 'tech-001',
        },
        assets: {
          items: [
            {
              id: 'custody-asset-001',
              inventoryItemId: 'item-001',
              serialNumber: serial,
              currentStatus: 'ASSIGNED_TO_TECHNICIAN',
            },
          ],
          meta: listMeta,
        },
        balances: {
          items: [],
          meta: { ...listMeta, total: 0, totalPages: 0 },
        },
      } as never;
    }

    function mockExecutionOrderCollections() {
      jest.mocked(tasksApi.executionOrders.listActivities).mockResolvedValue([] as never);
      jest.mocked(tasksApi.executionOrders.listItemUsage).mockResolvedValue([] as never);
      jest
        .mocked(tasksApi.executionOrders.listEvidence)
        .mockResolvedValue({ data: [], meta: listMeta } as never);
    }

    it('consulta la custodia con el responsable asignado y la muestra en el drawer', async () => {
      jest
        .mocked(tasksApi.executionOrders.get)
        .mockResolvedValue(buildCustodyOrder('eo-custody-001', 'OT-CUSTODY-001', true));
      mockExecutionOrderCollections();
      jest
        .mocked(inventoryApi.getExecutorCustody)
        .mockResolvedValue(buildCustodyResponse('Bodega móvil de Carlos López', 'ONT-2026-001'));
      window.history.pushState({}, '', '/dashboard/operations?executionOrderId=eo-custody-001');

      try {
        render(<OperationsClient />);

        expect(await screen.findByText('En custodia del ejecutor')).toBeInTheDocument();
        expect(inventoryApi.getExecutorCustody).toHaveBeenCalledWith('tech-001', {
          page: 1,
          limit: 25,
        });
        expect(screen.getByText('Bodega móvil de Carlos López')).toBeInTheDocument();
        expect(screen.getByText('ONT-2026-001')).toBeInTheDocument();
      } finally {
        window.history.pushState({}, '', '/dashboard/operations');
      }
    });

    it('descarta la respuesta tardía de una apertura previa sin pisar el drawer vigente', async () => {
      const user = userEvent.setup();
      let resolveFirstCustody: (value: never) => void = () => undefined;
      jest
        .mocked(tasksApi.executionOrders.get)
        .mockResolvedValue(buildCustodyOrder('eo-custody-late', 'OT-CUSTODY-LATE', true));
      mockExecutionOrderCollections();
      jest.mocked(inventoryApi.getExecutorCustody).mockImplementationOnce(
        () =>
          new Promise<never>((resolve) => {
            resolveFirstCustody = resolve;
          }),
      );
      window.history.pushState({}, '', '/dashboard/operations?executionOrderId=eo-custody-late');

      try {
        render(<OperationsClient />);

        await waitFor(() => {
          expect(inventoryApi.getExecutorCustody).toHaveBeenCalledTimes(1);
        });

        // El usuario cierra el drawer mientras la custodia sigue en vuelo: el
        // cierre invalida la apertura (seq guard). El velo ya no es un
        // `<button>` etiquetado: se localiza por `data-portal-veil` sobre
        // `document.body`, donde vive la capa portalada.
        const veil = document.body.querySelector<HTMLElement>('[data-portal-veil]');
        expect(veil).not.toBeNull();
        await user.click(veil as HTMLElement);
        expect(screen.queryByText('OT-CUSTODY-LATE')).not.toBeInTheDocument();

        // La respuesta tardía llega después: no reabre el drawer ni pinta datos.
        await act(async () => {
          resolveFirstCustody(buildCustodyResponse('Custodia tardía', 'ONT-TARDIO-001'));
        });
        expect(screen.queryByText('Custodia tardía')).not.toBeInTheDocument();
        expect(screen.queryByText('ONT-TARDIO-001')).not.toBeInTheDocument();
        expect(screen.queryByText('En custodia del ejecutor')).not.toBeInTheDocument();
      } finally {
        window.history.pushState({}, '', '/dashboard/operations');
      }
    });

    it('no consulta la custodia cuando la OT no tiene responsable asignado', async () => {
      jest
        .mocked(tasksApi.executionOrders.get)
        .mockResolvedValue(buildCustodyOrder('eo-custody-none', 'OT-SIN-ASSIGNEE', false));
      mockExecutionOrderCollections();
      window.history.pushState({}, '', '/dashboard/operations?executionOrderId=eo-custody-none');

      try {
        render(<OperationsClient />);

        expect((await screen.findAllByText('OT-SIN-ASSIGNEE')).length).toBeGreaterThanOrEqual(1);
        expect(inventoryApi.getExecutorCustody).not.toHaveBeenCalled();
        expect(
          screen.getByText('El ejecutor no tiene equipos ni materiales en custodia'),
        ).toBeInTheDocument();
      } finally {
        window.history.pushState({}, '', '/dashboard/operations');
      }
    });

    it('mantiene la OT operativa cuando la custodia responde 404 (endpoint pendiente)', async () => {
      jest
        .mocked(tasksApi.executionOrders.get)
        .mockResolvedValue(buildCustodyOrder('eo-custody-404', 'OT-CUSTODY-404', true));
      mockExecutionOrderCollections();
      jest
        .mocked(inventoryApi.getExecutorCustody)
        .mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Endpoint no disponible'));
      window.history.pushState({}, '', '/dashboard/operations?executionOrderId=eo-custody-404');

      try {
        render(<OperationsClient />);

        expect((await screen.findAllByText('OT-CUSTODY-404')).length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('Custodia no disponible')).toBeInTheDocument();
        // El resto del drawer sigue operativo: bloques visibles y acción de refresco.
        expect(screen.getByText('Equipos y materiales')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Actualizar detalle' })).toBeInTheDocument();
      } finally {
        window.history.pushState({}, '', '/dashboard/operations');
      }
    });
  });
});
