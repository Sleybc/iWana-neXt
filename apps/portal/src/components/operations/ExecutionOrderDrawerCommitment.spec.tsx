// OLA1 C3/C4 — render del drawer: alerta acotada a pre-inicio (CA-03),
// copy por rol derivado de `allowedActions` (CA-04) y checklist con estado
// real por requisito (CA-05), incluida la OT de la auditoría.
import { render, screen, within } from '@testing-library/react';
import { ExecutionOrderStatus, WfmWorkType } from '@iwana/shared';
import type { ExecutionOrderAllowedAction, ExecutionOrderTemplateVersion } from '@iwana/shared';
import type { ExecutionOrderDetailResponse } from '@/lib/api-client';
import type { ExecutionOrderRequirementStatus } from '@iwana/shared';
import { ExecutionOrderDrawer } from './ExecutionOrderDrawer';

function seedTemplate(): ExecutionOrderTemplateVersion {
  return {
    id: 'tplv-seed-1',
    templateId: 'tpl-seed',
    key: 'INSTALACION_ESTANDAR',
    version: 1,
    label: 'Instalación estándar v1',
    workType: WfmWorkType.INSTALLATION,
    status: 'PUBLISHED',
    requirements: [
      {
        key: 'installation-activity',
        label: 'Actividad de instalación',
        required: true,
        kind: 'ACTIVITY',
        activityType: 'INSTALLATION',
      },
      {
        key: 'work-photo',
        label: 'Evidencia fotográfica',
        required: true,
        kind: 'EVIDENCE',
        evidenceType: 'PHOTO',
      },
      {
        key: 'CUSTOMER_SIGNATURE',
        label: 'Firma del cliente',
        required: true,
        kind: 'EVIDENCE',
        evidenceType: 'SIGNATURE',
      },
    ],
    reasonCatalogs: [],
  };
}

function detail(
  overrides: Partial<ExecutionOrderDetailResponse> = {},
): ExecutionOrderDetailResponse {
  const status = overrides.status ?? ExecutionOrderStatus.IN_PROGRESS;
  return {
    id: 'eo-audit',
    number: 'OTE-20260828-001',
    version: 1,
    status,
    workType: WfmWorkType.INSTALLATION,
    template: {
      id: 'tpl-seed',
      key: 'INSTALACION_ESTANDAR',
      version: 1,
      label: 'Instalación estándar v1',
    },
    schedule: {
      eventId: 'se-001',
      window: { startAt: '2026-08-28T14:00:00.000Z', endAt: '2026-08-28T16:00:00.000Z' },
    },
    assignee: { type: 'TECHNICIAN', id: 'tech-001', displayLabel: 'Técnico de campo' },
    site: { id: 'site-001', label: 'Sitio auditoría' },
    completion: { progress: 0, completed: 0, total: 3 },
    syncState: 'IN_SYNC',
    inventoryReconciliation: 'NOT_REQUIRED',
    allowedActions: [
      'REGISTER_ACTIVITY',
      'REGISTER_ITEM_USAGE',
      'REGISTER_EVIDENCE',
      'BLOCK',
      'CLOSE',
    ],
    createdAt: '2026-08-28T12:00:00.000Z',
    updatedAt: '2026-08-28T12:00:00.000Z',
    ...overrides,
  };
}

function renderDrawer(props: Partial<Parameters<typeof ExecutionOrderDrawer>[0]> = {}) {
  return render(
    <ExecutionOrderDrawer
      open={true}
      order={detail()}
      activities={[]}
      itemUsage={[]}
      evidence={[]}
      template={seedTemplate()}
      isLoading={false}
      isSubmitting={false}
      error={null}
      offline={false}
      onClose={jest.fn()}
      isLoadingMoreActivities={false}
      isLoadingMoreItemUsage={false}
      isLoadingMoreEvidence={false}
      isLoadingMoreExecutorCustody={false}
      onLoadMoreActivities={jest.fn()}
      onLoadMoreItemUsage={jest.fn()}
      onLoadMoreEvidence={jest.fn()}
      onLoadMoreExecutorCustody={jest.fn()}
      onStart={jest.fn().mockResolvedValue(undefined)}
      onRegisterActivity={jest.fn().mockResolvedValue(undefined)}
      onRegisterItemUsage={jest.fn().mockResolvedValue(undefined)}
      onUploadEvidence={jest.fn().mockResolvedValue(undefined)}
      onCloseOrder={jest.fn().mockResolvedValue(undefined)}
      itemOptions={[]}
      {...props}
    />,
  );
}

function auditRequirements(): ExecutionOrderRequirementStatus[] {
  return [
    {
      requirementId: 'installation-activity',
      label: 'Actividad de instalación',
      kind: 'ACTIVITY',
      satisfied: true,
    },
    {
      requirementId: 'work-photo',
      label: 'Evidencia fotográfica',
      kind: 'EVIDENCE',
      satisfied: false,
      reason: 'Adjunta la evidencia fotográfica antes de cerrar la orden.',
    },
    {
      requirementId: 'CUSTOMER_SIGNATURE',
      label: 'Firma del cliente',
      kind: 'EVIDENCE',
      satisfied: false,
      reason: 'Adjunta la firma del cliente antes de cerrar la orden.',
    },
  ];
}

