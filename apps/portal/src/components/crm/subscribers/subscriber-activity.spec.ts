/** Actividad de la ficha: históricos importados de UISP (ADR-110 D5, D14). */
import type { BillingAccountStatement, LifecycleChangeRecord } from '@iwana/shared';
import { lifecycleToActivity, statementToActivity } from './subscriber-activity';
import { LIFECYCLE_REASON_LABELS } from './subscriber-lifecycle-ui';

function statement(documents: unknown[]): BillingAccountStatement {
  return { documents, payments: [] } as unknown as BillingAccountStatement;
}

describe('subscriber-activity — importados', () => {
  it('un IMPORTADO se titula «Histórico importado <número externo>», no borrador', () => {
    const [item] = statementToActivity(
      statement([
        {
          id: 'd1',
          number: null,
          externalNumber: 'UISP-778',
          status: 'IMPORTADO',
          issueDate: '2024-05-01',
          createdAt: '2026-11-12T10:00:00.000Z',
          total: '50.00',
        },
      ]),
    );
    expect(item?.title).toBe('Histórico importado UISP-778');
  });

  it('un borrador propio sigue siendo «Documento de cobro en borrador»', () => {
    const [item] = statementToActivity(
      statement([
        { id: 'd2', number: null, status: 'BORRADOR', createdAt: '2026-11-12T10:00:00.000Z' },
      ]),
    );
    expect(item?.title).toBe('Documento de cobro en borrador');
  });

  it('el cambio de estado importado muestra su origen y motivo en español', () => {
    const record = {
      id: 'r1',
      entityType: 'SUBSCRIBER',
      entityId: 's1',
      toStatus: 'ACTIVO',
      reasonCode: 'HISTORICO_IMPORTADO',
      source: 'IMPORTADO',
      changedAt: '2026-11-12T10:00:00.000Z',
      note: null,
    } as unknown as LifecycleChangeRecord;
    const item = lifecycleToActivity(record, [], false);
    expect(item.detail).toBe('Histórico importado · Importado de UISP');
    expect(LIFECYCLE_REASON_LABELS.HISTORICO_IMPORTADO).toBe('Histórico importado');
  });
});
