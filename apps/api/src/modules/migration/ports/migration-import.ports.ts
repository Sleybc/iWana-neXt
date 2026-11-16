import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type {
  BillingPaymentMethod,
  MigrationRevertBlocker,
  MigrationTicketAttachmentSkipReason,
} from '@iwana/shared';

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
  /**
   * Titulares existentes que el lote complementó (spec 2026-11-15 §2.6). Nunca están en
   * `subscriberIds` (no llevan `import_batch_id`); CRM los usa para `DATO_COMPLETADO_MODIFICADO`.
   */
  complements?: ComplementRecord[];
}

// ── Complemento de un titular existente (spec 2026-11-15 §2.3–§2.6) ─────────────────────

/** Campos de `subscribers` que la importación puede completar si están vacíos. */
export type ComplementField =
  | 'email'
  | 'phone'
  | 'altContactName'
  | 'altContactPhone'
  | 'address'
  | 'city'
  | 'latitude'
  | 'longitude';

/**
 * Campo completado: nombre y HMAC (`PII_HASH_KEY`) del valor tal como quedó guardado (el
 * cifrado, en los campos cifrados). Nunca el valor: la reversión compara HMAC.
 */
export interface ComplementFilled {
  field: ComplementField;
  /** `hmacPii("<campo>:<valor en claro>")`: estable ante el recifrado de claves. */
  hmac: string;
  /**
   * Solo en `address`: valor original sobrescrito, que únicamente puede ser el placeholder del
   * alta, una cadena en blanco o null (nunca un dato del titular).
   */
  original?: string | null;
}

export interface ComplementSubscriberInput {
  subscriberId: string;
  email: string | null;
  phone: string | null;
  altContactName: string | null;
  altContactPhone: string | null;
  additionalContacts: Array<{ type: 'EMAIL' | 'PHONE'; value: string }>;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface ComplementFillResult {
  filled: ComplementFilled[];
  /** Campos con valor en iWana distinto del de UISP (solo nombres). */
  differing: ComplementField[];
  /** `party_contact` agregados (sin `import_batch_id`: la reversión los retira por id). */
  contactIds: string[];
}

/** Lo que la promoción registró en `promotion_meta` del titular complementado. */
export interface ComplementRecord {
  subscriberId: string;
  /** `external_id` que el lote fijó (`null` si no lo fijó). */
  linkedExternalId: string | null;
  filled: ComplementFilled[];
  contactIds: string[];
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
  /** Primer contacto secundario de UISP con teléfono: el «Contacto alternativo» de la ficha. */
  altContactName?: string | null;
  altContactPhone?: string | null;
  /** Correos y teléfonos de los demás contactos de UISP: `party_contact` no principal (D-CONT). */
  additionalContacts?: Array<{ type: 'EMAIL' | 'PHONE'; value: string }>;
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

  /** Fija `external_id` solo si es `NULL`; `true` si lo fijó. Nunca escribe `import_batch_id`. */
  abstract linkComplement(
    ctx: MigrationWriteContext,
    subscriberId: string,
    externalId: string,
  ): Promise<boolean>;

  /** Completa solo campos vacíos del titular existente (spec §2.4); nunca sobrescribe. */
  abstract fillEmptyFields(
    ctx: MigrationWriteContext,
    input: ComplementSubscriberInput,
  ): Promise<ComplementFillResult>;

  /**
   * Deshace el complemento: vuelve a vacío los campos completados y el `external_id` fijado y
   * retira los contactos agregados. El suscriptor nunca se borra. Llamar tras `revertBlockers`.
   */
  abstract revertComplement(
    ctx: MigrationWriteContext,
    records: ComplementRecord[],
  ): Promise<number>;

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
  /**
   * Registrador por la equivalencia `USUARIO` de `payments[].userId` (spec «usuarios» §2.6).
   * `null` o ausente: quien importa (`ctx.actorId`).
   */
  createdBy?: string | null;
}

/** Registrador esperado de un pago importado del lote («Actualizar autores», spec §2.7). */
export interface ImportedPaymentAuthor {
  paymentId: string;
  createdBy: string;
}

/**
 * Una columna re-atribuida por «Actualizar autores» (S-4): solo ids de fila y de usuario, sin
 * PII. La migración la audita fila por fila en la misma transacción.
 */
export interface ImportedAuthorChange {
  entity: 'TICKET' | 'TICKET_COMMENT' | 'TICKET_COMMENT_ATTACHMENT' | 'PAYMENT';
  id: string;
  field:
    | 'assigned_user_id'
    | 'created_by_user_id'
    | 'author_user_id'
    | 'uploaded_by_user_id'
    | 'created_by';
  from: string | null;
  to: string;
}

/**
 * Re-atribución de lo importado (spec «usuarios» §2.7). `importerIds`: quien creó o promovió el
 * lote; solo se cambian las filas que aún están a su nombre.
 */
export interface ImportedAuthorsRefreshContext extends MigrationWriteContext {
  importerIds: string[];
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

