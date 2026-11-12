import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { MigrationFileRejectionReason } from '@iwana/shared';

/**
 * Lectura del ZIP por cliente de UISP (spec 2026-11-10 v1.1 §1). Recibe las entradas ya
 * extraídas con `readZipEntries` y devuelve la estructura tipada o el motivo por el que el
 * paquete completo no sirve. No valida reglas de negocio (eso es `uisp-simulation`).
 *
 * Esquemas tolerantes (`passthrough`): solo se exige lo que hace falta para identificar el
 * registro; el resto viaja sin tocar a la carga útil cifrada para la promoción (bloque C).
 */
const idSchema = z.union([z.number().int().nonnegative(), z.string().min(1).max(64)]);
const looseNumber = z.union([z.number(), z.string()]).nullable().optional();

const attributeSchema = z
  .object({
    key: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
    value: z.union([z.string(), z.number()]).nullable().optional(),
  })
  .passthrough();

const tagSchema = z.object({ id: idSchema, name: z.string().nullable().optional() }).passthrough();

export const UispClientSchema = z
  .object({
    id: idSchema,
    clientType: z.number().int().nullable().optional(),
    attributes: z.array(attributeSchema).nullable().optional(),
    tags: z.array(tagSchema).nullable().optional(),
    addressGpsLat: looseNumber,
    addressGpsLon: looseNumber,
    accountBalance: looseNumber,
  })
  .passthrough();
export type UispClient = z.infer<typeof UispClientSchema>;

export const UispServiceSchema = z
  .object({
    id: idSchema,
    clientId: idSchema.nullable().optional(),
    servicePlanId: idSchema.nullable().optional(),
    servicePlanName: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
    invoicingPeriodStartDay: z.number().int().nullable().optional(),
    addressGpsLat: looseNumber,
    addressGpsLon: looseNumber,
  })
  .passthrough();
export type UispService = z.infer<typeof UispServiceSchema>;

const coverSchema = z
  .object({
    paymentId: idSchema.nullable().optional(),
    creditNoteId: idSchema.nullable().optional(),
    invoiceId: idSchema.nullable().optional(),
    amount: looseNumber,
  })
  .passthrough();

export const UispInvoiceSchema = z
  .object({
    id: idSchema,
    clientId: idSchema.nullable().optional(),
    number: z.union([z.string(), z.number()]).nullable().optional(),
    total: looseNumber,
    paymentCovers: z.array(coverSchema).nullable().optional(),
  })
  .passthrough();
export type UispInvoice = z.infer<typeof UispInvoiceSchema>;

export const UispPaymentSchema = z
  .object({
    id: idSchema,
    clientId: idSchema.nullable().optional(),
    methodId: z.string().min(1).max(120).nullable().optional(),
    amount: looseNumber,
    paymentCovers: z.array(coverSchema).nullable().optional(),
  })
  .passthrough();
export type UispPayment = z.infer<typeof UispPaymentSchema>;

export const UispTicketSchema = z
  .object({
    id: idSchema,
    clientId: idSchema.nullable().optional(),
    public: z.boolean().nullable().optional(),
    assignedJobIds: z.array(idSchema).nullable().optional(),
  })
  .passthrough();
export type UispTicket = z.infer<typeof UispTicketSchema>;

const jobSchema = z.object({ id: idSchema }).passthrough();

export interface UispInvoiceEntry {
  record: UispInvoice | null;
  index: number;
  pdfPath: string | null;
}

export interface UispTicketEntry {
  record: UispTicket | null;
  index: number;
  attachmentPaths: string[];
}

export interface UispDocumentEntry {
  path: string;
  sha256: string;
  sizeBytes: number;
}

/** Paquete leído. Un registro con forma inválida queda como `null` con su posición. */
export interface ParsedUispPackage {
  client: UispClient;
  services: Array<{ record: UispService | null; index: number }>;
  invoices: UispInvoiceEntry[];
  payments: Array<{ record: UispPayment | null; index: number }>;
  tickets: UispTicketEntry[];
  documents: UispDocumentEntry[];
  /** Ids de tareas presentes en `jobs.json` (vacío en la muestra). */
  jobIds: Set<string>;
}

export type ParseUispResult =
  | { ok: true; value: ParsedUispPackage }
  | { ok: false; reason: MigrationFileRejectionReason };

