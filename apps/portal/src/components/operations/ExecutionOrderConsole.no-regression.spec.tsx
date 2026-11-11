// MOD05 Cierre de venta · W0 · Inventario de no regresión de la consola de OT (AI-SR-QA).
//
// Fija lo que la consola hace HOY antes de que el bloque C agregue el paso «Contrato»
// (plan 2026-11-11-mod05-cierre-de-venta-contrato-firmado §2, spec §0 «complementar sin
// retroceso», H5). Reglas de robustez:
// - Se consulta por rol y nombre accesible, nunca por número total de botones ni de pasos:
//   un paso nuevo no rompe el inventario, la desaparición de uno existente sí.
// - El orden solo se fija entre pasos actuales (actividad antes que firma), no contra el final.
// - Datos ficticios, sin PII.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExecutionOrderResult, ExecutionOrderStatus, WfmWorkType } from '@iwana/shared';
import type {
  ExecutionOrderAllowedAction,
  ExecutionOrderEvidence,
  ExecutionOrderTemplateVersion,
} from '@iwana/shared';
import type { ExecutionOrderDetailResponse } from '@/lib/api-client';
import { ExecutionOrderDrawer } from './ExecutionOrderDrawer';
import {
  drawStroke,
  installCanvasMocks,
  installPointerEvent,
} from './execution-order-canvas.test-helper';

const TECHNICIAN_ACTIONS: ExecutionOrderAllowedAction[] = [
  'REGISTER_ACTIVITY',
  'REGISTER_ITEM_USAGE',
  'REGISTER_EVIDENCE',
  'BLOCK',
  'CLOSE',
];

function template(withAcceptance = false): ExecutionOrderTemplateVersion {
  return {
    id: 'tplv-w0',
    templateId: 'tpl-w0',
    key: 'INSTALACION_W0',
    version: 1,
    label: 'Instalación W0',
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
      ...(withAcceptance
        ? [
            {
              key: 'req-customer-acceptance',
              label: 'Aceptación del cliente',
              required: true,
              kind: 'COMPLIANCE' as const,
              policyKey: 'CUSTOMER_ACCEPTANCE',
            },
          ]
        : []),
    ],
    reasonCatalogs: [],
  } as ExecutionOrderTemplateVersion;
}

function order(
  overrides: Partial<ExecutionOrderDetailResponse> = {},
): ExecutionOrderDetailResponse {
  const status = overrides.status ?? ExecutionOrderStatus.IN_PROGRESS;
  return {
    id: 'eo-w0',
    number: 'OTE-W0-001',
    version: 1,
    status,
    annulled: false,
    workType: WfmWorkType.INSTALLATION,
    template: { id: 'tpl-w0', key: 'INSTALACION_W0', version: 1, label: 'Instalación W0' },
    schedule: {
      eventId: 'se-w0',
      window: { startAt: '2026-11-11T14:00:00.000Z', endAt: '2026-11-11T16:00:00.000Z' },
    },
    assignee: { type: 'TECHNICIAN', id: 'tech-w0', displayLabel: 'Técnico ficticio' },
    site: { id: 'site-w0', label: 'Sitio ficticio' },
    completion: {
      progress: 0,
      requirements: template().requirements.map((requirement) => ({
        requirementId: requirement.key,
        label: requirement.label ?? requirement.key,
        kind: requirement.kind,
        satisfied: false,
      })),
    },
    syncState: 'IN_SYNC',
    inventoryReconciliation: 'NOT_REQUIRED',
    allowedActions: TECHNICIAN_ACTIONS,
    createdAt: '2026-11-11T12:00:00.000Z',
    updatedAt: '2026-11-11T12:00:00.000Z',
    ...overrides,
  };
}

function signedActa(): ExecutionOrderEvidence[] {
  return [
    {
      id: 'ev-w0-signature',
      mediaAssetId: 'ma-w0-signature',
      evidenceType: 'SIGNATURE',
      requirementKey: 'CUSTOMER_SIGNATURE',
      capturedAt: '2026-11-11T15:10:00.000Z',
      receivedAt: '2026-11-11T15:11:00.000Z',
      status: 'AVAILABLE',
      createdAt: '2026-11-11T15:11:00.000Z',
    },
  ] as ExecutionOrderEvidence[];
}

type DrawerProps = Parameters<typeof ExecutionOrderDrawer>[0];

