// B0 (Ola 2b) — expediente por momento y por lente.
// CA-10 (UX v1.1 §4): matriz de 4 momentos x 3 lentes, con la lente derivada
// solo de `allowedActions`; checklist como índice con sus cuatro estados;
// acción ACTIVITY completa (activityType preseleccionado + historial bajo el
// requisito); borrador del cierre que sobrevive al refresco.
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExecutionOrderStatus, WfmWorkType } from '@iwana/shared';
import type {
  ExecutionOrderActivity,
  ExecutionOrderAllowedAction,
  ExecutionOrderRequirementStatus,
  ExecutionOrderTemplateVersion,
} from '@iwana/shared';
import type { ExecutionOrderDetailResponse } from '@/lib/api-client';
import { ExecutionOrderDrawer } from './ExecutionOrderDrawer';

const REQUIREMENT_KEYS = [
  'installed-equipment',
  'service-test',
  'work-photo',
  'CUSTOMER_SIGNATURE',
  'installation-activity',
] as const;

function templateV2(): ExecutionOrderTemplateVersion {
  return {
    id: 'tplv-v2',
    templateId: 'tpl-v2',
    key: 'INSTALACION_ESTANDAR',
    version: 2,
    label: 'Instalación estándar',
    workType: WfmWorkType.INSTALLATION,
    status: 'PUBLISHED',
    requirements: [
      {
        key: 'installed-equipment',
        label: 'Equipos instalados en el sitio del cliente',
        required: true,
        kind: 'MATERIAL',
        itemCategory: 'CPE',
      },
      {
        key: 'service-test',
        label: 'Prueba de servicio en el sitio',
        required: true,
        kind: 'EVIDENCE',
        evidenceType: 'PHOTO',
      },
      {
        key: 'work-photo',
        label: 'Fotos del trabajo realizado',
        required: true,
        kind: 'EVIDENCE',
        evidenceType: 'PHOTO',
      },
      {
        key: 'CUSTOMER_SIGNATURE',
        label: 'Acta de conformidad firmada por el cliente',
        required: true,
        kind: 'EVIDENCE',
        evidenceType: 'SIGNATURE',
      },
      {
        key: 'installation-activity',
        label: 'Registro de la actividad en bitácora (NO requerido)',
        required: false,
        kind: 'ACTIVITY',
        activityType: 'INSTALLATION',
      },
    ],
    reasonCatalogs: [],
  };
}

function pendingEvaluations(): ExecutionOrderRequirementStatus[] {
  return templateV2().requirements.map((requirement) => ({
    requirementId: requirement.key,
    label: requirement.label,
    kind: requirement.kind,
    satisfied: false,
    reason: `Falta ${requirement.key}`,
  }));
}

const ASSIGNEE = { type: 'TECHNICIAN', id: 'tech-001', displayLabel: 'Técnico de campo' } as const;

function detail(
  overrides: Partial<ExecutionOrderDetailResponse> = {},
): ExecutionOrderDetailResponse {
  return {
    id: 'eo-b0',
    number: 'OTE-B0-001',
    version: 3,
    status: ExecutionOrderStatus.IN_PROGRESS,
    annulled: false,
    workType: WfmWorkType.INSTALLATION,
    template: {
      id: 'tpl-v2',
      key: 'INSTALACION_ESTANDAR',
      version: 2,
      label: 'Instalación estándar',
      requirements: templateV2().requirements,
    },
    schedule: {
      eventId: 'se-001',
      window: { startAt: '2026-10-05T14:00:00.000Z', endAt: '2026-10-05T16:00:00.000Z' },
    },
    assignee: ASSIGNEE,
    site: { id: 'site-001', label: 'Sitio B0', address: 'Calle 1 # 2 - 3' },
    completion: { progress: 0, completed: 0, total: 4, requirements: pendingEvaluations() },
    syncState: 'IN_SYNC',
    inventoryReconciliation: 'NOT_REQUIRED',
    allowedActions: [],
    createdAt: '2026-10-05T12:00:00.000Z',
    updatedAt: '2026-10-05T12:00:00.000Z',
    ...overrides,
  };
}

