import {
  expectedWithholdingCents,
  type BillingPaymentWithholdingResponse,
  type BillingWithholdingOption,
  type BillingWithholdingTaxCode,
  type PaymentWithholdingInput,
} from '@iwana/shared';
import { formatBillingMoneyExact, fromMoneyCents, moneyCents } from './billing-copy';

/** Línea de retención en edición dentro del registro de pago (spec MOD14 2026-11-13 R6). */
export type WithholdingDraft = {
  key: string;
  taxCode: BillingWithholdingTaxCode;
  base: string;
  rate: string;
  amount: string;
  certificateNumber: string;
  /** Vacío: la API la atribuye al primer documento que el pago salda. */
  documentId: string;
};

export type WithholdingField = 'base' | 'rate' | 'amount' | 'certificateNumber' | 'documentId';
export type WithholdingErrors = Partial<Record<WithholdingField, string>>;

const RATE_PATTERN = /^\d{1,3}(?:\.\d{1,4})?$/u;

/** Tarifa escrita con coma o punto; null si no es un porcentaje válido (0 < tarifa ≤ 100). */
export function normalizeWithholdingRate(value: string): string | null {
  const rate = value.trim().replace(',', '.');
  if (!RATE_PATTERN.test(rate)) return null;
  const number = Number(rate);
  return number > 0 && number <= 100 ? rate : null;
}

/** Tarifa sugerida por Tributación en formato editable: «4.0000» → «4». */
export function editableRate(rate: string | null): string {
  if (!rate) return '';
  const number = Number(rate);
  return Number.isFinite(number) ? String(number) : '';
}

/** Valor exacto (base × tarifa ajustado al peso, decisión D4) o '' si la base o la tarifa no son válidas. */
export function suggestedWithholdingAmount(base: string, rate: string): string {
  const baseCents = moneyCents(base.trim());
  const normalized = normalizeWithholdingRate(rate);
  if (!Number.isFinite(baseCents) || baseCents <= 0 || !normalized) return '';
  // Siempre múltiplo de 100 centavos: se muestra y se envía en pesos enteros («38400»).
  return String(expectedWithholdingCents(fromMoneyCents(baseCents), normalized) / 100);
}

export function newWithholdingDraft(
  key: string,
  option: BillingWithholdingOption,
  baseCents: number,
): WithholdingDraft {
  const base = baseCents > 0 ? fromMoneyCents(baseCents) : '';
  const rate = editableRate(option.suggestedRate);
  return {
    key,
    taxCode: option.taxCode,
    base,
    rate,
    amount: suggestedWithholdingAmount(base, rate),
    certificateNumber: '',
    documentId: '',
  };
}

/** Suma de los valores retenidos válidos, en centavos (los inválidos no suman). */
export function withholdingTotalCents(lines: readonly WithholdingDraft[]): number {
  return lines.reduce((sum, line) => {
    const cents = moneyCents(line.amount.trim());
    return Number.isFinite(cents) ? sum + cents : sum;
  }, 0);
}

/** Validación local de una línea; espeja `PaymentWithholdingInputSchema` (base × tarifa ajustado al peso). */
export function withholdingLineErrors(line: WithholdingDraft): WithholdingErrors {
  const errors: WithholdingErrors = {};
  const base = moneyCents(line.base.trim());
  const amount = moneyCents(line.amount.trim());
  const rate = normalizeWithholdingRate(line.rate);
  if (!Number.isFinite(base) || base <= 0)
    errors.base = 'Escribe la base de la retención en pesos.';
  if (!rate)
    errors.rate = 'Escribe una tarifa mayor que 0 y hasta 100, con máximo cuatro decimales.';
  if (!Number.isFinite(amount) || amount <= 0) {
    errors.amount = 'Escribe el valor retenido en pesos.';
  } else if (!errors.base && amount > base) {
    errors.amount = 'La retención no puede superar su base.';
  } else if (!errors.base && rate) {
    const expected = expectedWithholdingCents(fromMoneyCents(base), rate);
    if (amount !== expected) {
      errors.amount = `El valor debe ser base × tarifa ajustado al peso: ${formatBillingMoneyExact(
        fromMoneyCents(expected),
      )}.`;
    }
  }
  if (!line.certificateNumber.trim())
    errors.certificateNumber = 'Escribe el número del certificado de retención.';
  return errors;
}

/** Lo que el pago aplica a un documento, en el orden en que se envían las aplicaciones. */
export type WithholdingAllocation = { documentId: string; amountCents: number };

/**
 * Atribución local de las retenciones (paridad con `attributeWithholdings` de la API, spec MOD14
 * 2026-11-13 R6, R8): primero las que indican documento, contra lo que el pago le aplica; luego cada
 * una sin documento va entera al primer documento, en el orden de las aplicaciones, con espacio
 * suficiente. A diferencia de la API no se detiene en la primera falla: marca todas las líneas que
 * no caben y devuelve el documento resuelto de las que sí.
 */