  /**
   * Como `totalsBySubscriber`, pero solo documentos y pagos importados de UISP (`external_id`
   * `uisp:%`): la conciliación de un titular complementado excluye lo propio de iWana (§2.5).
   */
  abstract importedTotalsBySubscriber(
    ctx: MigrationReadContext,
    subscriberIds: string[],
  ): Promise<Map<string, BillingTotals>>;

  /**
   * Fecha civil (`YYYY-MM-DD`) del primer cobro propio emitido por iWana (con número; no
   * importado) de cada suscriptor. Los que no tienen ninguno no aparecen (spec 2026-11-15 §2.2).
   */
  abstract firstOwnIssueDates(
    ctx: MigrationReadContext,
    subscriberIds: string[],
  ): Promise<Map<string, string>>;

  abstract revertBlockers(
    ctx: MigrationReadContext,
    batchId: string,
    ids: MigrationBatchEntityIds,
  ): Promise<MigrationRevertBlocker[]>;

  /**
   * Re-atribuye `created_by` de pagos del lote (`import_batch_id = ctx.batchId`) solo donde sigue
   * siendo quien importó. Idempotente.
   */
  abstract refreshImportedPaymentAuthors(
    ctx: ImportedAuthorsRefreshContext,
    payments: ImportedPaymentAuthor[],
  ): Promise<{ payments: number; respected: number; changes: ImportedAuthorChange[] }>;

  abstract revertBatch(ctx: MigrationWriteContext): Promise<BillingRevertResult>;
}

// ── Soporte (assurance) ────────────────────────────────────────────────────────────────

export interface ImportedTicketComment {
  body: string;
  internal: boolean;
  createdAt: string | null;
  /** Autor por la equivalencia `USUARIO` (spec «usuarios» §2.6); `null`/ausente: quien importa. */
  authorUserId?: string | null;
}

export interface ImportedTicketInput {
  externalId: string;
  sourceId: string;
  subscriberId: string;
  subject: string;
  status: 'OPEN' | 'PENDING_CUSTOMER' | 'CLOSED';
  createdAt: string | null;
  comments: ImportedTicketComment[];
  /** Asignado por la equivalencia `USUARIO`; nunca notifica ni emite eventos. */
  assignedUserId?: string | null;
  /** Creador = autor del primer comentario si tiene equivalencia; `null`/ausente: quien importa. */
  createdByUserId?: string | null;
}

export interface ImportedTicketCreated {
  ticketId: string;
  /** Alineado con `ImportedTicketInput.comments`; `null` donde no se creó comentario. */
  commentIds: Array<string | null>;
}

/** Atribución esperada de un ticket importado del lote («Actualizar autores», spec §2.7). */
export interface ImportedTicketAuthors {
  ticketId: string;
  assignedUserId: string | null;
  createdByUserId: string | null;
  /** Comentarios del ticket en UISP, en el orden en que se importaron. */
  comments: Array<{ body: string; createdAt: string | null; authorUserId: string | null }>;
}

/** Filas cambiadas y respetadas (alguien las cambió después de importar). Solo conteos. */
export interface ImportedTicketAuthorsResult {
  tickets: number;
  comments: number;
  respected: number;
  /** Columnas cambiadas, para la auditoría por fila (S-4). */
  changes: ImportedAuthorChange[];
}

@Injectable()
export abstract class MigrationSupportImportPort {
  abstract findTickets(
    ctx: MigrationReadContext,
    externalIds: string[],
  ): Promise<Map<string, string>>;

