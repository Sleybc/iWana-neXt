import { z } from 'zod';
import { OperatorCustomerServiceChannelSchema } from '../organization/operator-contract-profile';

/**
 * Snapshot inmutable del contrato para el PDF (cierre de venta, bloque B; ADR-109 D5).
 * Lo escribe MOD05 cifrado en `contract_document_generations.snapshot_encrypted` y lo lee
 * el worker. Contiene PII (documento completo, G7): nunca viaja en la cola ni en logs.
 */
export const CONTRACT_DOCUMENT_SNAPSHOT_VERSION = 1 as const;

const money = z.number().finite().nonnegative();
const text = (max: number) => z.string().max(max);

export const ContractDocumentSnapshotSchema = z
  .object({
    snapshotVersion: z.literal(CONTRACT_DOCUMENT_SNAPSHOT_VERSION),
    contractId: z.string().uuid(),
    executionOrderId: z.string().uuid().nullable(),
    template: z.object({ legalTextId: z.string().uuid(), version: text(32) }).strict(),
    operator: z
      .object({
        legalName: text(300),
        nit: text(20),
        qualityAndCoverageUrl: text(500),
        customerServiceChannels: z.array(OperatorCustomerServiceChannelSchema).min(1).max(10),
        reconnectionFee: money,
        annualIncreaseCapPercent: z.number().finite().min(0).max(100),
        equipmentIncidentReportChannel: text(500),
        otherConditions: text(10_000).nullable(),
      })
      .strict(),
    holder: z
      .object({
        fullName: text(400),
        documentType: text(20).nullable(),
        documentNumber: text(40).nullable(),
        email: text(320).nullable(),
        phone: text(40).nullable(),
      })
      .strict(),
    service: z
      .object({
        planId: text(120),
        planName: text(200),
        technology: text(60).nullable(),
        downloadMbps: z.number().finite().nonnegative().nullable(),
        uploadMbps: z.number().finite().nonnegative().nullable(),
        monthlyPrice: money,
        vatRatePercent: z.number().finite().min(0).max(100).nullable(),
        vatAmount: money.nullable(),
        monthlyTotal: money,
        stratum: z.number().int().min(1).max(6).nullable(),
        serviceUsage: text(20).nullable(),
        /**
         * Cargo de instalación congelado en el contrato (`installation_fee`). Opcional para leer
         * instantáneas anteriores a la fase 2; null si el contrato no lo tiene.
         */
        installationFee: money.nullable().optional(),
      })
      .strict(),
    installation: z
      .object({
        address: text(500).nullable(),
        city: text(120).nullable(),
        department: text(120).nullable(),
      })
      .strict(),
    equipment: z
      .array(
        z
          .object({
            serialNumber: text(120),
            macAddress: text(40).nullable(),
            model: text(200).nullable(),
          })
          .strict(),
      )
      .max(50),
    /** Solo si el cliente aceptó la permanencia; las fechas se fijan en la activación. */
    permanence: z
      .object({
        months: z.number().int().min(1).max(12),
        connectionFee: money,
        discountedOrDeferredAmount: money,
        startDate: z.string().nullable(),
        endDate: z.string().nullable(),
        schedule: z
          .array(z.object({ month: z.number().int().min(1).max(12), amount: money }).strict())
          .max(12),
      })
      .strict()
      .nullable(),
    capturedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type ContractDocumentSnapshot = z.infer<typeof ContractDocumentSnapshotSchema>;

/** Cuerpo de `POST crm/contracts/:id/document-generations` (consola de OT). */
export const ContractDocumentGenerationRequestSchema = z
  .object({ executionOrderId: z.string().uuid() })
  .strict();
export type ContractDocumentGenerationRequest = z.infer<
  typeof ContractDocumentGenerationRequestSchema
>;