export function attributeWithholdingDrafts(
  lines: readonly WithholdingDraft[],
  allocations: readonly WithholdingAllocation[],
): { resolved: Map<string, string>; invalid: Set<string> } {
  const room = new Map<string, number>();
  for (const { documentId, amountCents } of allocations) {
    if (amountCents > 0) room.set(documentId, (room.get(documentId) ?? 0) + amountCents);
  }
  const resolved = new Map<string, string>();
  const invalid = new Set<string>();
  const amountOf = (line: WithholdingDraft) => moneyCents(line.amount.trim());

  for (const line of lines) {
    const amount = amountOf(line);
    if (!line.documentId || !Number.isFinite(amount)) continue;
    const available = room.get(line.documentId);
    if (available === undefined || available < amount) {
      invalid.add(line.key);
      continue;
    }
    room.set(line.documentId, available - amount);
    resolved.set(line.key, line.documentId);
  }
  for (const line of lines) {
    const amount = amountOf(line);
    if (line.documentId || !Number.isFinite(amount)) continue;
    const target = [...room.entries()].find(([, available]) => available >= amount);
    if (!target) {
      invalid.add(line.key);
      continue;
    }
    room.set(target[0], target[1] - amount);
    resolved.set(line.key, target[0]);
  }
  return { resolved, invalid };
}

/** Claves de las líneas que no se pueden atribuir a un documento que el pago salda. */
export function unattributableWithholdings(
  lines: readonly WithholdingDraft[],
  allocations: readonly WithholdingAllocation[],
): Set<string> {
  return attributeWithholdingDrafts(lines, allocations).invalid;
}

/** Retención vigente ya registrada sobre un documento (pagos anteriores no anulados). */
export type ExistingWithholding = {
  documentId: string;
  taxCode: BillingWithholdingTaxCode;
  baseCents: number;
};

/** Retenciones vigentes del estado de cuenta: las de pagos anulados no cuentan. */
export function existingWithholdings(
  payments: ReadonlyArray<{
    withholdings?: readonly BillingPaymentWithholdingResponse[] | undefined;
  }>,
): ExistingWithholding[] {
  return payments.flatMap((payment) =>
    (payment.withholdings ?? [])
      .filter((line) => line.voidedAt == null)
      .map((line) => ({
        documentId: line.documentId,
        taxCode: line.taxCode,
        baseCents: moneyCents(line.base) || 0,
      })),
  );
}

/**
 * Reglas por documento y tipo (spec MOD14 2026-11-13): una sola retención vigente por documento y
 * tipo, y la base acumulada de un tipo no supera el subtotal antes de IVA del documento. Se evalúan
 * sobre el documento resuelto por `attributeWithholdingDrafts`, contando las vigentes de pagos
 * anteriores. Un documento sin subtotal conocido no se valida aquí; lo valida la API.
 */
export function withholdingDocumentErrors(
  lines: readonly WithholdingDraft[],
  resolved: ReadonlyMap<string, string>,
  subtotalCents: ReadonlyMap<string, number>,
  existing: readonly ExistingWithholding[],
): Map<string, WithholdingErrors> {
  const groupKey = (documentId: string, taxCode: BillingWithholdingTaxCode) =>
    `${documentId}|${taxCode}`;
  const groups = new Map<string, { count: number; baseCents: number; keys: string[] }>();
  const group = (key: string) => {
    let current = groups.get(key);
    if (!current) {
      current = { count: 0, baseCents: 0, keys: [] };
      groups.set(key, current);
    }
    return current;
  };
  for (const line of existing) {
    const current = group(groupKey(line.documentId, line.taxCode));
    current.count += 1;
    current.baseCents += line.baseCents;
  }
  for (const line of lines) {
    const documentId = resolved.get(line.key);
    if (!documentId) continue;
    const current = group(groupKey(documentId, line.taxCode));
    const base = moneyCents(line.base.trim());
    current.count += 1;
    current.baseCents += Number.isFinite(base) ? base : 0;
    current.keys.push(line.key);
  }

  const errors = new Map<string, WithholdingErrors>();
  for (const [key, current] of groups) {
    if (!current.keys.length) continue;
    const documentId = key.slice(0, key.indexOf('|'));
    const subtotal = subtotalCents.get(documentId);
    for (const lineKey of current.keys) {
      const lineErrors: WithholdingErrors = {};
      if (current.count > 1)
        lineErrors.documentId =
          'Esa factura ya tiene una retención de este tipo. Registra una sola por factura y tipo, o elige otra factura.';
      if (subtotal !== undefined && current.baseCents > subtotal)
        lineErrors.base = `La base de este tipo de retención supera el subtotal antes de IVA de la factura (${formatBillingMoneyExact(
          fromMoneyCents(subtotal),
        )}).`;
      if (Object.keys(lineErrors).length) errors.set(lineKey, lineErrors);
    }
  }
  return errors;
}

/** Tarifa por encima de la sugerida por Tributación (comparada a cuatro decimales). */
export function rateAboveSuggested(rate: string, suggestedRate: string | null): boolean {
  const normalized = normalizeWithholdingRate(rate);
  if (!normalized || !suggestedRate) return false;
  const suggested = Number(suggestedRate);
  if (!Number.isFinite(suggested)) return false;
  return Math.round(Number(normalized) * 10_000) > Math.round(suggested * 10_000);
}

export function toWithholdingInput(line: WithholdingDraft): PaymentWithholdingInput {
  return {
    taxCode: line.taxCode,
    base: fromMoneyCents(moneyCents(line.base.trim())),
    rate: normalizeWithholdingRate(line.rate) ?? line.rate,
    amount: fromMoneyCents(moneyCents(line.amount.trim())),
    certificateNumber: line.certificateNumber.trim(),
    ...(line.documentId ? { documentId: line.documentId } : {}),
  };
}
