import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskExecutionMode, TaskStatus, WfmWorkType } from '@iwana/shared';
import { OperationsClient } from './OperationsClient';
import { ApiError, tasksApi } from '@/lib/api-client';
import type { ExecutionOrderTemplateVersion } from '@iwana/shared';
import {
  getMissingRequirements,
  isValidFutureEvidenceExpiry,
  resolveAssignedTemplateVersion,
  normalizeExecutionOrderEvidence,
  normalizeExecutionOrderCollection,
  collectExecutionOrderCollectionPages,
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
      listTemplateVersions: jest.fn().mockResolvedValue({ data: [] }),
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

  it('usa una etiqueta genérica y no expone la clave cruda de un requisito', () => {
    const error = new ApiError(422, 'CLOSURE_GAP', 'Faltan requisitos');
    Object.assign(error, { missingRequirements: ['req-photo-install'] });
    const missing = getMissingRequirements(error);

    expect(missing).toEqual([
      {
        requirementId: 'req-photo-install',
        label: 'Requisito pendiente',
        kind: 'OTHER',
        reason: 'Completa el requisito pendiente antes de cerrar la orden.',
      },
    ]);
    expect(missing[0]?.label).not.toContain('req-photo-install');
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

  it('traduce kind y categorías internas a labels seguros de producto', () => {
    expect(productRequirementLabel('MATERIAL', 'MATERIAL', 'ONT')).toBe(
      'Material o equipo requerido',
    );
    expect(productRequirementLabel(undefined, 'EVIDENCE', 'req-photo-install')).toBe(
      'Evidencia requerida',
    );
  });

  it('mantiene la OT visible cuando el endpoint de evidencias todavía no está disponible', async () => {
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
    jest.mocked(tasksApi.executionOrders.listTemplateVersions).mockResolvedValue({ data: [] });
    window.history.pushState({}, '', '/dashboard/operations?executionOrderId=eo-001');

    try {
      render(<OperationsClient />);

      expect(await screen.findByText('Evidencias no disponibles')).toBeInTheDocument();
      expect(screen.getAllByText('OT-001').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText('Sin evidencias registradas')).not.toBeInTheDocument();
    } finally {
      window.history.pushState({}, '', '/dashboard/operations');
    }
  });

  it('mantiene la OT y bloquea el cierre si falla la plantilla aplicada', async () => {
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
    jest
      .mocked(tasksApi.executionOrders.listTemplateVersions)
      .mockRejectedValue(new Error('plantilla no disponible'));
    window.history.pushState({}, '', '/dashboard/operations?executionOrderId=eo-template-error');

    try {
      render(<OperationsClient />);

      expect((await screen.findAllByText('OT-TEMPLATE-ERROR')).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Plantilla no disponible').length).toBeGreaterThanOrEqual(1);
      expect(
        screen.getByText(
          'No fue posible cargar la plantilla aplicada. La orden se conserva abierta y el cierre permanece bloqueado.',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Cerrar OT' })).not.toBeInTheDocument();
    } finally {
      window.history.pushState({}, '', '/dashboard/operations');
    }
  });

  it('no sustituye la versión asignada por otra versión de plantilla', () => {
    const assignedVersion: ExecutionOrderTemplateVersion = {
      id: 'tplv-3',
      templateId: 'tpl-001',
      key: 'INSTALACION_FIBRA',
      version: 3,
      label: 'Instalación fibra',
      workType: WfmWorkType.INSTALLATION,
      status: 'PUBLISHED',
      requirements: [],
      reasonCatalogs: [],
    };

    expect(resolveAssignedTemplateVersion([assignedVersion], 3)).toBe(assignedVersion);
    expect(resolveAssignedTemplateVersion([assignedVersion], 2)).toBeNull();
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
    expect(screen.getByRole('link', { name: 'Abrir Programación' })).toBeInTheDocument();

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
});
