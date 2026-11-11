import type { ContractDocumentSnapshot } from '@iwana/shared';

/** Snapshot sintético (sin PII real) para pruebas del PDF del contrato. */
export function buildContractSnapshotFixture(
  overrides: Partial<ContractDocumentSnapshot> = {},
): ContractDocumentSnapshot {
  return {
    snapshotVersion: 1,
    contractId: '11111111-1111-4111-8111-111111111111',
    executionOrderId: '22222222-2222-4222-8222-222222222222',
    template: { legalTextId: '33333333-3333-4333-8333-333333333333', version: '1.0-prueba' },
    operator: {
      legalName: 'Operador Sintético S.A.S.',
      nit: '900000000-1',
      qualityAndCoverageUrl: 'https://operador.example.invalid/calidad',
      customerServiceChannels: [
        { kind: 'PHONE', value: '6010000000', label: null },
        { kind: 'EMAIL', value: 'soporte@operador.example.invalid', label: 'Soporte' },
      ],
      reconnectionFee: 15000,
      annualIncreaseCapPercent: 5.5,
      equipmentIncidentReportChannel: 'Línea 6010000000 opción 3',
      otherConditions: null,
    },
    holder: {
      fullName: 'Titular <Sintético> & Cía',
      documentType: 'CC',
      documentNumber: '1000000001',
      email: 'titular@example.invalid',
      phone: '3000000000',
    },
    service: {
      planId: 'plan-sintetico',
      planName: 'Fibra 300',
      technology: 'FIBER',
      downloadMbps: 300,
      uploadMbps: 150,
      monthlyPrice: 80000,
      vatRatePercent: 19,
      vatAmount: 15200,
      monthlyTotal: 95200,
      stratum: 3,
      serviceUsage: 'RESIDENTIAL',
    },
    installation: { address: 'Calle 1 # 2-3', city: 'Bogotá', department: 'Cundinamarca' },
    equipment: [{ serialNumber: 'SN-0001', macAddress: 'AA:BB:CC:00:00:01', model: 'ONT X1' }],
    permanence: null,
    capturedAt: '2026-11-11T15:00:00.000Z',
    ...overrides,
  };
}
