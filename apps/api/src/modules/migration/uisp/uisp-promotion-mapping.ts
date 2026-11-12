import type {
  ImportedBillingLine,
  ImportedContractInput,
  ImportedSuspensionPeriod,
  ImportedTicketComment,
  ImportedTicketInput,
} from '../ports/migration-import.ports';

/**
 * Traducción pura de los registros de UISP (carga útil descifrada de las intermedias) a los
 * insumos de los puertos de promoción (ADR-110 D3, D5; spec §3.2). Sin I/O ni PII en logs.
 */
type Raw = Record<string, unknown> | null | undefined;

const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})/u;

/** Fecha civil `YYYY-MM-DD` de un valor de UISP (`2023-01-01T00:00:00-0500`) o `null`. */
export function civilDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = CIVIL_DATE.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (
    date.getUTCFullYear() !== Number(y) ||
    date.getUTCMonth() !== Number(m) - 1 ||
    date.getUTCDate() !== Number(d)
  ) {
    return null;
  }
  return `${y}-${m}-${d}`;
}

/** Instante ISO de un valor de UISP o `null`. */
export function instant(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/** Monto finito redondeado a centavos, o `null`. */
export function amount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100) / 100;
}

export function cents(value: number): number {
  return Math.round(value * 100);
}

export function centsToMoney(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** `status` del servicio de UISP → estado del contrato (spec §3.2: 1 → ACTIVE). */
export function contractStatus(value: unknown): ImportedContractInput['status'] {
  switch (Number(value)) {
    case 1:
      return 'ACTIVE';
    case 3:
      return 'SUSPENDED';
    case 2:
    case 5:
    case 8:
      return 'TERMINATED';
    default:
      return 'DRAFT';
  }
}

export function suspensionPeriods(raw: Raw): ImportedSuspensionPeriod[] {
  const periods = Array.isArray(raw?.['suspensionPeriods']) ? raw['suspensionPeriods'] : [];
  const result: ImportedSuspensionPeriod[] = [];
  for (const period of periods as Raw[]) {
    const startDate = civilDate(period?.['startDate']);
    if (!startDate) continue;
    const endDate = civilDate(period?.['endDate']);
    result.push({ startDate, endDate: endDate && endDate >= startDate ? endDate : null });
  }
  return result;
}

export function contractDates(raw: Raw): { startDate: string | null; endDate: string | null } {
  return {
    startDate: civilDate(raw?.['activeFrom']) ?? civilDate(raw?.['invoicingStart']),
    endDate: civilDate(raw?.['activeTo']),
  };
}

export function individualPrice(raw: Raw): number | null {
  const value = amount(raw?.['individualPrice']);
  return value !== null && value >= 0 ? value : null;
}

export function serviceAddress(raw: Raw): string | null {
  return text(raw?.['fullAddress']) ?? text(raw?.['street1']);
}

export function serviceAlias(raw: Raw): string | null {
  return text(raw?.['name']);
}

/** Renglones de la factura; sin renglones válidos, uno solo por el total. */
export function invoiceLines(raw: Raw, total: number): ImportedBillingLine[] {
  const items = Array.isArray(raw?.['items']) ? (raw['items'] as Raw[]) : [];
  const lines: ImportedBillingLine[] = [];
  for (const item of items) {
    const lineTotal = amount(item?.['total']);
    if (lineTotal === null || lineTotal < 0) continue;
    const quantity = amount(item?.['quantity']);
    const unit = amount(item?.['price']);
    lines.push({
      description: text(item?.['label']) ?? 'Concepto importado',
      quantity: quantity !== null && quantity > 0 ? quantity : 1,
      unitPrice: unit !== null && unit >= 0 ? unit : lineTotal,
      total: lineTotal,
    });
  }
  if (lines.length === 0) {
    lines.push({ description: 'Factura importada', quantity: 1, unitPrice: total, total });
  }
  return lines;
}

/** Servicio de UISP al que apunta la factura (primer renglón con `serviceId`). */
export function invoiceServiceId(raw: Raw): string | null {
  const items = Array.isArray(raw?.['items']) ? (raw['items'] as Raw[]) : [];
  for (const item of items) {
    const id = item?.['serviceId'];
    if (id !== null && id !== undefined && /^[A-Za-z0-9._-]{1,64}$/u.test(String(id))) {
      return String(id);
    }
  }
  return null;
}

/** Coberturas de un pago: `invoiceId` → monto. Ignora notas crédito y montos inválidos. */
export function paymentCovers(raw: Raw): Array<{ invoiceId: string; amount: number }> {
  const covers = Array.isArray(raw?.['paymentCovers']) ? (raw['paymentCovers'] as Raw[]) : [];
  const result: Array<{ invoiceId: string; amount: number }> = [];
  for (const cover of covers) {
    const invoiceId = cover?.['invoiceId'];
    const value = amount(cover?.['amount']);
    if (invoiceId === null || invoiceId === undefined || value === null || value <= 0) continue;
    result.push({ invoiceId: String(invoiceId), amount: value });
  }
  return result;
}

/** `status` del ticket de UISP: 0/1 abierto, 2 pendiente del cliente, 3 resuelto. */
export function ticketStatus(value: unknown): ImportedTicketInput['status'] {
  switch (Number(value)) {
    case 2:
      return 'PENDING_CUSTOMER';
    case 3:
      return 'CLOSED';
    default:
      return 'OPEN';
  }
}

/** Comentarios del ticket. Uno privado de UISP —o de un ticket no público— queda interno. */
export function ticketComments(raw: Raw): ImportedTicketComment[] {
  const ticketPublic = raw?.['public'] === true;
  const activity = Array.isArray(raw?.['activity']) ? (raw['activity'] as Raw[]) : [];
  const result: ImportedTicketComment[] = [];
  for (const entry of activity) {
    const comment = entry?.['comment'] as Raw;
    const body = text(comment?.['body']);
    if (!body) continue;
    result.push({
      body: body.slice(0, 10_000),
      internal: !(ticketPublic && entry?.['public'] === true),
      createdAt: instant(entry?.['createdAt']),
    });
  }
  return result;
}

const EXTENSIONS: Record<string, { kind: 'PDF' | 'IMAGEN' | 'OTRO'; contentType: string }> = {
  pdf: { kind: 'PDF', contentType: 'application/pdf' },
  jpg: { kind: 'IMAGEN', contentType: 'image/jpeg' },
  jpeg: { kind: 'IMAGEN', contentType: 'image/jpeg' },
  png: { kind: 'IMAGEN', contentType: 'image/png' },
  webp: { kind: 'IMAGEN', contentType: 'image/webp' },
};

/**
 * Tipo del soporte por su contenido (firma), no por el nombre: un nombre no confiable nunca
 * decide el `Content-Type` servido. Lo que no se reconoce va como binario genérico.
 */
export function documentKind(content: Buffer): {
  kind: 'PDF' | 'IMAGEN' | 'OTRO';
  contentType: string;
  extension: string;
} {
  if (content.subarray(0, 5).toString('latin1') === '%PDF-') {
    return { ...EXTENSIONS['pdf']!, extension: 'pdf' };
  }
  if (content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) {
    return { ...EXTENSIONS['jpg']!, extension: 'jpg' };
  }
  if (
    content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { ...EXTENSIONS['png']!, extension: 'png' };
  }
  if (
    content.subarray(0, 4).toString('latin1') === 'RIFF' &&
    content.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return { ...EXTENSIONS['webp']!, extension: 'webp' };
  }
  return { kind: 'OTRO', contentType: 'application/octet-stream', extension: 'bin' };
}

export function isPdf(content: Buffer): boolean {
  return content.subarray(0, 5).toString('latin1') === '%PDF-';
}
