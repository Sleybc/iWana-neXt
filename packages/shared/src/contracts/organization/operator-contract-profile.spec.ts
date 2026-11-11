import {
  OperatorContractProfileSchema,
  UpdateOperatorContractProfileSchema,
  missingOperatorContractFields,
} from './operator-contract-profile';

const editable = {
  qualityAndCoverageUrl: 'https://operador.example/calidad',
  customerServiceChannels: [{ kind: 'PHONE', value: '6015550000', label: 'Línea de atención' }],
  reconnectionFee: 15000,
  annualIncreaseCapPercent: 5.5,
  equipmentIncidentReportChannel: 'Línea de atención, opción 3',
  otherConditions: null,
};

describe('datos del operador para el contrato', () => {
  it('acepta la actualización sin razón social ni NIT', () => {
    expect(UpdateOperatorContractProfileSchema.safeParse(editable).success).toBe(true);
    expect(
      UpdateOperatorContractProfileSchema.safeParse({ ...editable, legalName: 'X' }).success,
    ).toBe(false);
  });

  it('rechaza tope fuera de 0-100, URL inválida y monto con tres decimales', () => {
    const invalid = [
      { annualIncreaseCapPercent: 101 },
      { qualityAndCoverageUrl: 'web' },
      { reconnectionFee: 1.234 },
      { customerServiceChannels: [{ kind: 'WHATSAPP', value: '300', label: null }] },
    ];
    for (const patch of invalid) {
      expect(UpdateOperatorContractProfileSchema.safeParse({ ...editable, ...patch }).success).toBe(
        false,
      );
    }
  });

  it('lista los obligatorios faltantes en orden; otras condiciones es opcional', () => {
    const profile = OperatorContractProfileSchema.parse({
      legalName: 'Operador SAS',
      nit: '900000000',
      ...editable,
      updatedAt: null,
    });
    expect(missingOperatorContractFields(profile)).toEqual([]);
    expect(
      missingOperatorContractFields({
        ...profile,
        nit: null,
        customerServiceChannels: [],
        equipmentIncidentReportChannel: '  ',
        reconnectionFee: 0,
      }),
    ).toEqual(['nit', 'customerServiceChannels', 'equipmentIncidentReportChannel']);
  });
});
