// MOD05 Cierre de venta fase 2 · W0 · Inventario de no regresión del primer cobro (AI-SR-QA).
//
// Fija el primer cobro ACTUAL de MOD14 por activación (`ContractActivatedProcessor` →
// `BillingGenerationService.generate({ firstChargeFrom })`):
//   - Se mantiene tras el bloque D: un documento BORRADOR con la línea del plan, totales
//     iguales a la suma de líneas e idempotencia por contrato.
//   - Cambió a propósito en el bloque D (CA-4): con `installation_fee` congelado el primer
//     cobro trae la línea «Instalación»; sin cargo (nulo o cero) sigue sin traerla.
//   - Cambió a propósito en MOD14 bloque A (spec 2026-11-12 D2/R2, D-F1 sustituida): la
//     instalación lleva su IVA congelado en el contrato, por defecto 19 %, no el del internet.
import { BillingGenerationService } from './billing-generation.service';
import type { BillableContract } from '../ports/billing-contract-read.port';

const TENANT = { tenantId: 'ten-w0f2', schemaName: 'tenant_w0f2' };

type Insert = { sql: string; params: unknown[] };
let inserts: Insert[];
let priorPeriods: Array<{ id: string }>;

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    TenantContext: { getOrThrow: () => TENANT },
    runInTenantSchema: async (
      _ds: unknown,
      _schema: string,
      callback: (qr: unknown) => Promise<unknown>,
    ) =>
      callback({
        manager: {
          query: async (sql: string, params: unknown[] = []) => {
            if (sql.startsWith('SELECT * FROM billing_policy')) return [POLICY];
            if (sql.includes('FROM billing_contract_policy')) return [];
            if (sql.includes('pg_advisory_xact_lock')) return [];
            if (sql.includes('FROM billing_periods WHERE tenant_id=$1 AND contract_id=$2'))
              return priorPeriods;
            if (sql.includes('FROM billing_periods')) return [];
            if (sql.includes('INSERT INTO billing_periods')) {
              inserts.push({ sql, params });
              return [{ id: 'per-w0f2' }];
            }
            if (sql.includes('INSERT INTO billing_documents')) {
              inserts.push({ sql, params });
              return [{ id: 'doc-w0f2' }];
            }
            if (sql.includes('INSERT INTO billing_document_lines')) {
              inserts.push({ sql, params });
              return [];
            }
            return [];
          },
        },
      }),
  };
});

const POLICY = {
  period_timing: 'ANTICIPADO',
  generation_lead_days: 5,
  cutoff_mode: 'VENCIMIENTO_MAS_GRACIA',
  payment_term_days: 10,
  grace_days: 3,
  cutoff_enabled: true,
  proration_method: 'DIAS_REALES',
  first_period_mode: 'SEPARADO',
  automatic_generation: false,
  approval_mode: 'BORRADOR',
  generation_hour: 6,
  document_prefix: 'W0',
};

function contract(overrides: Partial<BillableContract> = {}): BillableContract {
  return {
    contractId: 'ctr-w0f2',
    subscriberId: 'sub-w0f2',
    partyId: 'party-w0f2',
    status: 'ACTIVE',
    statusReasonCode: null,
    terminatedAt: null,
    cycleDay: 10,
    cutoffDay: null,
    activatedAt: '2026-11-10',
    endDate: null,
    planName: 'Plan sintético 100',
    monthlyPrice: '100000.00',
    vatSnapshot: {
      treatment: 'EXENTO',
      legalBasis: 'ET_481_H',
      ratePercent: 0,
      requiresAccountantReview: false,
      resolvedAt: '2026-11-10T00:00:00.000Z',
    },
    unbilledAdditionalCount: 0,
    buyer: {
      displayName: 'Titular sintético',
      documentType: 'CC',
      documentNumber: null,
      hasDocumentNumber: true,
      address: 'Dirección sintética 1',
      rutResponsibilities: [],
    },
    ...overrides,
  } as BillableContract;
}

function build(candidate: BillableContract) {
  const contracts = {
    findByContractId: jest.fn().mockResolvedValue(candidate),
    findBillableForDate: jest.fn().mockResolvedValue([]),
  };
  const documents = {
    prepareIssue: jest.fn().mockResolvedValue({ contract: candidate }),
    publishEvents: jest.fn().mockResolvedValue(undefined),
    issueWithinManager: jest.fn().mockResolvedValue(undefined),
  };
  const service = new BillingGenerationService(
    {} as never,
    contracts as never,
    { getSnapshot: jest.fn().mockResolvedValue({ timezone: 'America/Bogota' }) } as never,
    documents as never,
    { logWithin: jest.fn().mockResolvedValue(undefined) } as never,
    { activeMarks: jest.fn().mockResolvedValue({}) } as never,
  );
  return { service, documents };
}

const firstCharge = (service: BillingGenerationService) =>
  service.generate({
    date: '2026-11-11',
    contractId: 'ctr-w0f2',
    firstChargeFrom: '2026-11-10',
    actorId: null,
  });

