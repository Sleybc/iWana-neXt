/** Actividad de la ficha: históricos importados de UISP (ADR-110 D5, D14). */
import type { BillingAccountStatement, LifecycleChangeRecord } from '@iwana/shared';
import {
  formatActivityDate,
  lifecycleToActivity,
  sortActivity,
  statementToActivity,
} from './subscriber-activity';
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
    expect(item?.title).toBe('Factura histórica de UISP UISP-778');
  });

  it('un borrador propio sigue siendo «Documento de cobro en borrador»', () => {
    const [item] = statementToActivity(
      statement([
        { id: 'd2', number: null, status: 'BORRADOR', createdAt: '2026-11-12T10:00:00.000Z' },
      ]),
    );
    expect(item?.title).toBe('Factura en borrador');
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

describe('subscriber-activity — fechas civiles', () => {
  it('una fecha sin hora se muestra ese día y sin hora (no «7:00 p. m.» del día anterior)', () => {
    const text = formatActivityDate('2026-11-13');
    expect(text).toContain('13');
    expect(text).not.toMatch(/12|p\.\s?m\./u);
  });

  it('una marca de tiempo conserva la hora', () => {
    expect(formatActivityDate('2026-11-13T15:30:00.000Z')).toMatch(/\d{1,2}:\d{2}/u);
  });

  it('ordena la fecha civil por su día local', () => {
    const items = sortActivity([
      { key: 'a', kind: 'cobro', at: '2026-11-12T23:00:00.000Z', title: 'A', detail: '' },
      { key: 'b', kind: 'cobro', at: '2026-11-14', title: 'B', detail: '' },
    ] as Parameters<typeof sortActivity>[0]);
    expect(items[0]?.key).toBe('b');
  });
});
