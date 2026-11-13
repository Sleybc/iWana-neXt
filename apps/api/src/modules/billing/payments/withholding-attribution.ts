/**
 * Atribución de las retenciones de un pago a los documentos que ese pago salda
 * (spec MOD14 2026-11-13 R6, R8).
 *
 * Una retención es parte de lo que el pago aplica a un documento: la suma de las retenciones de un
 * documento no puede superar lo que el mismo pago le aplica. Con `documentId` explícito se valida
 * contra ese documento; sin él, se atribuye al primer documento, en el orden de las aplicaciones
 * (FIFO por vencimiento o el orden manual enviado), con espacio suficiente.
 */
export type WithholdingToAttribute = {
  amountCents: number;
  documentId?: string | undefined;
};

export class WithholdingNotAttributableError extends Error {
  constructor() {
    super('La retención no cabe en lo que el pago aplica a sus documentos.');
    this.name = 'WithholdingNotAttributableError';
  }
}

export function attributeWithholdings<T extends WithholdingToAttribute>(
  allocations: ReadonlyArray<{ documentId: string; amountCents: number }>,
  withholdings: readonly T[],
): Array<T & { documentId: string }> {
  const room = new Map<string, number>();
  for (const { documentId, amountCents } of allocations) {
    room.set(documentId, (room.get(documentId) ?? 0) + amountCents);
  }
  const resolved = new Array<T & { documentId: string }>(withholdings.length);

  withholdings.forEach((line, index) => {
    if (!line.documentId) return;
    const available = room.get(line.documentId);
    if (available === undefined || available < line.amountCents) {
      throw new WithholdingNotAttributableError();
    }
    room.set(line.documentId, available - line.amountCents);
    resolved[index] = { ...line, documentId: line.documentId };
  });

  withholdings.forEach((line, index) => {
    if (line.documentId) return;
    const target = [...room.entries()].find(([, available]) => available >= line.amountCents);
    if (!target) throw new WithholdingNotAttributableError();
    room.set(target[0], target[1] - line.amountCents);
    resolved[index] = { ...line, documentId: target[0] };
  });

  return resolved;
}