describe('C3 — alerta de inicio acotada a pre-inicio (CA-03)', () => {
  it.each([
    [
      'ejecutor',
      ['REGISTER_ACTIVITY', 'REGISTER_ITEM_USAGE', 'REGISTER_EVIDENCE', 'BLOCK', 'CLOSE'],
    ],
    ['supervisión', ['ASSIGN', 'REASSIGN', 'CREATE_FOLLOW_UP']],
    ['observador', []],
  ])('en IN_PROGRESS no se renderiza para %s', (_lens, actions) => {
    renderDrawer({
      order: detail({
        status: ExecutionOrderStatus.IN_PROGRESS,
        allowedActions: actions as ExecutionOrderAllowedAction[],
      }),
    });

    expect(screen.queryByText('No puedes iniciar esta orden')).toBeNull();
  });

  it('en bloqueada y terminal no se renderiza', () => {
    renderDrawer({ order: detail({ status: ExecutionOrderStatus.BLOCKED, allowedActions: [] }) });
    expect(screen.queryByText('No puedes iniciar esta orden')).toBeNull();
  });

  it('en pre-inicio sin START ni supervisión se renderiza sin mencionar sincronización', () => {
    const { assignee: _assignee, ...withoutAssignee } = detail({
      status: ExecutionOrderStatus.CREATED,
      allowedActions: [],
    });
    renderDrawer({ order: withoutAssignee });

    const alert = screen.getByText('No puedes iniciar esta orden');
    expect(alert).toBeInTheDocument();
    expect(alert.parentElement?.textContent ?? '').not.toMatch(/sincroniz/i);
  });

  it('en pre-inicio con START muestra el botón y la ayuda, sin alerta', () => {
    renderDrawer({
      order: detail({ status: ExecutionOrderStatus.ASSIGNED, allowedActions: ['START'] }),
    });

    expect(screen.getByRole('button', { name: 'Iniciar ejecución' })).toBeInTheDocument();
    expect(screen.getByText(/asignada a ti/)).toBeInTheDocument();
    expect(screen.queryByText('No puedes iniciar esta orden')).toBeNull();
  });
});

describe('C3 — copy por rol derivado de allowedActions (CA-04)', () => {
  it('supervisión en pre-inicio ve sus acciones reales, sin copy de técnico', () => {
    renderDrawer({
      order: detail({
        status: ExecutionOrderStatus.ASSIGNED,
        allowedActions: ['ASSIGN', 'CREATE_FOLLOW_UP'],
      }),
    });

    expect(screen.getByText(/asigna o reasigna/)).toBeInTheDocument();
    expect(screen.queryByText('No puedes iniciar esta orden')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Iniciar ejecución' })).toBeNull();
    expect(screen.queryByText(/Solo el técnico asignado/)).toBeNull();
  });

  it('supervisión en progreso sigue el avance sin alerta', () => {
    renderDrawer({
      order: detail({
        status: ExecutionOrderStatus.IN_PROGRESS,
        allowedActions: ['CREATE_FOLLOW_UP'],
      }),
    });

    expect(screen.getByText(/seguir el avance/)).toBeInTheDocument();
    expect(screen.queryByText('No puedes iniciar esta orden')).toBeNull();
  });
});

describe('C4 — checklist con estado real (CA-05)', () => {
  it('OTE-20260828-001: actividad cumplida y los otros dos pendientes con razón', () => {
    renderDrawer({
      order: detail({
        status: ExecutionOrderStatus.IN_PROGRESS,
        completion: { progress: 33.33, completed: 1, total: 3, requirements: auditRequirements() },
      }),
    });

    const checklist = screen.getByRole('region', { name: 'Checklist de instalación' });
    expect(
      within(checklist).getByLabelText('Actividad de instalación: Cumplido'),
    ).toBeInTheDocument();
    expect(
      within(checklist).getByLabelText(/Evidencia fotográfica: Pendiente/),
    ).toBeInTheDocument();
    expect(within(checklist).getByLabelText(/Firma del cliente: Pendiente/)).toBeInTheDocument();
    expect(within(checklist).getByText('Cumplido')).toBeInTheDocument();
    // El badge Requerido se conserva pero ya no es la única información
    expect(within(checklist).getAllByText('Requerido')).toHaveLength(3);
  });

  it('sin requirements[] degrada de forma visible sin vaciar la lista (paso 8)', () => {
    renderDrawer({
      order: detail({
        status: ExecutionOrderStatus.IN_PROGRESS,
        completion: { progress: 0, completed: 0, total: 3 },
      }),
    });

    const checklist = screen.getByRole('region', { name: 'Checklist de instalación' });
    expect(within(checklist).getByText('Estado de requisitos no disponible')).toBeInTheDocument();
    expect(within(checklist).getByText('Actividad de instalación')).toBeInTheDocument();
    expect(within(checklist).getByText('Evidencia fotográfica')).toBeInTheDocument();
    expect(within(checklist).getByText('Firma del cliente')).toBeInTheDocument();
    expect(within(checklist).queryByText('Cumplido')).toBeNull();
  });
});

describe('C3 — bloqueada y terminal por rol', () => {
  it('bloqueada muestra el aviso informativo con la descripción del rol', () => {
    renderDrawer({ order: detail({ status: ExecutionOrderStatus.BLOCKED, allowedActions: [] }) });

    expect(screen.getByText('Orden bloqueada')).toBeInTheDocument();
    expect(screen.queryByText('No puedes iniciar esta orden')).toBeNull();
  });

  it('terminal ofrece solo lectura sin alerta', () => {
    renderDrawer({
      order: detail({ status: ExecutionOrderStatus.COMPLETED, allowedActions: [] }),
    });

    expect(screen.getByText(/solo puede consultarse/)).toBeInTheDocument();
    expect(screen.queryByText('No puedes iniciar esta orden')).toBeNull();
  });
});
