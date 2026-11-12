/**
 * Suma SQL de los ajustes de cortesía activos de un documento (spec MOD14 2026-11-12 R4).
 *
 * Solo cuentan los `AJUSTE_SOBRE_EMITIDO`: la cortesía de un borrador ya está restada en el total
 * del documento por su línea negativa. El saldo pendiente de un documento es
 * `total − aplicaciones vigentes − activeCourtesySum`; la cortesía no es pago ni nota crédito.
 *
 * `alias` es siempre un alias SQL fijo del código (nunca entrada del usuario).
 */
export function activeCourtesySum(alias = 'd'): string {
  assertAlias(alias);
  return `COALESCE((SELECT SUM(bc.amount) FROM billing_courtesies bc
                     WHERE bc.document_id = ${alias}.id AND bc.tenant_id = ${alias}.tenant_id
                       AND bc.status = 'ACTIVA'
                       AND bc.application = 'AJUSTE_SOBRE_EMITIDO'), 0)`;
}

/**
 * Valor positivo de las líneas `CORTESIA` de un documento: la cortesía otorgada en el borrador,
 * que ya bajó su total. Junto con los ajustes forma «Cortesías otorgadas» (`totalCourtesy`).
 */
export function courtesyLineSum(alias = 'd'): string {
  assertAlias(alias);
  return `COALESCE((SELECT -SUM(bl.total) FROM billing_document_lines bl
                     WHERE bl.document_id = ${alias}.id AND bl.tenant_id = ${alias}.tenant_id
                       AND bl.kind = 'CORTESIA'), 0)`;
}

/**
 * `courtesyAmount` de un documento, una sola fórmula para el detalle y el estado de cuenta:
 * solo en cartera (EMITIDO o IMPORTADO), los ajustes activos sin superar lo que el pago dejó
 * pendiente. Todo en centavos.
 */
export function appliedCourtesyCents(input: {
  status: string;
  totalCents: number;
  paidCents: number;
  adjustmentCents: number;
}): number {
  if (input.status !== 'EMITIDO' && input.status !== 'IMPORTADO') return 0;
  const open = Math.max(0, input.totalCents - input.paidCents);
  return Math.max(0, Math.min(open, input.adjustmentCents));
}

function assertAlias(alias: string): void {
  if (!/^[a-z][a-z0-9_]*$/u.test(alias)) throw new Error('Alias SQL no válido.');
}
