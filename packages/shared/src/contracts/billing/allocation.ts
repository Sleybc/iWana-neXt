export type BillingMoney = string | number;

export interface FifoAllocationCandidate {
  documentId: string;
  dueDate: string;
  pendingAmount: BillingMoney;
}

export interface FifoAllocation {
  documentId: string;
  amount: string;
}

function toCents(value: BillingMoney): number {
  const decimal = typeof value === 'number' ? value.toFixed(2) : value;
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/u.exec(decimal);
  if (!match) throw new RangeError('El monto debe tener hasta dos decimales.');
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? '').padEnd(2, '0'));
  return whole * 100 + fraction;
}

function fromCents(cents: number): string {
  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, '0');
  return `${whole}.${fraction}`;
}

/** Sugiere una asignación FIFO determinista sin exceder el pago ni el saldo del documento. */
export function suggestFifoAllocations(
  paymentAmount: BillingMoney,
  candidates: readonly FifoAllocationCandidate[],
): FifoAllocation[] {
  let remaining = toCents(paymentAmount);
  if (remaining <= 0) return [];

  const ordered = [...candidates].sort(
    (left, right) =>
      left.dueDate.localeCompare(right.dueDate) || left.documentId.localeCompare(right.documentId),
  );
  const allocations: FifoAllocation[] = [];

  for (const candidate of ordered) {
    if (remaining === 0) break;
    const pending = toCents(candidate.pendingAmount);
    if (pending <= 0) continue;
    const allocated = Math.min(remaining, pending);
    allocations.push({ documentId: candidate.documentId, amount: fromCents(allocated) });
    remaining -= allocated;
  }

  return allocations;
}
