import { DispatchStockIssueSchema } from './index';

function buildDispatchPayload(handoffAttachments: unknown) {
  return { handoffMethod: 'ACTA', handoffAttachments };
}

describe('DispatchStockIssueSchema adjuntos cerrados (MOD12 S2.1 · B3)', () => {
  it('acepta lista vacía y la deja por defecto', () => {
    const parsed = DispatchStockIssueSchema.parse({ handoffMethod: 'ACTA' });

    expect(parsed.handoffAttachments).toEqual([]);
  });

  it('acepta adjuntos con forma cerrada', () => {
    const parsed = DispatchStockIssueSchema.parse(
      buildDispatchPayload([
        { name: 'acta.pdf', url: 'bodega/acta.pdf', mimeType: 'application/pdf', sizeBytes: 1234 },
      ]),
    );

    expect(parsed.handoffAttachments).toHaveLength(1);
  });

  it('rechaza adjuntos con forma abierta (antes z.unknown)', () => {
    const result = DispatchStockIssueSchema.safeParse(buildDispatchPayload(['solo-id']));

    expect(result.success).toBe(false);
  });

  it('rechaza claves extra en el adjunto (schema estricto)', () => {
    const result = DispatchStockIssueSchema.safeParse(
      buildDispatchPayload([{ name: 'acta.pdf', binario: 'aGVsbG8=' }]),
    );

    expect(result.success).toBe(false);
  });

  it('rechaza nombre vacío', () => {
    const result = DispatchStockIssueSchema.safeParse(buildDispatchPayload([{ name: '   ' }]));

    expect(result.success).toBe(false);
  });
});
