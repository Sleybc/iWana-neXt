import { BillingDocumentInstallationBreakdownSchema } from '@iwana/shared';
import type { EntityManager } from 'typeorm';
import {
  buildDocumentInstallationBreakdown,
  hasInstallationLine,
  installationBreakdownRowsByContract,
  type InstallationBreakdownReadRow,
} from './billing-installation-breakdown.read';

const CONTRACT = '00000000-0000-4000-8000-000000000032';
const ORDER = '00000000-0000-4000-8000-000000000050';
const LATE_ORDER = '00000000-0000-4000-8000-000000000051';

function row(overrides: Partial<InstallationBreakdownReadRow> = {}): InstallationBreakdownReadRow {
  return {
    contract_id: CONTRACT,
    execution_order_id: ORDER,
    execution_order_number: 'OT-0001',
    execution_order_closed_at: new Date('2026-11-13T15:00:00.000Z'),
    position: 1,
    description: 'Cable drop',
    unit_of_measure: 'M',
    quantity: '60.00',
    serial_numbers: [],
    is_loan: false,
    value_source: 'PRECIO_COMERCIAL',
    unit_reference_value: '1500.00',
    reference_value: '90000.00',
    ...overrides,
  };
}

const installationLine = { kind: 'INSTALACION', total: '119000.00' };
const planLine = { kind: 'PLAN', total: '59500.00' };

describe('Desglose informativo de la instalación (spec MOD14 2026-11-13 R3–R5)', () => {
  it('CA-1: suma el valor real y toma como valor cobrado el total de la línea INSTALACION', () => {
    const breakdown = buildDocumentInstallationBreakdown(
      [
        row(),
        row({
          position: 2,
          description: 'Conector SC/APC',
          unit_of_measure: 'UND',
          quantity: '2.00',
          value_source: 'COSTO_PROMEDIO',
          unit_reference_value: '2500.00',
          reference_value: '5000.00',
        }),
      ],
      [planLine, installationLine],
      false,
    );
    expect(breakdown).toEqual({
      executionOrders: [{ executionOrderNumber: 'OT-0001', closedAt: '2026-11-13T15:00:00.000Z' }],
      items: [
        expect.objectContaining({
          description: 'Cable drop',
          quantity: '60.00',
          unitOfMeasure: 'M',
        }),
        expect.objectContaining({ description: 'Conector SC/APC', referenceValue: '5000.00' }),
      ],
      realValue: '95000.00',
      chargedValue: '119000.00',
      itemsWithoutValue: 0,
      serialsProtected: false,
    });
    expect(BillingDocumentInstallationBreakdownSchema.safeParse(breakdown).success).toBe(true);
  });

  it('CA-3: el equipo en comodato queda marcado y suma su valor de referencia', () => {
    const breakdown = buildDocumentInstallationBreakdown(
      [
        row({
          description: 'Router WiFi',
          unit_of_measure: 'UND',
          quantity: '1.00',
          is_loan: true,
          serial_numbers: '["SN-ROUTER-1"]',
          unit_reference_value: '180000.00',
          reference_value: '180000.00',
        }),
      ],
      [installationLine],
      false,
    );
    expect(breakdown?.items[0]).toMatchObject({
      isLoan: true,
      serialNumbers: ['SN-ROUTER-1'],
      referenceValue: '180000.00',
    });
    expect(breakdown?.realValue).toBe('180000.00');
  });

  it('un ítem sin valor no suma, se cuenta aparte y expone valores nulos', () => {
    const breakdown = buildDocumentInstallationBreakdown(
      [
        row(),
        row({
          position: 2,
          value_source: 'SIN_VALOR',
          unit_reference_value: null,
          reference_value: null,
        }),
      ],
      [installationLine],
      false,
    );
    expect(breakdown?.realValue).toBe('90000.00');
    expect(breakdown?.itemsWithoutValue).toBe(1);
    expect(breakdown?.items[1]).toMatchObject({ unitReferenceValue: null, referenceValue: null });
  });

  it('protege los seriales del titular bloqueado o anonimizado sin tocar los valores', () => {
    const breakdown = buildDocumentInstallationBreakdown(
      [row({ is_loan: true, serial_numbers: ['SN-1', 'SN-2'] })],
      [installationLine],
      true,
    );
    expect(breakdown?.serialsProtected).toBe(true);
    expect(breakdown?.items[0]?.serialNumbers).toEqual([]);
    expect(breakdown?.realValue).toBe('90000.00');
  });

  it('agrupa varias OT del contrato (R5) y lista la OT sin ítems sin sumar', () => {
    const breakdown = buildDocumentInstallationBreakdown(
      [
        row(),
        row({
          execution_order_id: LATE_ORDER,
          execution_order_number: 'OT-0002',
          execution_order_closed_at: '2026-11-20T10:00:00Z',
          position: null,
          value_source: null,
          description: null,
          quantity: null,
          unit_of_measure: null,
          is_loan: null,
          unit_reference_value: null,
          reference_value: null,
          serial_numbers: null,
        }),
      ],
      [installationLine],
      false,
    );
    expect(breakdown?.executionOrders.map((order) => order.executionOrderNumber)).toEqual([
      'OT-0001',
      'OT-0002',
    ]);
    expect(breakdown?.items).toHaveLength(1);
  });

  it('es null sin línea INSTALACION o sin consumo registrado', () => {
    expect(buildDocumentInstallationBreakdown([row()], [planLine], false)).toBeNull();
    expect(buildDocumentInstallationBreakdown(undefined, [installationLine], false)).toBeNull();
    expect(buildDocumentInstallationBreakdown([], [installationLine], false)).toBeNull();
    expect(hasInstallationLine([planLine])).toBe(false);
    expect(hasInstallationLine([installationLine])).toBe(true);
  });

  it('lee por tenant y contrato con parámetros y agrupa por contrato', async () => {
    const other = '00000000-0000-4000-8000-000000000099';
    const query = jest.fn().mockResolvedValue([row(), row({ contract_id: other })]);
    const result = await installationBreakdownRowsByContract(
      { query } as unknown as EntityManager,
      'tenant-1',
      [CONTRACT, CONTRACT, other],
    );
    expect(query).toHaveBeenCalledWith(expect.stringContaining('b.tenant_id = $1'), [
      'tenant-1',
      [CONTRACT, other],
    ]);
    expect(query.mock.calls[0]?.[0]).toContain('billing_installation_breakdowns');
    expect(result.get(CONTRACT)).toHaveLength(1);
    expect(result.get(other)).toHaveLength(1);
  });

  it('no consulta si no hay contratos', async () => {
    const query = jest.fn();
    const result = await installationBreakdownRowsByContract(
      { query } as unknown as EntityManager,
      'tenant-1',
      [],
    );
    expect(result.size).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });
});