type DrawerProps = Parameters<typeof ExecutionOrderDrawer>[0];

function drawerProps(props: Partial<DrawerProps> = {}): DrawerProps {
  return {
    open: true,
    order: detail(),
    activities: [],
    itemUsage: [],
    evidence: [],
    template: templateV2(),
    isLoading: false,
    isSubmitting: false,
    error: null,
    offline: false,
    onClose: jest.fn(),
    isLoadingMoreActivities: false,
    isLoadingMoreItemUsage: false,
    isLoadingMoreEvidence: false,
    isLoadingMoreExecutorCustody: false,
    onLoadMoreActivities: jest.fn(),
    onLoadMoreItemUsage: jest.fn(),
    onLoadMoreEvidence: jest.fn(),
    onLoadMoreExecutorCustody: jest.fn(),
    onStart: jest.fn().mockResolvedValue(undefined),
    onRegisterActivity: jest.fn().mockResolvedValue(undefined),
    onRegisterItemUsage: jest.fn().mockResolvedValue(undefined),
    onUploadEvidence: jest.fn().mockResolvedValue(undefined),
    onCloseOrder: jest.fn().mockResolvedValue(undefined),
    itemOptions: [{ value: 'item-1', label: 'ONT de instalación' }],
    // Custodia disponible: aun así NO debe montarse fuera del acto de consumo.
    executorCustodyState: 'available',
    executorCustodyName: 'Bodega móvil',
    executorCustodyAssets: [
      {
        id: 'asset-1',
        inventoryItemId: 'item-1',
        serialNumber: 'ONT-CUSTODIA-001',
        currentStatus: 'ASSIGNED',
      } as never,
    ],
    ...props,
  };
}

function renderDrawer(props: Partial<DrawerProps> = {}) {
  const result = render(<ExecutionOrderDrawer {...drawerProps(props)} />);
  return {
    ...result,
    rerenderDrawer: (next: Partial<DrawerProps>) =>
      result.rerender(<ExecutionOrderDrawer {...drawerProps(next)} />),
  };
}

const MOMENTS = [
  {
    name: 'pre-inicio',
    statuses: [
      ExecutionOrderStatus.CREATED,
      ExecutionOrderStatus.ASSIGNED,
      ExecutionOrderStatus.EN_ROUTE,
    ],
    capture: false,
  },
  { name: 'en progreso', statuses: [ExecutionOrderStatus.IN_PROGRESS], capture: true },
  { name: 'bloqueada', statuses: [ExecutionOrderStatus.BLOCKED], capture: false },
  {
    name: 'terminal',
    statuses: [
      ExecutionOrderStatus.COMPLETED,
      ExecutionOrderStatus.COMPLETED_WITH_OBSERVATIONS,
      ExecutionOrderStatus.NOT_EXECUTED,
      ExecutionOrderStatus.CANCELLED,
    ],
    capture: false,
  },
] as const;

const REGISTER: ExecutionOrderAllowedAction[] = [
  'REGISTER_ACTIVITY',
  'REGISTER_ITEM_USAGE',
  'REGISTER_EVIDENCE',
];

// Lentes derivadas solo de allowedActions + dato descriptivo de responsable.
const LENSES = [
  { name: 'ejecutor asignado', assignee: true, allowed: ['START', ...REGISTER, 'CLOSE'] },
  { name: 'ejecutor sin asignación', assignee: false, allowed: ['START', ...REGISTER, 'CLOSE'] },
  { name: 'supervisión', assignee: true, allowed: ['ASSIGN', 'REASSIGN', 'CREATE_FOLLOW_UP'] },
] as const;

