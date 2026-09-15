// MOD11 Consola de OT · Ola 1 · Suite de regresión C5 (AI-SR-QA).
//
// Vertiente portal de los doce casos del prompt
// `PROMPT-MOD11-CONSOLA-OT-OLA1-SR-QA-v1.0.md` §3 (casos 7-9; el backend vive
// en `execution-orders.ola1-regression.spec.ts` y el navegador en
// `e2e/tests/portal-operations-consola-ot-ola1.spec.ts`).
//
// - Copy verificado contra la tabla A.2 de 12 celdas
//   (`INFORME-MOD11-CONSOLA-OT-OLA1-PROD-UX-v1.0.md`).
// - Sin PII real: identificadores y etiquetas ficticias.
// - R-S2 registra la observación heredada de fe-platform (observador puro en
//   pre-inicio conserva el título viejo): deuda menor documentada, no P1 —
//   en IN_PROGRESS no aparece para ningún rol (CA-03).
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
    // MOD11 T2 (contrato v1.4): el discriminador viaja siempre en el detalle.
    annulled: false,
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

describe('OLA1 regresión portal — caso 7: IN_PROGRESS sin alerta (CA-03)', () => {
  it('R7-técnico: la alerta no se renderiza para el técnico en IN_PROGRESS', () => {
    renderDrawer({
      order: detail({
        status: ExecutionOrderStatus.IN_PROGRESS,
        allowedActions: [
          'REGISTER_ACTIVITY',
          'REGISTER_ITEM_USAGE',
          'REGISTER_EVIDENCE',
          'BLOCK',
          'CLOSE',
        ] as ExecutionOrderAllowedAction[],
      }),
    });

    expect(screen.queryByText('No puedes iniciar esta orden')).toBeNull();
  });

  it('R7-supervisor: la alerta no se renderiza para supervisión en IN_PROGRESS', () => {
    renderDrawer({
      order: detail({
        status: ExecutionOrderStatus.IN_PROGRESS,
        allowedActions: ['CREATE_FOLLOW_UP'] as ExecutionOrderAllowedAction[],
      }),
    });

    expect(screen.queryByText('No puedes iniciar esta orden')).toBeNull();
    expect(screen.getByText(/seguir el avance/)).toBeInTheDocument();
  });

  it('R7-observador: la alerta no se renderiza para el observador en IN_PROGRESS', () => {
    renderDrawer({
      order: detail({
        status: ExecutionOrderStatus.IN_PROGRESS,
        allowedActions: [] as ExecutionOrderAllowedAction[],
      }),
    });

    expect(screen.queryByText('No puedes iniciar esta orden')).toBeNull();
  });
});

describe('OLA1 regresión portal — caso 8: supervisor sin copy de técnico (CA-04)', () => {
  it('R8: supervisión ve sus acciones reales, nunca copy de técnico', () => {
    renderDrawer({
      order: detail({
        status: ExecutionOrderStatus.ASSIGNED,
        allowedActions: ['ASSIGN', 'CREATE_FOLLOW_UP'] as ExecutionOrderAllowedAction[],
      }),
    });

    expect(screen.getByText(/asigna o reasigna/)).toBeInTheDocument();
    expect(screen.queryByText('No puedes iniciar esta orden')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Iniciar ejecución' })).toBeNull();
    expect(screen.queryByText(/Solo el técnico asignado/)).toBeNull();
    // Nota: el badge de estado de sincronización ("Sincronizada") es UI
    // legítima del syncState, fuera del copy de la alerta; la garantía de que
    // la alerta no menciona sincronización vive acotada a la alerta en
    // `ExecutionOrderDrawerCommitment.spec.tsx` (caso observador pre-inicio).
  });
});

describe('OLA1 regresión portal — caso 9: degradación visible sin requirements[]', () => {
  it('R9: sin requirements[] el checklist degrada visible, nunca a bloque vacío', () => {
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

describe('OLA1 regresión portal — OTE-20260828-001: checklist con estado real', () => {
  it('R-OTE: instalación cumplida + 2 pendientes con razón, sin alerta falsa', () => {
    renderDrawer({
      order: detail({
        status: ExecutionOrderStatus.IN_PROGRESS,
        completion: { progress: 33, completed: 1, total: 3, requirements: auditRequirements() },
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
    expect(screen.queryByText('No puedes iniciar esta orden')).toBeNull();
  });
});

describe('OLA1 regresión portal — observación heredada S2 (deuda menor, no P1)', () => {
  it('R-S2: observador puro en pre-inicio conserva el título (fuera de la matriz A.2)', () => {
    const { assignee: _assignee, ...withoutAssignee } = detail({
      status: ExecutionOrderStatus.CREATED,
      allowedActions: [] as ExecutionOrderAllowedAction[],
    });
    renderDrawer({ order: withoutAssignee });

    // Comportamiento heredado documentado como deuda menor: la matriz A.2 de
    // 12 celdas no cubre al observador puro en pre-inicio; CA-03/CA-04 no se
    // violan porque en IN_PROGRESS la alerta no aparece para ningún rol (R7).
    expect(screen.getByText('No puedes iniciar esta orden')).toBeInTheDocument();
  });
});
