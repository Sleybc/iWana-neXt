import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { BillingPaymentMethod, MigrationRevertBlocker } from '@iwana/shared';

/**
 * Puertos de la promoción, conciliación y reversión de la importación (ADR-110 D3, D5–D7,
 * D13). Los implementan los módulos dueños de cada tabla (CRM, Billing, Soporte y la lectura de
 * órdenes de trabajo); la migración nunca lee ni escribe sus tablas.
 *
 * Todos corren en la transacción del llamador (`manager` con `search_path` del tenant fijado
 * por `runInTenantSchema`). El tenant viaja explícito: los jobs BullMQ no tienen contexto.
 * Los `external_id` siguen `uisp:<entidad>:<id>` y su índice único parcial hace la promoción
 * idempotente: un `external_id` existente se reutiliza, nunca se duplica.
 */
export interface MigrationWriteContext {
  manager: EntityManager;
  tenantId: string;
  schemaName: string;
  batchId: string;
  actorId: string;
}

export interface MigrationReadContext {
  manager: EntityManager;
  tenantId: string;
}

/** Ids de lo que trajo un lote, para cruzar referencias posteriores entre módulos. */
export interface MigrationBatchEntityIds {
  subscriberIds: string[];
  contractIds: string[];
}

// ── CRM ─────────────────────────────────────────────────────────────────────────────────

export interface ImportedSubscriberInput {
  externalId: string;
  personType: 'NATURAL' | 'JURIDICA';
  documentType: 'CC' | 'NIT';
  /** Documento normalizado (obligatorio por `chk_subscriber_person_fields`). */
  documentNumber: string;
  /** Estrato de UISP, pendiente de evidencia; obligatorio para persona natural. */
  stratum: number | null;
  firstName: string | null;
  lastName: string | null;
  businessName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  /** UISP `registrationDate`; fecha civil o `null`. */
  registeredOn: string | null;
}

export interface ImportedSubscriberResult {
  subscriberId: string;
  partyId: string | null;
  partyCreated: boolean;
}

export interface ImportedContractInput {
  externalId: string;
  subscriberId: string;
  /** UUID del plan del catálogo MOD06 (equivalencia `PLAN`). */
  planId: string;
  /** Día de ciclo ADR-102 (equivalencia `CICLO`) o `null` si UISP no lo trae. */
  billingCycleDay: number | null;
  status: 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
  startDate: string | null;
  endDate: string | null;
  /** Precio individual de UISP; reemplaza la tarifa del catálogo en el plan congelado. */
  individualPrice: number | null;
  /** Estrato pendiente de evidencia: no fija IVA (ADR-093). */
  stratum: number | null;
  personType: 'NATURAL' | 'JURIDICA';
  alias: string | null;
  installationAddress: string | null;
}

export interface ImportedSuspensionPeriod {
  startDate: string;
  endDate: string | null;
}

export interface ImportedSubscriberDocumentInput {
  externalId: string;
  subscriberId: string;
  kind: 'PDF' | 'IMAGEN' | 'OTRO';
  contentType: string;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
}

export interface CrmRevertResult {
  subscribers: number;
  contracts: number;
  documents: number;
  suspensionRows: number;
  /** Claves de storage de los soportes retirados; el llamador las borra tras el commit. */
  storageKeys: string[];
}

@Injectable()
export abstract class MigrationCrmImportPort {
  /** `external_id` → id, incluidos anonimizados y dados de baja (para no promoverlos). */
  abstract findSubscribers(
    ctx: MigrationReadContext,
    externalIds: string[],
  ): Promise<Map<string, { id: string; anonymized: boolean; deleted: boolean }>>;

  abstract createSubscriber(
    ctx: MigrationWriteContext,
    input: ImportedSubscriberInput,
  ): Promise<ImportedSubscriberResult>;

  abstract findContracts(
    ctx: MigrationReadContext,
    externalIds: string[],
  ): Promise<Map<string, string>>;

  /**
   * Crea el contrato con el plan congelado del catálogo. Si el plan no existe en el catálogo
   * o el ciclo no está activo en `crm_billing_cycles`, no escribe y devuelve el motivo.
   */
  abstract createContract(
    ctx: MigrationWriteContext,
    input: ImportedContractInput,
  ): Promise<{ id: string } | { rejected: 'PLAN_SIN_EQUIVALENCIA' | 'CICLO_SIN_EQUIVALENCIA' }>;

  /** Periodos de suspensión al historial del ciclo de vida (`source = 'IMPORTADO'`). */
  abstract recordSuspensionHistory(
    ctx: MigrationWriteContext,
    input: { contractId: string; subscriberId: string; periods: ImportedSuspensionPeriod[] },
  ): Promise<number>;

  abstract findDocuments(
    ctx: MigrationReadContext,
    externalIds: string[],
  ): Promise<Map<string, string>>;

  abstract createSubscriberDocument(
    ctx: MigrationWriteContext,
    input: ImportedSubscriberDocumentInput,
  ): Promise<string>;