const TRIGGER_NAMES = [
  /^Registrar equipo instalado para /,
  /^Añadir foto de la prueba de servicio para /,
  /^Añadir fotos del trabajo para /,
  /^Capturar firma del cliente para /,
  /^Registrar actividad para /,
];

function orderFor(
  status: ExecutionOrderStatus,
  lens: (typeof LENSES)[number],
): ExecutionOrderDetailResponse {
  const { assignee: _assignee, ...withoutAssignee } = detail();
  return {
    ...(lens.assignee ? detail() : withoutAssignee),
    status,
    allowedActions: [...lens.allowed],
  };
}

describe('CA-10 — matriz de 4 momentos x 3 lentes (UX §4)', () => {
  for (const moment of MOMENTS) {
    describe(`momento ${moment.name}`, () => {
      for (const lens of LENSES) {
        for (const status of moment.statuses) {
          it(`${lens.name} / ${status}: índice de ${REQUIREMENT_KEYS.length} requisitos y la superficie que el momento admite`, () => {
            renderDrawer({ order: orderFor(status, lens) });
            const checklist = screen.getByRole('region', { name: 'Requisitos' });
            expect(within(checklist).getAllByRole('listitem')).toHaveLength(
              REQUIREMENT_KEYS.length,
            );
            const triggers = Array.from(checklist.querySelectorAll('[id^="requirement-trigger-"]'));

            if (moment.capture && lens.allowed.includes('REGISTER_ACTIVITY' as never)) {
              // En progreso la acción nace de cada requisito, porque allowedActions la ofrece.
              expect(triggers).toHaveLength(REQUIREMENT_KEYS.length);
              for (const name of TRIGGER_NAMES) {
                expect(within(checklist).getByRole('button', { name })).toBeInTheDocument();
              }
            } else {
              // Pre-inicio, bloqueada, terminal y lentes sin registro: nada de captura.
              expect(triggers).toHaveLength(0);
            }
            // Nada de captura montada hasta que se abre un acto, en ningún momento.
            expect(document.querySelector('input[type="file"]')).toBeNull();
            expect(screen.queryByLabelText('Descripción de la actividad')).toBeNull();
            expect(screen.queryByLabelText('Cantidad')).toBeNull();
            // La custodia solo vive dentro del acto de consumo (UX §6).
            expect(screen.queryByText('En custodia del ejecutor')).toBeNull();
            expect(screen.queryByText('ONT-CUSTODIA-001')).toBeNull();
          });
        }
      }
    });
  }

  it.each([
    ExecutionOrderStatus.CREATED,
    ExecutionOrderStatus.ASSIGNED,
    ExecutionOrderStatus.EN_ROUTE,
  ])('pre-inicio (%s): aunque llegue un permiso de registro, no se monta captura', (status) => {
    renderDrawer({ order: detail({ status, allowedActions: [...REGISTER, 'START'] }) });
    expect(screen.queryByRole('button', { name: /^Registrar actividad para / })).toBeNull();
    expect(document.querySelector('form')).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByText('En custodia del ejecutor')).toBeNull();
    // El inicio sí lo ofrece START; es de la lente, no del requisito.
    expect(screen.getByRole('button', { name: 'Iniciar ejecución' })).toBeInTheDocument();
  });

  describe('bloqueada: estado sin motivo y en lectura (adenda A1)', () => {
    const EXECUTOR_COPY =
      'La orden está bloqueada. Contacta a supervisión para acordar cómo continuar.';
    it.each([
      { lens: LENSES[0], copy: EXECUTOR_COPY },
      { lens: LENSES[1], copy: EXECUTOR_COPY },
      {
        lens: LENSES[2],
        copy: 'La orden está bloqueada. Coordina con el equipo de campo el siguiente paso.',
      },
    ])(
      'lente $lens.name: título único, copy de UX §5 y ninguna alusión a un motivo',
      ({ lens, copy }) => {
        renderDrawer({ order: orderFor(ExecutionOrderStatus.BLOCKED, lens) });
        expect(screen.getAllByText('Orden bloqueada')).toHaveLength(1);
        expect(screen.getByText(copy)).toBeInTheDocument();
        expect(screen.getByRole('dialog').textContent).not.toMatch(/motivo/i);
        expect(screen.queryByText('Desbloqueo no disponible')).toBeNull();
      },
    );

    it('con UNBLOCK ofrecido declara «Desbloqueo no disponible» y no crea una captura de motivo', () => {
      renderDrawer({
        order: detail({ status: ExecutionOrderStatus.BLOCKED, allowedActions: ['UNBLOCK'] }),
      });
      expect(screen.getByText('Desbloqueo no disponible')).toBeInTheDocument();
      expect(document.querySelector('form')).toBeNull();
      expect(screen.queryByRole('textbox')).toBeNull();
    });
  });

  it.each(MOMENTS[3].statuses)('terminal (%s): resultado y expediente en lectura', (status) => {
    renderDrawer({ order: detail({ status, allowedActions: [...REGISTER, 'CLOSE'] }) });
    expect(screen.getByText('La OT está cerrada y solo puede consultarse.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar OT' })).toBeNull();
    expect(screen.queryByLabelText('Resumen de cierre')).toBeNull();
    expect(document.querySelector('form')).toBeNull();
    expect(
      within(screen.getByRole('region', { name: 'Requisitos' })).queryByRole('button'),
    ).toBeNull();
  });
});