  /**
   * Crea el ticket y sus comentarios. `commentIds[i]` es el id del comentario creado para
   * `input.comments[i]` o `null` si no se creó (cuerpo vacío): la promoción cuelga de él los
   * adjuntos importados (spec MOD09 adjuntos §2.3).
   */
  abstract createImportedTicket(
    ctx: MigrationWriteContext,
    input: ImportedTicketInput,
  ): Promise<ImportedTicketCreated>;

  /** `external_id` de adjuntos importados que ya existen (`uisp:ticket_attachment:<id>`). */
  abstract findAttachments(ctx: MigrationReadContext, externalIds: string[]): Promise<Set<string>>;

  abstract revertBlockers(
    ctx: MigrationReadContext,
    batchId: string,
    ids: MigrationBatchEntityIds,
  ): Promise<MigrationRevertBlocker[]>;

  /**
   * Re-atribuye asignado, creador y autores de comentarios de tickets del lote
   * (`import_batch_id = ctx.batchId`) solo donde el valor sigue siendo el importado. Sin eventos
   * ni notificaciones. Idempotente.
   */
  abstract refreshImportedAuthors(
    ctx: ImportedAuthorsRefreshContext,
    tickets: ImportedTicketAuthors[],
  ): Promise<ImportedTicketAuthorsResult>;

  abstract revertBatch(ctx: MigrationWriteContext): Promise<{ tickets: number }>;

  /**
   * Adjunto importado de un comentario (spec MOD09 adjuntos §2.3; listo en el bloque B, lo
   * consume la promoción en el bloque C). Idempotente por `external_id`
   * (`migrationTicketAttachmentExternalId`): si ya existe devuelve `EXISTING` sin subir nada.
   * Valida con las mismas reglas que la subida manual (firma real, límite por tipo, nombre
   * saneado) y, si pasa, guarda el archivo `AVAILABLE` y la fila en la transacción de `ctx`.
   * Un archivo rechazado devuelve `SKIPPED` con su motivo y no impide importar el comentario.
   * Si la transacción se revierte, quien llama borra los objetos con
   * `purgeImportedAttachmentFiles(schemaName, mediaAssetIds de los CREATED)`.
   */
  abstract createImportedAttachment(
    ctx: MigrationWriteContext,
    input: ImportedTicketAttachmentInput,
  ): Promise<ImportedTicketAttachmentResult>;

  /**
   * Retira los adjuntos de los tickets del lote (`import_batch_id = ctx.batchId`), importados o
   * añadidos a mano después, **antes** de borrar comentarios (la FK es RESTRICT: sin esto el
   * borrado de comentarios falla con 23001). Borra las filas y retira (soft-delete) sus activos
   * en la transacción de `ctx`. Devuelve el conteo y los activos, para purgar sus objetos con
   * `purgeImportedAttachmentFiles` después del commit.
   */
  abstract retireBatchAttachments(
    ctx: MigrationWriteContext,
  ): Promise<{ attachments: number; manual: number; mediaAssetIds: string[] }>;

  /** Borra los objetos de activos ya retirados o revertidos (después del commit). */
  abstract purgeImportedAttachmentFiles(
    schemaName: string,
    mediaAssetIds: string[],
  ): Promise<number>;
}

export interface ImportedTicketAttachmentInput {
  /** Ticket y comentario ya creados en iWana (el comentario debe ser del ticket). */
  ticketId: string;
  commentId: string;
  /** `uisp:ticket_attachment:<id>`. */
  externalId: string;
  /** Nombre de UISP (no confiable: se sanea). */
  filename: string;
  /** `mimeType` declarado por UISP (no confiable: decide la firma). */
  declaredContentType: string | null;
  /** Bytes leídos de `tickets/<ticket>/<filename>` del ZIP. */
  buffer: Buffer;
  /** Autor resuelto del comentario; si es null, quien importa. */
  uploadedByUserId: string | null;
}

export type ImportedTicketAttachmentResult =
  | { status: 'CREATED'; attachmentId: string; mediaAssetId: string }
  | { status: 'EXISTING'; attachmentId: string }
  | { status: 'SKIPPED'; reason: MigrationTicketAttachmentSkipReason };

// ── Órdenes de trabajo (solo lectura, D7) ───────────────────────────────────────────────

@Injectable()
export abstract class MigrationWorkOrderReferencesPort {
  /** Órdenes de trabajo que referencian a los titulares o contratos del lote. */
  abstract countReferences(
    ctx: MigrationReadContext,
    ids: MigrationBatchEntityIds,
  ): Promise<number>;
}