function renderConsole(props: Partial<DrawerProps> = {}) {
  return render(
    <ExecutionOrderDrawer
      open
      order={order()}
      activities={[]}
      itemUsage={[]}
      evidence={[]}
      template={template()}
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

const STEP = {
  activity: /^Registrar actividad/,
  photo: /^Añadir fotos del trabajo/,
  signature: /^Capturar firma del cliente/,
};

beforeAll(installPointerEvent);
beforeEach(() => {
  jest.clearAllMocks();
  installCanvasMocks();
});

describe('W0 consola de OT — pasos por momento', () => {
  it('antes de iniciar solo ofrece «Iniciar ejecución» y ningún paso de captura', () => {
    renderConsole({
      order: order({ status: ExecutionOrderStatus.ASSIGNED, allowedActions: ['START'] }),
    });

    expect(screen.getByRole('button', { name: 'Iniciar ejecución' })).toBeEnabled();
    for (const step of Object.values(STEP)) {
      expect(screen.queryByRole('button', { name: step })).toBeNull();
    }
  });

  it('en ejecución el técnico tiene actividad, fotos y firma del cliente, y la firma va después de la actividad', () => {
    renderConsole();

    const checklist = screen.getByRole('region', { name: 'Requisitos' });
    const activity = within(checklist).getByRole('button', { name: STEP.activity });
    const photo = within(checklist).getByRole('button', { name: STEP.photo });
    const signature = within(checklist).getByRole('button', { name: STEP.signature });
    // La firma cierra la secuencia de captura aunque la plantilla la declare primero.
    expect(
      activity.compareDocumentPosition(signature) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      photo.compareDocumentPosition(signature) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cerrar OT' })).toBeInTheDocument();
  });

  it('sin permisos de registro (supervisión) no hay pasos de captura ni cierre', () => {
    renderConsole({
      order: order({ allowedActions: ['CREATE_FOLLOW_UP'] as ExecutionOrderAllowedAction[] }),
    });

    for (const step of Object.values(STEP)) {
      expect(screen.queryByRole('button', { name: step })).toBeNull();
    }
    expect(screen.queryByRole('button', { name: 'Cerrar OT' })).toBeNull();
    expect(screen.getByText('No puedes cerrar esta orden.')).toBeInTheDocument();
  });

  it('una OT cerrada queda en solo lectura', () => {
    renderConsole({
      order: order({
        status: ExecutionOrderStatus.COMPLETED,
        result: ExecutionOrderResult.EXECUTED,
        allowedActions: [],
      }),
    });

    expect(screen.getByText('La OT está cerrada y solo puede consultarse.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar OT' })).toBeNull();
    expect(screen.queryByRole('button', { name: STEP.signature })).toBeNull();
  });
});

describe('W0 consola de OT — acta de conformidad firmada', () => {
  it('captura la firma del cliente en el lienzo y la sube como PNG del requisito CUSTOMER_SIGNATURE', async () => {
    const onUploadEvidence = jest.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    renderConsole({ onUploadEvidence });

    await user.click(screen.getByRole('button', { name: STEP.signature }));
    const capture = screen.getByRole('group', { name: 'Captura de firma del cliente' });
    expect(within(capture).getByText(/acta de conformidad/)).toBeInTheDocument();
    expect(within(capture).queryByRole('textbox')).toBeNull();

    drawStroke(within(capture).getByRole('img', { name: 'Área de firma' }));
    await user.click(within(capture).getByRole('button', { name: 'Guardar firma' }));

    await waitFor(() => expect(onUploadEvidence).toHaveBeenCalledTimes(1));
    const [file, requirementKey, options] = onUploadEvidence.mock.calls[0]!;
    expect(file).toBeInstanceOf(File);
    expect((file as File).type).toBe('image/png');
    expect(requirementKey).toBe('CUSTOMER_SIGNATURE');
    expect(options).toEqual(expect.objectContaining({ evidenceType: 'SIGNATURE' }));
  });

  it('si la plantilla exige aceptación y no hay firma validada, el cierre queda bloqueado', async () => {
    const user = userEvent.setup();
    renderConsole({ template: template(true) });

    await user.type(screen.getByRole('textbox', { name: 'Resumen de cierre' }), 'Instalado');

    expect(screen.getByText(/Aceptación del cliente\s*\(obligatoria\)/)).toBeInTheDocument();
    expect(
      screen.getByText(/No hay una firma de cliente disponible y validada/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar OT' })).toBeDisabled();
  });

  it('cierra la OT con el acta firmada: envía customerAcceptance SIGNATURE con la evidencia elegida', async () => {
    const onCloseOrder = jest.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderConsole({ template: template(true), evidence: signedActa(), onCloseOrder });

    await user.type(screen.getByRole('textbox', { name: 'Resumen de cierre' }), 'Instalado');
    const artifact = screen.getByRole('combobox', { name: 'Referencia de evidencia' });
    await user.click(artifact);
    await user.click(screen.getByRole('option', { name: /Firma del cliente/ }));
    const method = screen.getByRole('combobox', { name: 'Forma de aceptación' });
    await user.click(method);
    await user.click(screen.getByRole('option', { name: 'Firma' }));
    const close = screen.getByRole('button', { name: 'Cerrar OT' });
    await waitFor(() => expect(close).toBeEnabled());
    await user.click(close);
    await user.click(await screen.findByRole('button', { name: 'Confirmar cierre' }));

    expect(onCloseOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        result: ExecutionOrderResult.EXECUTED,
        summary: 'Instalado',
        customerAcceptance: { artifactId: 'ma-w0-signature', method: 'SIGNATURE' },
      }),
    );
  });
});