describe('Checklist como índice con cuatro estados (UX §3.2)', () => {
  function stateOf(label: string): HTMLElement {
    return screen.getByRole('listitem', { name: new RegExp(`^${label}:`) });
  }

  it('Cumplido, Pendiente con razón, Sin registrar (opcional) y Estado no disponible', () => {
    const evaluations = pendingEvaluations()
      .filter((evaluation) => evaluation.requirementId !== 'CUSTOMER_SIGNATURE')
      .map((evaluation) =>
        evaluation.requirementId === 'installed-equipment'
          ? { ...evaluation, satisfied: true, reason: undefined }
          : evaluation,
      );
    renderDrawer({
      order: detail({
        allowedActions: [...REGISTER],
        completion: { progress: 25, completed: 1, total: 4, requirements: evaluations },
      }),
    });

    expect(stateOf('Equipos instalados en el sitio del cliente')).toHaveTextContent('Cumplido');
    const pending = stateOf('Prueba de servicio en el sitio');
    expect(pending).toHaveTextContent('Pendiente');
    expect(pending).toHaveTextContent('Falta service-test');
    expect(pending).toHaveTextContent('Obligatorio');
    const optional = stateOf('Registro de la actividad en bitácora \\(NO requerido\\)');
    expect(optional).toHaveTextContent('Sin registrar');
    expect(optional).toHaveTextContent('Opcional');
    expect(optional).toHaveTextContent(
      'Puedes dejar constancia de la instalación. Este registro es opcional y no bloquea el cierre.',
    );
    expect(stateOf('Acta de conformidad firmada por el cliente')).toHaveTextContent(
      'Estado no disponible',
    );
    // Sin evaluación, la ausencia no se convierte en pendiente ni abre una acción.
    expect(
      within(stateOf('Acta de conformidad firmada por el cliente')).queryByRole('button'),
    ).toBeNull();
  });

  it('un requisito opcional cumplido se lee «Cumplido», no «Sin registrar»', () => {
    const evaluations = pendingEvaluations().map((evaluation) =>
      evaluation.requirementId === 'installation-activity'
        ? { ...evaluation, satisfied: true, reason: undefined }
        : evaluation,
    );
    renderDrawer({
      order: detail({
        completion: { progress: 0, completed: 0, total: 4, requirements: evaluations },
      }),
    });
    expect(stateOf('Registro de la actividad en bitácora \\(NO requerido\\)')).toHaveTextContent(
      'Cumplido',
    );
  });

  it('sin completion.requirements todo el índice queda «Estado no disponible», sin acciones', () => {
    renderDrawer({
      order: detail({
        allowedActions: [...REGISTER],
        completion: { progress: 0, completed: 0, total: 4 },
      }),
    });
    const items = within(screen.getByRole('region', { name: 'Requisitos' })).getAllByRole(
      'listitem',
    );
    expect(items).toHaveLength(REQUIREMENT_KEYS.length);
    for (const item of items) {
      expect(item).toHaveTextContent('Estado no disponible');
      expect(within(item).queryByRole('button')).toBeNull();
    }
    expect(
      screen.getByText(
        'No pudimos consultar el estado de los requisitos. Intenta actualizar la orden.',
      ),
    ).toBeInTheDocument();
  });

  it('la acción de cada requisito solo existe si allowedActions la autoriza', () => {
    renderDrawer({ order: detail({ allowedActions: ['REGISTER_EVIDENCE'] }) });
    const checklist = screen.getByRole('region', { name: 'Requisitos' });
    expect(within(checklist).getAllByRole('button')).toHaveLength(3);
    expect(
      within(checklist).queryByRole('button', { name: /^Registrar actividad para / }),
    ).toBeNull();
    expect(
      within(checklist).queryByRole('button', { name: /^Registrar equipo instalado para / }),
    ).toBeNull();
  });

  it('respeta el orden y la etiqueta literal del snapshot, incluido el «NO» en mayúsculas', () => {
    renderDrawer({ order: detail() });
    const labels = within(screen.getByRole('region', { name: 'Requisitos' }))
      .getAllByRole('listitem')
      .map((item) => item.getAttribute('aria-label')?.split(':')[0]);
    expect(labels).toEqual(templateV2().requirements.map((requirement) => requirement.label));
  });
});