/** Si el ZIP trae una única carpeta raíz con `client.json`, la quita. */
function rootPrefix(entries: Map<string, Buffer>): string | null {
  if (entries.has('client.json')) return '';
  const candidates = [...entries.keys()].filter((path) => /^[^/]+\/client\.json$/u.test(path));
  if (candidates.length !== 1) return null;
  return candidates[0]!.slice(0, -'client.json'.length);
}

function parseJson(buffer: Buffer | undefined): unknown | undefined {
  if (!buffer) return undefined;
  const text = buffer.toString('utf8').replace(/^﻿/u, '');
  return JSON.parse(text) as unknown;
}

function parseArray<T>(
  value: unknown,
  schema: z.ZodType<T>,
): Array<{ record: T | null; index: number }> {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new SyntaxError('Se esperaba un arreglo.');
  return value.map((item, index) => {
    const parsed = schema.safeParse(item);
    return { record: parsed.success ? parsed.data : null, index };
  });
}

function stem(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

/**
 * Entradas del paquete con las rutas relativas a la carpeta de `client.json` (las mismas que
 * guarda la simulación en `pdfPath` y `path`); `null` si no hay `client.json` único.
 */
export function packageEntries(rawEntries: Map<string, Buffer>): Map<string, Buffer> | null {
  const prefix = rootPrefix(rawEntries);
  if (prefix === null) return null;
  const entries = new Map<string, Buffer>();
  for (const [path, content] of rawEntries) {
    if (path.startsWith(prefix)) entries.set(path.slice(prefix.length), content);
  }
  return entries;
}

export function parseUispPackage(rawEntries: Map<string, Buffer>): ParseUispResult {
  const entries = packageEntries(rawEntries);
  if (entries === null) return { ok: false, reason: 'CLIENTE_AUSENTE' };

  let clientRaw: unknown;
  let servicesRaw: unknown;
  let invoicesRaw: unknown;
  let paymentsRaw: unknown;
  let ticketsRaw: unknown;
  let jobsRaw: unknown;
  try {
    clientRaw = parseJson(entries.get('client.json'));
    servicesRaw = parseJson(entries.get('services.json'));
    invoicesRaw = parseJson(entries.get('invoices.json'));
    paymentsRaw = parseJson(entries.get('payments.json'));
    ticketsRaw = parseJson(entries.get('tickets.json'));
    jobsRaw = parseJson(entries.get('jobs.json'));
  } catch {
    return { ok: false, reason: 'JSON_INVALIDO' };
  }

  const client = UispClientSchema.safeParse(clientRaw);
  if (!client.success) return { ok: false, reason: 'CLIENTE_AUSENTE' };

  try {
    const pdfByStem = new Map<string, string>();
    const attachments = new Map<string, string[]>();
    const documents: UispDocumentEntry[] = [];
    for (const [path, content] of [...entries].sort(([a], [b]) => a.localeCompare(b))) {
      if (/^invoices\/[^/]+\.pdf$/iu.test(path)) {
        pdfByStem.set(stem(path), path);
      } else if (/^tickets\/[^/]+\/.+/u.test(path)) {
        const ticketId = path.split('/')[1]!;
        attachments.set(ticketId, [...(attachments.get(ticketId) ?? []), path]);
      } else if (/^documents\/.+/u.test(path)) {
        documents.push({
          path,
          sha256: createHash('sha256').update(content).digest('hex'),
          sizeBytes: content.length,
        });
      }
    }

    const invoices = parseArray(invoicesRaw, UispInvoiceSchema).map(({ record, index }) => {
      const byId = record ? pdfByStem.get(String(record.id)) : undefined;
      const byNumber =
        record?.number !== undefined && record?.number !== null
          ? pdfByStem.get(String(record.number))
          : undefined;
      return { record, index, pdfPath: byId ?? byNumber ?? null };
    });
    const tickets = parseArray(ticketsRaw, UispTicketSchema).map(({ record, index }) => ({
      record,
      index,
      attachmentPaths: record ? (attachments.get(String(record.id)) ?? []) : [],
    }));
    const jobIds = new Set(
      parseArray(jobsRaw, jobSchema)
        .map(({ record }) => (record ? String(record.id) : null))
        .filter((id): id is string => id !== null),
    );

    return {
      ok: true,
      value: {
        client: client.data,
        services: parseArray(servicesRaw, UispServiceSchema),
        invoices,
        payments: parseArray(paymentsRaw, UispPaymentSchema),
        tickets,
        documents,
        jobIds,
      },
    };
  } catch {
    return { ok: false, reason: 'JSON_INVALIDO' };
  }
}