  /**
   * Clave de storage del soporte, dictada por CRM y determinista por `external_id`: un
   * reintento sobrescribe el mismo objeto en vez de dejar huérfanos.
   */
  abstract subscriberDocumentStorageKey(
    schemaName: string,
    externalId: string,
    extension: string,
  ): string;

  abstract batchEntityIds(
    ctx: MigrationReadContext,
    batchId: string,
  ): Promise<MigrationBatchEntityIds>;

  /** Referencias de CRM creadas después y ajenas al lote (D7). */
  abstract revertBlockers(
    ctx: MigrationReadContext,
    batchId: string,
    ids: MigrationBatchEntityIds,
  ): Promise<MigrationRevertBlocker[]>;

  /** Retira lo del lote en orden inverso; los party creados por él solo si quedan huérfanos. */
  abstract revertBatch(
    ctx: MigrationWriteContext,
    createdPartyIds: string[],
  ): Promise<CrmRevertResult>;
}

// ── Billing ─────────────────────────────────────────────────────────────────────────────

export interface ImportedBillingLine {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface ImportedBillingDocumentInput {
  externalId: string;
  externalNumber: string | null;
  contractId: string;
  subscriberId: string;
  issueDate: string;
  dueDate: string;
  total: number;
  lines: ImportedBillingLine[];
  pdfKey: string | null;
}

export interface ImportedPaymentInput {
  externalId: string;
  subscriberId: string;
  method: BillingPaymentMethod;
  amount: number;
  paidAt: string;
}

export interface BillingTotals {
  billedCents: number;
  paidCents: number;
}

export interface BillingRevertResult {
  documents: number;
  payments: number;
  allocations: number;
  pdfKeys: string[];
}

@Injectable()
export abstract class MigrationBillingImportPort {
  abstract findDocuments(
    ctx: MigrationReadContext,
    externalIds: string[],
  ): Promise<Map<string, string>>;

  abstract findPayments(
    ctx: MigrationReadContext,
    externalIds: string[],
  ): Promise<Map<string, string>>;

  /** Documento `IMPORTADO` con sus líneas: sin número propio, periodo ni eventos (D5). */
  abstract createImportedDocument(
    ctx: MigrationWriteContext,
    input: ImportedBillingDocumentInput,
  ): Promise<string>;

  /** Clave de storage del PDF histórico, dictada por Billing y determinista por `external_id`. */
  abstract importedPdfStorageKey(schemaName: string, externalId: string): string;

  abstract createImportedPayment(
    ctx: MigrationWriteContext,
    input: ImportedPaymentInput,
  ): Promise<string>;

  /** Cobertura de UISP como aplicación; `false` si ya existía. Solo desde la promoción. */
  abstract allocateImported(
    ctx: MigrationWriteContext,
    input: { paymentId: string; documentId: string; amount: number },
  ): Promise<boolean>;

  /** Facturado (EMITIDO + IMPORTADO) y pagado (REGISTRADO) por titular, en centavos. */
  abstract totalsBySubscriber(
    ctx: MigrationReadContext,
    subscriberIds: string[],
  ): Promise<Map<string, BillingTotals>>;

  abstract revertBlockers(
    ctx: MigrationReadContext,
    batchId: string,
    ids: MigrationBatchEntityIds,
  ): Promise<MigrationRevertBlocker[]>;

  abstract revertBatch(ctx: MigrationWriteContext): Promise<BillingRevertResult>;
}

// ── Soporte (assurance) ────────────────────────────────────────────────────────────────

export interface ImportedTicketComment {
  body: string;
  internal: boolean;
  createdAt: string | null;
}

export interface ImportedTicketInput {
  externalId: string;
  sourceId: string;
  subscriberId: string;
  subject: string;
  status: 'OPEN' | 'PENDING_CUSTOMER' | 'CLOSED';
  createdAt: string | null;
  comments: ImportedTicketComment[];
}

@Injectable()
export abstract class MigrationSupportImportPort {
  abstract findTickets(
    ctx: MigrationReadContext,
    externalIds: string[],
  ): Promise<Map<string, string>>;

  abstract createImportedTicket(
    ctx: MigrationWriteContext,
    input: ImportedTicketInput,
  ): Promise<string>;

  abstract revertBlockers(
    ctx: MigrationReadContext,
    batchId: string,
    ids: MigrationBatchEntityIds,
  ): Promise<MigrationRevertBlocker[]>;

  abstract revertBatch(ctx: MigrationWriteContext): Promise<{ tickets: number }>;
}

// ── Órdenes de trabajo (solo lectura, D7) ───────────────────────────────────────────────

@Injectable()
export abstract class MigrationWorkOrderReferencesPort {
  /** Órdenes de trabajo que referencian a los titulares o contratos del lote. */
  abstract countReferences(
    ctx: MigrationReadContext,
    ids: MigrationBatchEntityIds,
  ): Promise<number>;
}
