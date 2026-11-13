import { PaymentWithholdingInputSchema } from '@iwana/shared';
import {
  attributeWithholdingDrafts,
  editableRate,
  existingWithholdings,
  newWithholdingDraft,
  rateAboveSuggested,
  normalizeWithholdingRate,
  suggestedWithholdingAmount,
  toWithholdingInput,
  unattributableWithholdings,
  withholdingDocumentErrors,
  withholdingLineErrors,
  withholdingTotalCents,
  type WithholdingDraft,
} from './billing-withholdings';

const DOC_A = '11111111-1111-4111-8111-111111111111';
const DOC_B = '22222222-2222-4222-8222-222222222222';

function line(overrides: Partial<WithholdingDraft> = {}): WithholdingDraft {
  return {
    key: 'l1',
    taxCode: 'RETE_FUENTE_SERVICIOS',
    base: '1000000.00',
    rate: '4',
    amount: '40000.00',
    certificateNumber: 'CERT-2026-001',
    documentId: '',
    ...overrides,
  };
}

describe('billing-withholdings', () => {
  it('normaliza la tarifa con coma y rechaza fuera de rango', () => {
    expect(normalizeWithholdingRate('0,966')).toBe('0.966');
    expect(normalizeWithholdingRate(' 4 ')).toBe('4');
    expect(normalizeWithholdingRate('0')).toBeNull();
    expect(normalizeWithholdingRate('100.5')).toBeNull();
    expect(normalizeWithholdingRate('1.23456')).toBeNull();
    expect(normalizeWithholdingRate('abc')).toBeNull();
  });

  it('muestra la tarifa sugerida sin ceros sobrantes', () => {
    expect(editableRate('4.0000')).toBe('4');
    expect(editableRate('0.9660')).toBe('0.966');
    expect(editableRate(null)).toBe('');
  });

  it('calcula base × tarifa al centavo (CA-4: 1.000.000 al 4 % y reteICA 0,966 %)', () => {
    expect(suggestedWithholdingAmount('1000000', '4')).toBe('40000.00');
    expect(suggestedWithholdingAmount('1000000', '0.966')).toBe('9660.00');
    expect(suggestedWithholdingAmount('333.33', '4')).toBe('13.33');
    expect(suggestedWithholdingAmount('', '4')).toBe('');
    expect(suggestedWithholdingAmount('1000', '')).toBe('');
  });

  it('crea la línea con la tarifa sugerida y el valor calculado', () => {
    const draft = newWithholdingDraft(
      'k',
      { taxCode: 'RETE_ICA', name: 'ReteICA', suggestedRate: '0.9660', source: 'TRIBUTACION' },
      100_000_000,
    );
    expect(draft).toEqual({
      key: 'k',
      taxCode: 'RETE_ICA',
      base: '1000000.00',
      rate: '0.966',
      amount: '9660.00',
      certificateNumber: '',
      documentId: '',
    });
  });

  it('suma solo valores válidos', () => {
    expect(withholdingTotalCents([line(), line({ key: 'l2', amount: '9660' })])).toBe(4_966_000);
    expect(withholdingTotalCents([line({ amount: 'x' })])).toBe(0);
  });

  it('acepta una diferencia de hasta 1 peso y rechaza más (tolerancia del contrato)', () => {
    expect(withholdingLineErrors(line({ amount: '40001.00' }))).toEqual({});
    expect(withholdingLineErrors(line({ amount: '39999.00' }))).toEqual({});
    expect(withholdingLineErrors(line({ amount: '40001.01' })).amount).toMatch(
      /^El valor debe estar a máximo/u,
    );
    // Misma regla que el contrato compartido.
    expect(
      PaymentWithholdingInputSchema.safeParse(toWithholdingInput(line({ amount: '40001.00' })))
        .success,
    ).toBe(true);
    expect(
      PaymentWithholdingInputSchema.safeParse(toWithholdingInput(line({ amount: '40001.01' })))
        .success,
    ).toBe(false);
  });

  it('exige certificado, base, tarifa y valor no mayor que la base', () => {
    const errors = withholdingLineErrors(
      line({ base: '', rate: '0', amount: '', certificateNumber: '  ' }),
    );
    expect(Object.keys(errors).sort()).toEqual(['amount', 'base', 'certificateNumber', 'rate']);
    expect(withholdingLineErrors(line({ base: '100', rate: '100', amount: '101' })).amount).toBe(
      'La retención no puede superar su base.',
    );
  });

  it('marca las retenciones que no caben en lo que el pago aplica a su documento', () => {
    const applied = [
      { documentId: DOC_A, amountCents: 3_000_000 },
      { documentId: DOC_B, amountCents: 0 },
    ];
    expect(
      unattributableWithholdings([line({ documentId: DOC_A, amount: '30000' })], applied).size,
    ).toBe(0);
    expect([
      ...unattributableWithholdings([line({ documentId: DOC_B, amount: '1' })], applied),
    ]).toEqual(['l1']);
    expect([...unattributableWithholdings([line({ amount: '30000.01' })], applied)]).toEqual([
      'l1',
    ]);
  });

  it('paridad con la API: una retención sin documento cabe entera en un solo documento', () => {
    // 600 + 600 aplicados: el total (1.000) cabe, pero la retención no cabe en ninguno.
    const applied = [
      { documentId: DOC_A, amountCents: 60_000 },
      { documentId: DOC_B, amountCents: 60_000 },
    ];
    expect([...unattributableWithholdings([line({ amount: '1000' })], applied)]).toEqual(['l1']);
    // Dos de 500: la primera llena A, la segunda va a B, en el orden de las aplicaciones.
    const two = attributeWithholdingDrafts(
      [line({ amount: '500' }), line({ key: 'l2', amount: '500' })],
      applied,
    );
    expect(two.invalid.size).toBe(0);
    expect(Object.fromEntries(two.resolved)).toEqual({ l1: DOC_A, l2: DOC_B });
  });

  it('paridad con la API: primero las de documento explícito, luego las demás por orden', () => {
    const applied = [
      { documentId: DOC_A, amountCents: 50_000 },
      { documentId: DOC_B, amountCents: 50_000 },
    ];
    // La línea sin documento (primera en la lista) no cabe en A: la explícita lo ocupó antes.
    const result = attributeWithholdingDrafts(
      [line({ amount: '400' }), line({ key: 'l2', amount: '400', documentId: DOC_A })],
      applied,
    );
    expect(Object.fromEntries(result.resolved)).toEqual({ l1: DOC_B, l2: DOC_A });
    // Un documento que no recibe aplicación no admite retenciones.
    expect([
      ...unattributableWithholdings(
        [line({ documentId: DOC_B, amount: '1' })],
        [{ documentId: DOC_A, amountCents: 100 }],
      ),
    ]).toEqual(['l1']);
  });

  it('una sola retención vigente por documento y tipo, contando pagos anteriores', () => {
    const subtotal = new Map([[DOC_A, 100_000_000]]);
    const resolved = new Map([
      ['l1', DOC_A],
      ['l2', DOC_A],
    ]);
    const same = withholdingDocumentErrors(
      [line(), line({ key: 'l2', amount: '40000', base: '1000000' })],
      resolved,
      subtotal,
      [],
    );
    expect(same.get('l1')?.documentId).toMatch(
      /^Ese documento ya tiene una retención de este tipo/u,
    );
    expect(same.get('l2')?.documentId).toMatch(/^Ese documento ya tiene/u);
    // Tipos distintos en el mismo documento: válido.
    expect(
      withholdingDocumentErrors(
        [
          line({ base: '500000', amount: '20000' }),
          line({ key: 'l2', taxCode: 'RETE_ICA', base: '500000', amount: '4830' }),
        ],
        resolved,
        subtotal,
        [],
      ).size,
    ).toBe(0);
    const withholding = {
      paymentId: '33333333-3333-4333-8333-333333333333',
      documentId: DOC_A,
      certificateNumber: null,
      createdBy: '44444444-4444-4444-8444-444444444444',
      createdAt: '2026-11-01T00:00:00.000Z',
    };
    const previous = existingWithholdings([
      {
        withholdings: [
          {
            ...withholding,
            id: '55555555-5555-4555-8555-555555555551',
            taxCode: 'RETE_FUENTE_SERVICIOS',
            base: '100000.00',
            rate: '4.0000',
            amount: '4000.00',
            voidedAt: null,
          },
          {
            ...withholding,
            id: '55555555-5555-4555-8555-555555555552',
            taxCode: 'RETE_ICA',
            base: '100000.00',
            rate: '0.9660',
            amount: '966.00',
            voidedAt: '2026-11-02T00:00:00.000Z',
          },
        ],
      },
    ]);
    // La retención de un pago anulado no cuenta.
    expect(previous).toEqual([
      { documentId: DOC_A, taxCode: 'RETE_FUENTE_SERVICIOS', baseCents: 10_000_000 },
    ]);
    const withPrevious = withholdingDocumentErrors(
      [
        line({ base: '100000', amount: '4000' }),
        line({ key: 'l2', taxCode: 'RETE_ICA', base: '100000', amount: '966' }),
      ],
      resolved,
      subtotal,
      previous,
    );
    expect(withPrevious.get('l1')?.documentId).toMatch(/^Ese documento ya tiene/u);
    expect(withPrevious.has('l2')).toBe(false);
  });

  it('la base acumulada por tipo no supera el subtotal antes de IVA del documento', () => {
    const subtotal = new Map([[DOC_A, 84_033_600]]);
    const resolved = new Map([['l1', DOC_A]]);
    expect(
      withholdingDocumentErrors(
        [line({ base: '840336', amount: '33613.44' })],
        resolved,
        subtotal,
        [],
      ).size,
    ).toBe(0);
    const errors = withholdingDocumentErrors(
      [line({ base: '1000000', amount: '40000' })],
      resolved,
      subtotal,
      [],
    );
    expect(errors.get('l1')?.base).toMatch(
      /^La base de este tipo de retención supera el subtotal antes de IVA del documento/u,
    );
    // Acumulada con una vigente de un pago anterior del mismo tipo.
    expect(
      withholdingDocumentErrors([line({ base: '800000', amount: '32000' })], resolved, subtotal, [
        { documentId: DOC_A, taxCode: 'RETE_FUENTE_SERVICIOS', baseCents: 10_000_000 },
      ]).get('l1')?.base,
    ).toMatch(/supera el subtotal/u);
    // Sin subtotal conocido no se valida la base (la valida la API).
    expect(
      withholdingDocumentErrors([line({ base: '1000000' })], resolved, new Map(), []).size,
    ).toBe(0);
  });

  it('detecta una tarifa por encima de la sugerida, a cuatro decimales', () => {
    expect(rateAboveSuggested('4', '4.0000')).toBe(false);
    expect(rateAboveSuggested('3,5', '4.0000')).toBe(false);
    expect(rateAboveSuggested('4.0001', '4.0000')).toBe(true);
    expect(rateAboveSuggested('11', '4.0000')).toBe(true);
    expect(rateAboveSuggested('11', null)).toBe(false);
    expect(rateAboveSuggested('x', '4.0000')).toBe(false);
  });

  it('serializa la línea al contrato, con documento solo si se eligió', () => {
    expect(toWithholdingInput(line({ rate: '0,966', amount: '9660', base: '1000000' }))).toEqual({
      taxCode: 'RETE_FUENTE_SERVICIOS',
      base: '1000000.00',
      rate: '0.966',
      amount: '9660.00',
      certificateNumber: 'CERT-2026-001',
    });
    expect(toWithholdingInput(line({ documentId: DOC_A })).documentId).toBe(DOC_A);
  });
});
