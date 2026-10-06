// B0 (Ola 2b) — contrato de slots: demuestra que R2 (evidencia) y R3 (consumo)
// pueden sustituir el contenido de sus archivos sin editar el shell. Los tres
// archivos de slot se reemplazan aquí por dobles que solo conocen el sobre de
// props de `execution-order-slots.ts`; el drawer sigue funcionando con ellos.
import { useEffect } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExecutionOrderStatus, WfmWorkType } from '@iwana/shared';
import type { ExecutionOrderTemplateVersion } from '@iwana/shared';
import type { ExecutionOrderDetailResponse } from '@/lib/api-client';
import { ExecutionOrderDrawer } from './ExecutionOrderDrawer';

const mockEvidenceAction = jest.fn();
const mockEvidenceHistory = jest.fn();
const mockMaterialAction = jest.fn();
const mockMaterialHistory = jest.fn();
const mockActivityAction = jest.fn();
const mockActivityHistory = jest.fn();
const mockSubmit = jest.fn();

jest.mock('./ExecutionOrderEvidenceAction', () => ({
  ExecutionOrderEvidenceAction: (props: unknown) => {
    mockEvidenceAction(props);
    return <p>Doble del slot de evidencia</p>;
  },
  ExecutionOrderEvidenceHistory: (props: unknown) => {
    mockEvidenceHistory(props);
    return <p>Doble del historial de evidencia</p>;
  },
}));
jest.mock('./ExecutionOrderMaterialAction', () => ({
  ExecutionOrderMaterialAction: (props: { bindSubmit: (h: (() => void) | null) => void }) => {
    mockMaterialAction(props);
    useEffect(() => {
      props.bindSubmit(mockSubmit);
      return () => props.bindSubmit(null);
    });
    return (
      <form data-requirement-submit>
        <button type="submit">Enviar doble de consumo</button>
      </form>
    );
  },
  ExecutionOrderMaterialHistory: (props: unknown) => {
    mockMaterialHistory(props);
    return <p>Doble del historial de consumo</p>;
  },
  ExecutionOrderMaterialHistoryFooter: () => null,
  ExecutionOrderMaterialUnattributedHistory: () => null,
}));
jest.mock('./ExecutionOrderActivityAction', () => ({
  ExecutionOrderActivityAction: (props: unknown) => {
    mockActivityAction(props);
    return <p>Doble de la acción de actividad</p>;
  },
  ExecutionOrderActivityHistory: (props: unknown) => {
    mockActivityHistory(props);
    return <p>Doble del historial de actividad</p>;
  },
}));

function template(): ExecutionOrderTemplateVersion {
  return {
    id: 'tplv',
    templateId: 'tpl',
    key: 'T',
    version: 1,
    label: 'Plantilla',
    workType: WfmWorkType.INSTALLATION,
    status: 'PUBLISHED',
    requirements: [
      { key: 'mat', label: 'Material', required: true, kind: 'MATERIAL', itemCategory: 'CPE' },
      { key: 'foto', label: 'Foto', required: true, kind: 'EVIDENCE', evidenceType: 'PHOTO' },
      {
        key: 'act',
        label: 'Actividad',
        required: false,
        kind: 'ACTIVITY',
        activityType: 'INSTALLATION',
      },
    ],
    reasonCatalogs: [],
  };
}

function order(): ExecutionOrderDetailResponse {
  return {
    id: 'eo-contract',
    number: 'OTE-C-001',
    version: 7,
    status: ExecutionOrderStatus.IN_PROGRESS,
    annulled: false,
    workType: WfmWorkType.INSTALLATION,
    template: {
      id: 'tpl',
      key: 'T',
      version: 1,
      label: 'Plantilla',
      requirements: template().requirements,
    },
    schedule: { eventId: null, window: null },
    assignee: { type: 'TECHNICIAN', id: 'tech-1', displayLabel: 'Técnico' },
    site: { id: 's', label: 'Sitio' },
    completion: {
      progress: 0,
      requirements: template().requirements.map((requirement) => ({
        requirementId: requirement.key,
        label: requirement.label,
        kind: requirement.kind,
        satisfied: false,
      })),
    },
    syncState: 'IN_SYNC',
    inventoryReconciliation: 'NOT_REQUIRED',
    allowedActions: ['REGISTER_ACTIVITY', 'REGISTER_ITEM_USAGE', 'REGISTER_EVIDENCE'],
    createdAt: '2026-10-05T12:00:00.000Z',
    updatedAt: '2026-10-05T12:00:00.000Z',
  };
}

const onUploadEvidence = jest.fn();
function renderDrawer() {
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
      onStart={jest.fn()}
      onRegisterActivity={jest.fn()}
      onRegisterItemUsage={jest.fn()}
      onUploadEvidence={onUploadEvidence}
      onCloseOrder={jest.fn()}
    />,
  );
}

describe('contrato de slots del expediente (B0)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('monta el historial de cada requisito con el sobre {order, requirement, context}', () => {
    renderDrawer();
    expect(screen.getByText('Doble del historial de evidencia')).toBeInTheDocument();
    expect(screen.getByText('Doble del historial de consumo')).toBeInTheDocument();
    expect(screen.getByText('Doble del historial de actividad')).toBeInTheDocument();
    const props = mockEvidenceHistory.mock.calls[0]![0];
    expect(Object.keys(props).sort()).toEqual(['context', 'order', 'requirement']);
    expect(props.order.id).toBe('eo-contract');
    expect(props.requirement).toMatchObject({
      key: 'foto',
      kind: 'EVIDENCE',
      evidenceType: 'PHOTO',
    });
    // `context` es el contrato público del drawer: el slot toma de ahí sus datos y callbacks.
    expect(props.context.onUploadEvidence).toBe(onUploadEvidence);
    expect(props.context.template).toBeDefined();
  });

  it('el slot de evidencia recibe descriptor, bindSubmit y onClose; ninguna prop transporta usuario ni rol', async () => {
    renderDrawer();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Adjuntar evidencia para Foto' }));
    expect(screen.getByText('Doble del slot de evidencia')).toBeInTheDocument();
    const props = mockEvidenceAction.mock.calls[0]![0];
    expect(Object.keys(props).sort()).toEqual([
      'action',
      'bindSubmit',
      'context',
      'onClose',
      'order',
      'requirement',
    ]);
    expect(props.action).toEqual({
      kind: 'evidence',
      requirementKey: 'foto',
      evidenceType: 'PHOTO',
      action: 'REGISTER_EVIDENCE',
    });
    for (const forbidden of ['user', 'role', 'assignee', 'responsible']) {
      expect(Object.keys(props)).not.toContain(forbidden);
    }
  });

  it('onClose del slot cierra la hoja y devuelve el foco al disparador', async () => {
    renderDrawer();
    const user = userEvent.setup();
    const trigger = screen.getByRole('button', { name: 'Adjuntar evidencia para Foto' });
    await user.click(trigger);
    act(() => mockEvidenceAction.mock.calls[0]![0].onClose());
    expect(screen.queryByText('Doble del slot de evidencia')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('el submit nativo del formulario del slot de consumo llega al manejador que él registró', async () => {
    renderDrawer();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Registrar equipo instalado para / }));
    const props = mockMaterialAction.mock.calls[0]![0];
    expect(props.action).toMatchObject({
      kind: 'consumption',
      requirementKey: 'mat',
      itemCategory: 'CPE',
    });
    await user.click(screen.getByRole('button', { name: 'Enviar doble de consumo' }));
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    // Retirado el slot (cancelar), ya no queda manejador al que delegar.
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('button', { name: 'Enviar doble de consumo' })).toBeNull();
  });
});
