import { z } from 'zod';
import { billingMoneyStringSchema } from './billing-money.schema';

/**
 * Cierre de una OT de instalación reenviado a MOD14 (spec MOD14 2026-11-13, bloque A: R1, R2).
 * Productor: relay del outbox de MOD11 en el worker (solo `ExecutionOrderClosedV1` de OT
 * `INSTALLATION`); consumidor: Billing. Job name = BILLING_INSTALLATION_CLOSED_JOB_NAME,
 * jobId = eventId. El payload solo aporta identificadores: Billing relee la OT por puerto.
 */
export const BILLING_INSTALLATION_CLOSED_JOB_NAME = 'capture-installation-consumption';

export const BillingInstallationClosedEventSchema = z
  .object({
    eventId: z.string().uuid(),
    executionOrderId: z.string().uuid(),
    aggregateVersion: z.number().int().positive(),
    occurredAt: z.string().datetime(),
  })
  .strict();

export type BillingInstallationClosedEvent = z.infer<typeof BillingInstallationClosedEventSchema>;

export const SignedBillingInstallationClosedEventSchema = z
  .object({
    tenantId: z.string().uuid(),
    envelope: BillingInstallationClosedEventSchema,
    signature: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

export type SignedBillingInstallationClosedEvent = z.infer<
  typeof SignedBillingInstallationClosedEventSchema
>;

/**
 * JSON canónico que firman el worker y verifica la API. `audience` separa el dominio de esta
 * firma: un mensaje firmado para otra cola no verifica aquí.
 */
export function canonicalizeBillingInstallationClosedEvent(
  tenantId: string,
  event: BillingInstallationClosedEvent,
): string {
  return JSON.stringify({
    audience: 'billing-installation-closed',
    envelope: {
      aggregateVersion: event.aggregateVersion,
      eventId: event.eventId,
      executionOrderId: event.executionOrderId,
      occurredAt: event.occurredAt,
    },
    tenantId,
  });
}

/**
 * Origen del valor de referencia congelado de cada ítem (spec MOD14 2026-11-13 R2): precio vigente
 * del producto comercial vinculado, costo promedio de inventario o sin valor.
 */
export const BILLING_INSTALLATION_VALUE_SOURCES = [
  'PRECIO_COMERCIAL',
  'COSTO_PROMEDIO',
  'SIN_VALOR',
] as const;
export type BillingInstallationValueSource = (typeof BILLING_INSTALLATION_VALUE_SOURCES)[number];

/** Ítem consumido por la OT de instalación, con su valor de referencia congelado (R3, R4). */
export const BillingInstallationBreakdownItemSchema = z
  .object({
    /** OT de instalación que registró el consumo. */
    executionOrderNumber: z.string().min(1).max(40),
    /** Orden del ítem dentro de su OT. */
    position: z.number().int().positive(),
    /** Nombre del artículo en el catálogo de inventario del ISP. */
    description: z.string().min(1).max(200),
    quantity: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/u),
    unitOfMeasure: z.string().min(1).max(32),
    /** Valor de referencia por unidad; null con `SIN_VALOR`. */
    unitReferenceValue: billingMoneyStringSchema.nullable(),
    /** Cantidad × valor unitario; null con `SIN_VALOR`. */
    referenceValue: billingMoneyStringSchema.nullable(),
    valueSource: z.enum(BILLING_INSTALLATION_VALUE_SOURCES),
    /** Equipo entregado en comodato: valor informativo, se devuelve (R4). */
    isLoan: z.boolean(),
    /** Seriales del equipo; vacío si `serialsProtected`. */
    serialNumbers: z.array(z.string().min(1).max(160)),
  })
  .strict();
export type BillingInstallationBreakdownItem = z.infer<
  typeof BillingInstallationBreakdownItemSchema
>;

/**
 * Desglose informativo del documento que lleva la línea `INSTALACION` (spec MOD14 2026-11-13 R3–R5).
 * Se vincula por contrato: incluye las OT de instalación cerradas antes o después de generar el
 * documento. No es una línea de cobro: no cambia base, IVA ni total.
 */
export const BillingDocumentInstallationBreakdownSchema = z
  .object({
    executionOrders: z.array(
      z
        .object({
          executionOrderNumber: z.string().min(1).max(40),
          closedAt: z.string().datetime(),
        })
        .strict(),
    ),
    items: z.array(BillingInstallationBreakdownItemSchema),
    /** «Valor real de la instalación»: suma de `referenceValue` (comodato incluido). */
    realValue: billingMoneyStringSchema,
    /** «Valor cobrado»: total (con IVA) de las líneas `INSTALACION` del documento. */
    chargedValue: billingMoneyStringSchema,
    /** Ítems sin valor de referencia: no suman en `realValue`. */
    itemsWithoutValue: z.number().int().min(0),
    /** true si el titular tiene datos bloqueados sin permiso del lector o está anonimizado. */
    serialsProtected: z.boolean(),
  })
  .strict();
export type BillingDocumentInstallationBreakdown = z.infer<
  typeof BillingDocumentInstallationBreakdownSchema
>;
