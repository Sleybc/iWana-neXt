import { attributeWithholdings, WithholdingNotAttributableError } from './withholding-attribution';

const A = 'doc-a';
const B = 'doc-b';

describe('attributeWithholdings (spec MOD14 2026-11-13 R6, R8)', () => {
  it('sin documento, atribuye al primero en el orden de las aplicaciones con espacio', () => {
    const result = attributeWithholdings(
      [
        { documentId: A, amountCents: 1_000 },
        { documentId: B, amountCents: 50_000 },
      ],
      [{ amountCents: 4_000 }, { amountCents: 500 }],
    );
    expect(result.map((line) => line.documentId)).toEqual([B, A]);
  });

  it('respeta el documento explícito y lo descuenta antes de los implícitos', () => {
    const result = attributeWithholdings(
      [
        { documentId: A, amountCents: 5_000 },
        { documentId: B, amountCents: 5_000 },
      ],
      [{ amountCents: 4_000 }, { amountCents: 3_000, documentId: A }],
    );
    expect(result).toEqual([
      { amountCents: 4_000, documentId: B },
      { amountCents: 3_000, documentId: A },
    ]);
  });

  it('suma varias aplicaciones al mismo documento', () => {
    const result = attributeWithholdings(
      [
        { documentId: A, amountCents: 2_000 },
        { documentId: A, amountCents: 2_000 },
      ],
      [{ amountCents: 4_000, documentId: A }],
    );
    expect(result[0]?.documentId).toBe(A);
  });

  it('falla si el documento explícito no está en el pago o no tiene espacio', () => {
    expect(() =>
      attributeWithholdings(
        [{ documentId: A, amountCents: 1_000 }],
        [{ amountCents: 500, documentId: B }],
      ),
    ).toThrow(WithholdingNotAttributableError);
    expect(() =>
      attributeWithholdings(
        [{ documentId: A, amountCents: 1_000 }],
        [{ amountCents: 1_001, documentId: A }],
      ),
    ).toThrow(WithholdingNotAttributableError);
  });

  it('falla si ninguna aplicación tiene espacio o el pago no aplica nada', () => {
    expect(() =>
      attributeWithholdings(
        [
          { documentId: A, amountCents: 600 },
          { documentId: B, amountCents: 600 },
        ],
        [{ amountCents: 1_000 }],
      ),
    ).toThrow(WithholdingNotAttributableError);
    expect(() => attributeWithholdings([], [{ amountCents: 1 }])).toThrow(
      WithholdingNotAttributableError,
    );
  });

  it('sin retenciones devuelve lista vacía', () => {
    expect(attributeWithholdings([{ documentId: A, amountCents: 1 }], [])).toEqual([]);
  });
});
