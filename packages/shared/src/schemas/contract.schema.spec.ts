import {
  ContractCreateSchema,
  ContractPlanChangeSchema,
  ContractResponseSchema,
  ContractServicePointUpdateSchema,
} from './contract.schema';
import { ServiceUsage, VatConcept } from '../enums/taxation';

describe('ContractPlanChangeSchema', () => {
  const command = {
    planId: 'plan-nuevo',
    expectedUpdatedAt: '2026-10-30T12:00:00.000Z',
    expectedMonthlyPrice: 80000,
  };
  it('acepta la acción con versión explícita', () => {
    expect(ContractPlanChangeSchema.parse(command)).toEqual(command);
  });
  it.each([
    { ...command, planId: '' },
    { ...command, planId: 'x'.repeat(121) },
    { ...command, expectedUpdatedAt: 'ayer' },
    { planId: 'plan-nuevo' },
    { ...command, monthlyPrice: 1 },
    { ...command, planSnapshotJson: {} },
    { ...command, tenantId: 'otro' },
    { ...command, expectedMonthlyPrice: -1 },
    { ...command, expectedMonthlyPrice: Infinity },
  ])('rechaza payload inválido o campos fuera del contrato: %j', (input) => {
    expect(ContractPlanChangeSchema.safeParse(input).success).toBe(false);
  });
});

describe('C-API-3 contrato', () => {
  it('rechaza que el cliente asigne el id del soporte de estrato', () => {
    const parsed = ContractCreateSchema.safeParse({
      subscriberId: '00000000-0000-4000-8000-000000000001',
      planId: 'plan-1',
      planSnapshotJson: {},
      serviceUsage: ServiceUsage.RESIDENTIAL,
      installationStratum: 2,
      stratumEvidenceMediaId: '00000000-0000-4000-8000-000000000002',
    });

    expect(parsed.success).toBe(false);
  });

  it('rechaza uso residencial sin estrato', () => {
    const parsed = ContractCreateSchema.safeParse({
      subscriberId: '00000000-0000-4000-8000-000000000001',
      planId: 'plan-1',
      planSnapshotJson: {},
      serviceUsage: ServiceUsage.RESIDENTIAL,
    });

    expect(parsed.success).toBe(false);
  });

  it('permite un borrador incompleto sin serviceUsage', () => {
    expect(
      ContractCreateSchema.safeParse({
        subscriberId: '00000000-0000-4000-8000-000000000001',
        planId: 'plan-1',
        planSnapshotJson: {},
      }).success,
    ).toBe(true);
  });

  it('requiere al menos un campo editable en PATCH del punto de servicio', () => {
    expect(ContractServicePointUpdateSchema.safeParse({}).success).toBe(false);
    expect(
      ContractServicePointUpdateSchema.safeParse({ stratumEvidenceMediaId: null }).success,
    ).toBe(false);
  });

  it('no admite que el cuerpo declare concepto fiscal o snapshot', () => {
    const parsed = ContractCreateSchema.safeParse({
      subscriberId: '00000000-0000-4000-8000-000000000001',
      planId: 'plan-1',
      planSnapshotJson: {},
      vatConcept: VatConcept.INTERNET_ACCESS,
      vatSnapshot: null,
    });

    expect(parsed.success).toBe(false);
  });

  it('valida el resultado fiscal dentro de la respuesta del contrato', () => {
    const parsed = ContractResponseSchema.safeParse({
      id: '00000000-0000-4000-8000-000000000001',
      tenantId: '00000000-0000-4000-8000-000000000002',
      quoteId: null,
      subscriberId: '00000000-0000-4000-8000-000000000003',
      planId: 'plan-1',
      planSnapshotJson: {},
      status: 'ACTIVE',
      statusReasonCode: null,
      statusChangedAt: null,
      alias: 'Servicio',
      installationAddress: null,
      installationCity: null,
      installationDepartment: null,
      installationPostalCode: null,
      installationNotes: null,
      customerSegment: null,
      serviceUsage: ServiceUsage.RESIDENTIAL,
      installationStratum: 2,
      stratumEvidenceMediaId: '00000000-0000-4000-8000-000000000004',
      vatSnapshot: {
        treatment: 'EXEMPT',
        legalBasis: 'ET_481_H',
        ratePercent: 0,
        requiresAccountantReview: false,
        resolvedAt: '2026-10-12T00:00:00.000Z',
      },
      additionalProductIds: [],
      additionalServiceIds: [],
      paymentMethod: null,
      installationFee: 120000,
      billingCycle: null,
      billingCycleDay: null,
      fiscalName: null,
      fiscalDocument: null,
      fiscalAddress: null,
      startDate: null,
      endDate: null,
      titularAnonymizedAt: null,
      createdAt: '2026-10-12T00:00:00.000Z',
      updatedAt: '2026-10-12T00:00:00.000Z',
      deletedAt: null,
    });

    expect(parsed.success).toBe(true);
  });

  it('MOD14 R2: valida el IVA congelado de la instalación y de los adicionales', () => {
    const frozen = {
      treatment: 'STANDARD',
      legalBasis: 'ET_468',
      ratePercent: 19,
      source: 'CATALOG',
      frozenAt: '2026-11-12T00:00:00.000Z',
    };
    const installation = ContractResponseSchema.shape.installationVatSnapshot;
    const additionals = ContractResponseSchema.shape.additionalVatSnapshot;

    expect(installation.safeParse(frozen).success).toBe(true);
    expect(installation.safeParse(null).success).toBe(true);
    expect(installation.safeParse(undefined).success).toBe(true);
    expect(installation.safeParse({ ...frozen, ratePercent: 0 }).success).toBe(false);
    expect(
      additionals.safeParse([{ ...frozen, itemId: 'svc-1', itemType: 'SERVICE' }]).success,
    ).toBe(true);
    expect(additionals.safeParse([{ ...frozen, itemType: 'SERVICE' }]).success).toBe(false);
  });

  it('valida la marca de anonimización del titular como fecha ISO o nula', () => {
    const schema = ContractResponseSchema.shape.titularAnonymizedAt;

    expect(schema.safeParse('2026-10-12T00:00:00.000Z').success).toBe(true);
    expect(schema.safeParse(null).success).toBe(true);
    expect(schema.safeParse('fecha-inválida').success).toBe(false);
  });
});