describe('Acción ACTIVITY completa (UX §3 fila installation-activity)', () => {
  const activities = (): ExecutionOrderActivity[] => [
    {
      id: 'act-install',
      activityType: 'INSTALLATION',
      description: 'ONU instalada en sala',
      occurredAt: '2026-10-05T14:45:00.000Z',
      actorRef: { type: 'USER', id: 'tech-001' },
      createdAt: '2026-10-05T14:45:00.000Z',
    } as ExecutionOrderActivity,
    {
      id: 'act-note',
      activityType: 'FIELD_NOTE',
      description: 'Nota de otro tipo',
      occurredAt: '2026-10-05T14:50:00.000Z',
      actorRef: { type: 'USER', id: 'tech-001' },
      createdAt: '2026-10-05T14:50:00.000Z',
    } as ExecutionOrderActivity,
  ];

  async function openActivity(props: Partial<DrawerProps> = {}) {
    const user = userEvent.setup();
    const rendered = renderDrawer({
      order: detail({ allowedActions: ['REGISTER_ACTIVITY'] }),
      ...props,
    });
    await user.click(screen.getByRole('button', { name: /^Registrar actividad para / }));
    return { user, ...rendered };
  }

  it('abre la hoja inline con el tipo preseleccionado desde el requisito y bloqueado', async () => {
    await openActivity();
    expect(screen.getByRole('heading', { name: 'Registrar actividad' })).toHaveFocus();
    const type = screen.getByRole('combobox', { name: 'Tipo de actividad' });
    expect(type).toBeDisabled();
    expect(type).toHaveTextContent('Instalación');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('registra con el activityType del requisito, por botón y por Enter, y cierra la hoja', async () => {
    const onRegisterActivity = jest.fn().mockResolvedValue(undefined);
    const onOpenRequirementAction = jest.fn();
    const { user } = await openActivity({ onRegisterActivity, onOpenRequirementAction });
    expect(onOpenRequirementAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'activity', activityType: 'INSTALLATION' }),
    );

    await user.type(screen.getByLabelText('Descripción de la actividad'), 'Cable tendido{Enter}');
    expect(onRegisterActivity).toHaveBeenCalledTimes(1);
    expect(onRegisterActivity).toHaveBeenCalledWith({
      activityType: 'INSTALLATION',
      description: 'Cable tendido',
    });
    expect(screen.queryByLabelText('Descripción de la actividad')).toBeNull();
    expect(onOpenRequirementAction).toHaveBeenLastCalledWith(null);
  });

  it('envía la novedad como medición y conserva lo escrito si el registro falla', async () => {
    const onRegisterActivity = jest.fn().mockResolvedValue(false);
    const { user } = await openActivity({ onRegisterActivity });
    await user.type(screen.getByLabelText('Descripción de la actividad'), 'Falla intermitente');
    await user.click(screen.getByRole('button', { name: 'Marcar como novedad' }));
    await user.click(screen.getByRole('button', { name: 'Registrar actividad' }));
    expect(onRegisterActivity).toHaveBeenCalledWith({
      activityType: 'INSTALLATION',
      description: 'Falla intermitente',
      measurements: [{ key: 'novedad', value: true }],
    });
    expect(screen.getByLabelText('Descripción de la actividad')).toHaveValue('Falla intermitente');
  });

  it('no registra una descripción vacía', async () => {
    const onRegisterActivity = jest.fn();
    await openActivity({ onRegisterActivity });
    expect(screen.getByRole('button', { name: 'Registrar actividad' })).toBeDisabled();
    expect(onRegisterActivity).not.toHaveBeenCalled();
  });

  it('el historial queda bajo su requisito y solo trae actividades de su tipo', () => {
    renderDrawer({
      order: detail({ allowedActions: ['REGISTER_ACTIVITY'] }),
      activities: activities(),
    });
    const item = screen.getByRole('listitem', { name: /^Registro de la actividad en bitácora/ });
    expect(within(item).getByText('ONU instalada en sala')).toBeInTheDocument();
    expect(screen.queryByText('Nota de otro tipo')).toBeNull();
    expect(within(item).getByRole('region', { name: 'Trabajo realizado' })).toBeInTheDocument();
  });

  it('historial vacío: copy de UX §5 y captura separada hasta abrir el acto', () => {
    renderDrawer({ order: detail({ allowedActions: ['REGISTER_ACTIVITY'] }) });
    expect(screen.getByText('Todavía no hay actividades registradas')).toBeInTheDocument();
    expect(screen.queryByLabelText('Descripción de la actividad')).toBeNull();
  });

  it('modificar y eliminar solo se ofrecen con REGISTER_ACTIVITY y cuando el momento lo admite', () => {
    const onUpdateActivity = jest.fn();
    const onDeleteActivity = jest.fn();
    const { unmount } = renderDrawer({
      order: detail({ allowedActions: ['REGISTER_ACTIVITY'] }),
      activities: activities(),
      onUpdateActivity,
      onDeleteActivity,
    });
    expect(screen.getByRole('button', { name: 'Modificar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument();
    unmount();

    renderDrawer({
      order: detail({ allowedActions: [] }),
      activities: activities(),
      onUpdateActivity,
      onDeleteActivity,
    });
    expect(screen.queryByRole('button', { name: 'Modificar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).toBeNull();
  });

  it('modifica una actividad desde el historial con el payload vigente', async () => {
    const onUpdateActivity = jest.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderDrawer({
      order: detail({ allowedActions: ['REGISTER_ACTIVITY'] }),
      activities: activities(),
      onUpdateActivity,
    });
    await user.click(screen.getByRole('button', { name: 'Modificar' }));
    const description = screen.getByLabelText('Descripción');
    await user.clear(description);
    await user.type(description, 'ONU reubicada');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onUpdateActivity).toHaveBeenCalledWith('act-install', {
      activityType: 'INSTALLATION',
      description: 'ONU reubicada',
    });
  });
});

describe('La acción nace del requisito que la originó', () => {
  // R2: «cada requisito de evidencia sube con su propia requirementKey» se movió a
  // ExecutionOrderEvidenceAction.spec.tsx («cada requisito de evidencia sube con su propia
  // clave y su propio tipo»), donde además se afirma el evidenceType publicado.

  it('solo hay una hoja abierta a la vez y su descriptor conserva requirementKey y tipo', async () => {
    const onOpenRequirementAction = jest.fn();
    const user = userEvent.setup();
    renderDrawer({
      order: detail({ allowedActions: ['REGISTER_EVIDENCE', 'REGISTER_ACTIVITY'] }),
      onOpenRequirementAction,
    });
    await user.click(screen.getByRole('button', { name: /^Capturar firma del cliente para / }));
    expect(onOpenRequirementAction).toHaveBeenLastCalledWith({
      kind: 'evidence',
      requirementKey: 'CUSTOMER_SIGNATURE',
      evidenceType: 'SIGNATURE',
      action: 'REGISTER_EVIDENCE',
    });
    await user.click(screen.getByRole('button', { name: /^Registrar actividad para / }));
    expect(screen.getAllByRole('heading', { level: 4 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('Registrar actividad');
  });

  it('informa que la acción se cerró cuando cambia la orden visible', async () => {
    const onOpenRequirementAction = jest.fn();
    const { rerenderDrawer } = renderDrawer({
      order: detail({ id: 'eo-a', allowedActions: ['REGISTER_ACTIVITY'] }),
      onOpenRequirementAction,
    });
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /^Registrar actividad para / }));
    expect(onOpenRequirementAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'activity' }),
    );

    rerenderDrawer({
      order: detail({ id: 'eo-b', allowedActions: ['REGISTER_ACTIVITY'] }),
      onOpenRequirementAction,
    });

    expect(onOpenRequirementAction).toHaveBeenLastCalledWith(null);
    expect(screen.queryByRole('heading', { name: 'Registrar actividad' })).toBeNull();
  });

  it('el acto de consumo monta la custodia y el formulario y los retira al cancelar', async () => {
    const user = userEvent.setup();
    renderDrawer({ order: detail({ allowedActions: ['REGISTER_ITEM_USAGE'] }) });
    expect(screen.queryByText('En custodia del ejecutor')).toBeNull();
    const trigger = screen.getByRole('button', { name: /^Registrar equipo instalado para / });
    await user.click(trigger);
    expect(screen.getByText('En custodia del ejecutor')).toBeInTheDocument();
    expect(screen.getByLabelText('Cantidad')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByText('En custodia del ejecutor')).toBeNull();
    expect(trigger).toHaveFocus();
  });
});

describe('Cierre: el borrador sobrevive al refresco y no se arrastra a otra orden', () => {
  const closable = (id = 'eo-b0') => detail({ id, allowedActions: ['CLOSE', 'REGISTER_ACTIVITY'] });

  it('conserva el resumen escrito cuando el detalle se vuelve a leer', () => {
    const { rerenderDrawer } = renderDrawer({ order: closable() });
    fireEvent.change(screen.getByLabelText(/Resumen de cierre/), {
      target: { value: 'Instalación completa' },
    });
    rerenderDrawer({ order: closable(), isLoading: true });
    expect(screen.getByLabelText('Cargando orden de trabajo')).toBeInTheDocument();
    rerenderDrawer({ order: closable(), isLoading: false });
    expect(screen.getByLabelText(/Resumen de cierre/)).toHaveValue('Instalación completa');
  });

  it('descarta el borrador al cambiar de orden', () => {
    const { rerenderDrawer } = renderDrawer({ order: closable('eo-a') });
    fireEvent.change(screen.getByLabelText(/Resumen de cierre/), {
      target: { value: 'Resumen de la orden A' },
    });
    rerenderDrawer({ order: closable('eo-b') });
    expect(screen.getByLabelText(/Resumen de cierre/)).toHaveValue('');
  });
});