const lineInserts = () => inserts.filter(({ sql }) => sql.includes('billing_document_lines'));
const documentInsert = () =>
  inserts.find(({ sql }) => sql.includes('INSERT INTO billing_documents'));
// Orden de columnas de billing_document_lines en el INSERT actual.
const LINE = {
  kind: 2,
  description: 3,
  baseAmount: 6,
  taxAmount: 7,
  total: 8,
  vatTreatment: 9,
  vatLegalBasis: 11,
} as const;
const DOC = { subtotal: 5, tax: 6, total: 7 } as const;

describe('W0 F2 primer cobro por activación — línea base de MOD14', () => {
  beforeEach(() => {
    inserts = [];
    priorPeriods = [];
  });

  it('genera un único documento BORRADOR con la línea del plan', async () => {
    const { service } = build(contract());

    const summary = await firstCharge(service);

    expect(summary.generated).toBe(1);
    expect(summary.failed).toBe(0);
    expect(documentInsert()!.sql).toContain("'BORRADOR'");
    const planLines = lineInserts().filter(({ params }) =>
      ['PLAN', 'PRORRATEO'].includes(params[LINE.kind] as string),
    );
    expect(planLines).toHaveLength(1);
    expect(planLines[0]!.params[LINE.description]).toBe('Plan sintético 100');
    expect(planLines[0]!.params[LINE.baseAmount]).toBe('100000.00');
  });

  it('los totales del documento son la suma de sus líneas', async () => {
    const { service } = build(contract());

    await firstCharge(service);

    const sum = (index: number) =>
      lineInserts().reduce((acc, { params }) => acc + Number(params[index]), 0);
    const doc = documentInsert()!.params;
    expect(Number(doc[DOC.subtotal])).toBeCloseTo(sum(LINE.baseAmount), 2);
    expect(Number(doc[DOC.tax])).toBeCloseTo(sum(LINE.taxAmount), 2);
    expect(Number(doc[DOC.total])).toBeCloseTo(sum(LINE.total), 2);
  });

  it('es idempotente por contrato: con un periodo previo devuelve existing y no inserta', async () => {
    priorPeriods = [{ id: 'per-prev' }];
    const { service } = build(contract());

    const summary = await firstCharge(service);

    expect(summary.existing).toBe(1);
    expect(summary.generated).toBe(0);
    expect(inserts).toHaveLength(0);
  });

  it('sin ciclo no genera documento (withoutCycle)', async () => {
    const { service } = build(contract({ cycleDay: null }));

    const summary = await firstCharge(service);

    expect(summary.withoutCycle).toBe(1);
    expect(inserts).toHaveLength(0);
  });

  it('[cambió en D] sin cargo de instalación el primer cobro no trae línea de instalación', async () => {
    const cases: Array<Partial<BillableContract>> = [
      {},
      { installationFee: null },
      { installationFee: '0.00' },
    ];
    for (const overrides of cases) {
      inserts = [];
      const { service } = build(contract(overrides));

      await firstCharge(service);

      const kinds = lineInserts().map(({ params }) => params[LINE.kind]);
      const descriptions = lineInserts().map(({ params }) => String(params[LINE.description]));
      expect(kinds).toEqual(['PLAN']);
      expect(descriptions.some((text) => /instalaci[oó]n/iu.test(text))).toBe(false);
    }
  });

  it('[cambió en D y en MOD14 A] con cargo congelado trae «Instalación» con 19 % aunque el internet sea exento', async () => {
    // Sin IVA congelado de la instalación (contrato heredado) aplica STANDARD 19 % (D2).
    const { service } = build(contract({ installationFee: '80000.00' }));

    await firstCharge(service);

    const lines = lineInserts();
    expect(lines.map(({ params }) => params[LINE.kind])).toEqual(['PLAN', 'INSTALACION']);
    expect(lines[0]!.params[LINE.taxAmount]).toBe('0.00');
    expect(lines[1]!.params[LINE.description]).toBe('Instalación');
    expect(lines[1]!.params[LINE.baseAmount]).toBe('80000.00');
    expect(lines[1]!.params[LINE.taxAmount]).toBe('15200.00');
    expect(documentInsert()!.params[DOC.total]).toBe('195200.00');
  });

  it('[MOD14 A] la instalación usa el tratamiento congelado en el contrato', async () => {
    const { service } = build(
      contract({
        installationFee: '50000.00',
        installationVat: { treatment: 'EXCLUDED', legalBasis: 'ET_476_7', ratePercent: 0 },
      }),
    );

    await firstCharge(service);

    const [, install] = lineInserts();
    expect(install!.params[LINE.taxAmount]).toBe('0.00');
    expect(install!.params[LINE.vatTreatment]).toBe('EXCLUDED');
    expect(install!.params[LINE.vatLegalBasis]).toBe('ET_476_7');
    expect(documentInsert()!.params[DOC.total]).toBe('150000.00');
  });
});
