import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DocumentTypeParty,
  PartyContactType,
  PartyRoleType,
  PartyType,
  type MigrationRevertBlocker,
  type MigrationRevertBlockReason,
} from '@iwana/shared';
import { encryptAes256Gcm, loadPiiAesGcmKeyPair } from '../../../common/crypto/aes-gcm.util';
import { hashDocumentNumber } from '../../../common/crypto/hash-document.util';
import { hashEmail } from '../../../common/crypto/hash-email.util';
import { calculateNitVerificationDigit } from '../../../common/crypto/nit-verification-digit.adapter';
import { hmacPii, resolvePiiHashKey } from '../../../common/crypto/pii-hash-key.util';
import { CommercialCatalogReadPort } from '../../commercial/ports/commercial-catalog-read.port';
import {
  MigrationCrmImportPort,
  type CrmRevertResult,
  type ImportedContractInput,
  type ImportedSubscriberDocumentInput,
  type ImportedSubscriberInput,
  type ImportedSubscriberResult,
  type ImportedSuspensionPeriod,
  type MigrationBatchEntityIds,
  type MigrationReadContext,
  type MigrationWriteContext,
} from '../../migration/ports/migration-import.ports';
import { IPartyWritePort } from '../../parties/ports/party-write.port';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function affected(result: unknown): number {
  if (Array.isArray(result) && typeof result[1] === 'number') return result[1];
  return Array.isArray(result) ? result.length : 0;
}

/** Misma regla que `VatTreatmentService.resolve` (dato heredado del suscriptor). */
function legacyVatTreatment(personType: 'NATURAL' | 'JURIDICA', stratum: number | null): string {
  if (personType === 'JURIDICA' || stratum === null || stratum >= 4) return 'STANDARD';
  return stratum <= 2 ? 'EXEMPT' : 'EXCLUDED';
}

function blocker(motivo: MigrationRevertBlockReason, cantidad: number): MigrationRevertBlocker[] {
  return cantidad > 0 ? [{ motivo, cantidad }] : [];
}

/**
 * Adaptador CRM de la importación desde UISP (ADR-110 D3, D7, D11, D13). Escribe solo tablas
 * de CRM (suscriptor, contrato, historial del ciclo de vida, soportes) y delega el party al
 * puerto de Parties y el plan congelado al catálogo comercial. Cifra el documento, el correo y
 * el teléfono como el alta manual (AES-GCM + HMAC con `PII_HASH_KEY`).
 *
 * Reglas de esta fase:
 * - El titular entra `PROSPECT`: `ck_subscribers_fiscal_complete_when_active` exige la
 *   responsabilidad de IVA (y el representante legal de la jurídica), que UISP no trae. La
 *   cola de datos fiscales lo completa y la transición normal lo activa.
 * - El estrato de UISP va al suscriptor (lo exige `chk_subscriber_person_fields`) y al
 *   contrato como `installation_stratum` sin evidencia ni `vat_snapshot`: el IVA efectivo del
 *   punto queda pendiente de evidencia (ADR-093). `vat_treatment` del suscriptor sigue la
 *   regla del alta manual (VatTreatmentService) solo como dato heredado.
 */
@Injectable()
export class CrmMigrationImportAdapter extends MigrationCrmImportPort {
  private readonly activeKey: Buffer;
  private readonly hashKey: Buffer;

  constructor(
    config: ConfigService,
    private readonly partyWritePort: IPartyWritePort,
    private readonly catalog: CommercialCatalogReadPort,
  ) {
    super();
    this.activeKey = loadPiiAesGcmKeyPair(config).activeKey;
    this.hashKey = resolvePiiHashKey(config);
  }

  async findSubscribers(
    ctx: MigrationReadContext,
    externalIds: string[],
  ): Promise<Map<string, { id: string; anonymized: boolean; deleted: boolean }>> {
    const result = new Map<string, { id: string; anonymized: boolean; deleted: boolean }>();
    if (externalIds.length === 0) return result;
    // Incluye las bajas: `uq_subscribers_external_id` no las excluye, y omitirlas haría que
    // el reintento intentara crear otra vez el mismo `external_id` (23505).
    const rows = (await ctx.manager.query(
      `SELECT id::text, external_id, (anonymized_at IS NOT NULL) AS anonymized,
              (deleted_at IS NOT NULL) AS deleted
         FROM subscribers
        WHERE tenant_id = $1 AND external_id = ANY($2::varchar[])`,
      [ctx.tenantId, externalIds],
    )) as Array<{ id: string; external_id: string; anonymized: boolean; deleted: boolean }>;
    for (const row of rows) {
      result.set(row.external_id, {
        id: row.id,
        anonymized: row.anonymized,
        deleted: row.deleted,
      });
    }
    return result;
  }

  async createSubscriber(
    ctx: MigrationWriteContext,
    input: ImportedSubscriberInput,
  ): Promise<ImportedSubscriberResult> {
    const juridica = input.personType === 'JURIDICA';
    const displayName = juridica
      ? input.businessName?.trim() || 'Sin nombre'
      : [input.firstName, input.lastName].filter(Boolean).join(' ').trim() || 'Sin nombre';
    let partyId: string | null = null;
    let partyCreated = false;
    {
      const party = await this.partyWritePort.ensurePartyWithRole(
        {
          partyType: juridica ? PartyType.ORGANIZATION : PartyType.NATURAL,
          documentType: juridica ? DocumentTypeParty.NIT : DocumentTypeParty.CC,
          documentNumber: input.documentNumber,
          displayName: displayName.slice(0, 160),
          legalName: displayName,
          contacts: [
            ...(input.email
              ? [{ type: PartyContactType.EMAIL, value: input.email, isPrimary: true }]
              : []),
            ...(input.phone
              ? [{ type: PartyContactType.PHONE, value: input.phone, isPrimary: true }]
              : []),
          ],
          address: input.address,
          city: input.city,
          department: null,
          latitude: input.latitude,
          longitude: input.longitude,
        },
        PartyRoleType.CUSTOMER,
        { manager: ctx.manager, actorUserId: ctx.actorId },
      );
      partyId = party.partyId;
      partyCreated = party.partyCreated;
    }

    const document = juridica ? null : input.documentNumber;
    const nit = juridica ? input.documentNumber : null;
    const rows = (await ctx.manager.query(
      `INSERT INTO subscribers (
         tenant_id, party_id, person_type, customer_segment, document_type,
         document_number_encrypted, document_number_hmac, first_name, last_name, stratum,
         nit, nit_verification_digit, business_name, email_encrypted, email_hmac,
         phone_encrypted, phone_hmac, vat_treatment, address, city, latitude, longitude,
         status, external_id, import_batch_id, created_by, converted_at, activated_at)
       VALUES ($1, $2, $3::person_type_enum, $4::customer_segment_enum, $5,
         $6, $7, $8, $9, $28,
         $10, $11, $12, $13, $14,
         $15, $16, $17::vat_treatment_enum, $18, $19, $20, $21,
         $22::subscriber_status_enum, $23, $24, $25, $26::date, $27::date)
       RETURNING id::text`,
      [
        ctx.tenantId,
        partyId,
        input.personType,
        juridica ? 'PYME' : 'RESIDENTIAL',
        juridica ? null : 'CC',
        document ? encryptAes256Gcm(document, this.activeKey) : null,
        input.documentNumber ? hashDocumentNumber(input.documentNumber, this.hashKey) : null,
        juridica ? null : (input.firstName?.slice(0, 300) ?? null),
        juridica ? null : (input.lastName?.slice(0, 300) ?? null),
        nit,
        nit ? calculateNitVerificationDigit(nit) : null,
        juridica ? (input.businessName?.slice(0, 300) ?? null) : null,
        input.email ? encryptAes256Gcm(input.email, this.activeKey) : null,
        input.email ? hashEmail(input.email, this.hashKey) : null,
        input.phone ? encryptAes256Gcm(input.phone, this.activeKey) : null,
        input.phone ? hmacPii(input.phone, this.hashKey) : null,
        legacyVatTreatment(input.personType, input.stratum),
        (input.address?.trim() || 'Sin dirección registrada').slice(0, 500),
        input.city?.slice(0, 100) ?? null,
        input.latitude,
        input.longitude,
        'PROSPECT',
        input.externalId,
        ctx.batchId,
        ctx.actorId,
        input.registeredOn,
        null,
        juridica ? null : input.stratum,
      ],
    )) as Array<{ id: string }>;
    return { subscriberId: rows[0]!.id, partyId, partyCreated };
  }

  async findContracts(
    ctx: MigrationReadContext,
    externalIds: string[],
  ): Promise<Map<string, string>> {
    return this.idsByExternal(ctx, 'contracts', externalIds);
  }

  async createContract(
    ctx: MigrationWriteContext,
    input: ImportedContractInput,
  ): Promise<{ id: string } | { rejected: 'PLAN_SIN_EQUIVALENCIA' | 'CICLO_SIN_EQUIVALENCIA' }> {
    if (!UUID.test(input.planId)) return { rejected: 'PLAN_SIN_EQUIVALENCIA' };
    if (input.billingCycleDay !== null) {
      const cycles = (await ctx.manager.query(
        `SELECT 1 FROM crm_billing_cycles WHERE cycle_day = $1 AND active`,
        [input.billingCycleDay],
      )) as unknown[];
      if (cycles.length === 0) return { rejected: 'CICLO_SIN_EQUIVALENCIA' };
    }
    const segment = input.personType === 'JURIDICA' ? 'PYME' : 'RESIDENTIAL';
    let snapshot;
    try {
      snapshot = await this.catalog.createSnapshot(
        ctx.tenantId,
        ctx.schemaName,
        input.planId,
        segment as never,
        { manager: ctx.manager },
      );
    } catch {
      return { rejected: 'PLAN_SIN_EQUIVALENCIA' };
    }
    if (!snapshot) return { rejected: 'PLAN_SIN_EQUIVALENCIA' };
    const planSnapshot = {
      ...snapshot,
      monthlyPrice:
        input.individualPrice !== null && input.individualPrice >= 0
          ? input.individualPrice
          : snapshot.monthlyPrice,
      snapshotAt: snapshot.snapshotAt.toISOString(),
      importedFrom: 'UISP',
    };
    const residential = input.personType === 'NATURAL' && input.stratum !== null;
    const terminatedAt =
      input.status === 'TERMINATED'
        ? (input.endDate ?? new Date().toISOString().slice(0, 10))
        : null;
    const rows = (await ctx.manager.query(
      `INSERT INTO contracts (
         tenant_id, subscriber_id, plan_id, plan_snapshot_json, status, start_date, end_date,
         alias, installation_address, customer_segment, service_usage, installation_stratum,
         billing_cycle_day, terminated_at, status_changed_at, external_id, import_batch_id)
       VALUES ($1, $2, $3, $4::jsonb, $5::contract_status_enum, $6::date, $7::date,
         $8, $9, $10, $11, $12, $13, $14::timestamptz, now(), $15, $16)
       RETURNING id::text`,
      [
        ctx.tenantId,
        input.subscriberId,
        input.planId,
        JSON.stringify(planSnapshot),
        input.status,
        input.startDate,
        input.endDate,
        input.alias?.slice(0, 120) ?? null,
        input.installationAddress?.slice(0, 255) ?? null,
        segment,
        input.personType === 'JURIDICA' ? 'NON_RESIDENTIAL' : residential ? 'RESIDENTIAL' : null,
        residential ? input.stratum : null,
        input.billingCycleDay,
        terminatedAt,
        input.externalId,
        ctx.batchId,
      ],
    )) as Array<{ id: string }>;
    return { id: rows[0]!.id };
  }

  async recordSuspensionHistory(
    ctx: MigrationWriteContext,
    input: { contractId: string; subscriberId: string; periods: ImportedSuspensionPeriod[] },
  ): Promise<number> {
    let written = 0;
    for (const period of input.periods) {
      const changes: Array<[string, string, string]> = [['ACTIVE', 'SUSPENDED', period.startDate]];
      if (period.endDate) changes.push(['SUSPENDED', 'ACTIVE', period.endDate]);
      for (const [from, to, at] of changes) {
        await ctx.manager.query(
          `INSERT INTO crm_lifecycle_changes (
             tenant_id, entity_type, entity_id, subscriber_id, from_status, to_status,
             reason_code, source, batch_id, actor_id, changed_at)
           VALUES ($1, 'CONTRACT', $2, $3, $4, $5, 'HISTORICO_IMPORTADO', 'IMPORTADO', $6, $7,
             $8::date)`,
          [
            ctx.tenantId,
            input.contractId,
            input.subscriberId,
            from,
            to,
            ctx.batchId,
            ctx.actorId,
            at,
          ],
        );
        written += 1;
      }
    }
    return written;
  }

  async findDocuments(
    ctx: MigrationReadContext,
    externalIds: string[],
  ): Promise<Map<string, string>> {
    return this.idsByExternal(ctx, 'subscriber_documents', externalIds);
  }

  /** `<schema>/subscriber-documents/<external_id saneado>.<ext>`: determinista por `external_id`. */
  subscriberDocumentStorageKey(schemaName: string, externalId: string, extension: string): string {
    const safe = externalId.replace(/[^A-Za-z0-9._-]/gu, '_');
    const ext = extension.replace(/[^a-z0-9]/giu, '').slice(0, 8) || 'bin';
    return `${schemaName}/subscriber-documents/${safe}.${ext}`;
  }

  async createSubscriberDocument(
    ctx: MigrationWriteContext,
    input: ImportedSubscriberDocumentInput,
  ): Promise<string> {
    const rows = (await ctx.manager.query(
      `INSERT INTO subscriber_documents (
         tenant_id, subscriber_id, kind, content_type, size_bytes, sha256, storage_key,
         origin, visibility, external_id, import_batch_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'IMPORTADO', 'INTERNA', $8, $9, NULL)
       RETURNING id::text`,
      [
        ctx.tenantId,
        input.subscriberId,
        input.kind,
        input.contentType,
        input.sizeBytes,
        input.sha256,
        input.storageKey,
        input.externalId,
        ctx.batchId,
      ],
    )) as Array<{ id: string }>;
    return rows[0]!.id;
  }

  async batchEntityIds(
    ctx: MigrationReadContext,
    batchId: string,
  ): Promise<MigrationBatchEntityIds> {
    const subscribers = (await ctx.manager.query(
      `SELECT id::text FROM subscribers WHERE tenant_id = $1 AND import_batch_id = $2`,
      [ctx.tenantId, batchId],
    )) as Array<{ id: string }>;
    const contracts = (await ctx.manager.query(
      `SELECT id::text FROM contracts WHERE tenant_id = $1 AND import_batch_id = $2`,
      [ctx.tenantId, batchId],
    )) as Array<{ id: string }>;
    return {
      subscriberIds: subscribers.map((row) => row.id),
      contractIds: contracts.map((row) => row.id),
    };
  }

  async revertBlockers(
    ctx: MigrationReadContext,
    batchId: string,
    ids: MigrationBatchEntityIds,
  ): Promise<MigrationRevertBlocker[]> {
    if (ids.subscriberIds.length === 0 && ids.contractIds.length === 0) return [];
    const rows = (await ctx.manager.query(
      `SELECT
         (SELECT COUNT(*) FROM contracts
           WHERE tenant_id = $1 AND subscriber_id = ANY($2::uuid[])
             AND import_batch_id IS DISTINCT FROM $4)::int
       + (SELECT COUNT(*) FROM crm_lifecycle_changes
           WHERE tenant_id = $1 AND source <> 'IMPORTADO'
             AND (subscriber_id = ANY($2::uuid[]) OR entity_id = ANY($3::uuid[])))::int
       + (SELECT COUNT(*) FROM contract_signatures WHERE contract_id = ANY($3::uuid[]))::int
       + (SELECT COUNT(*) FROM contract_document_generations WHERE contract_id = ANY($3::uuid[]))::int
       + (SELECT COUNT(*) FROM contract_activation_events WHERE contract_id = ANY($3::uuid[]))::int
       + (SELECT COUNT(*) FROM contract_permanence WHERE contract_id = ANY($3::uuid[]))::int
           AS contracts,
         ((SELECT COUNT(*) FROM subscriber_documents
            WHERE tenant_id = $1 AND subscriber_id = ANY($2::uuid[])
              AND import_batch_id IS DISTINCT FROM $4)
        + (SELECT COUNT(*) FROM subscriber_note WHERE subscriber_id = ANY($2::uuid[])))::int
           AS documents,
         (SELECT COUNT(*) FROM subscriber_tag_assignments
           WHERE tenant_id = $1 AND subscriber_id = ANY($2::uuid[])
             AND import_batch_id IS DISTINCT FROM $4)::int AS tags`,
      [ctx.tenantId, ids.subscriberIds, ids.contractIds, batchId],
    )) as Array<{ contracts: number; documents: number; tags: number }>;
    const row = rows[0] ?? { contracts: 0, documents: 0, tags: 0 };
    return [
      ...blocker('CONTRATO_POSTERIOR', Number(row.contracts)),
      ...blocker('SOPORTE_POSTERIOR', Number(row.documents)),
      ...blocker('ETIQUETA_POSTERIOR', Number(row.tags)),
    ];
  }

  async revertBatch(
    ctx: MigrationWriteContext,
    createdPartyIds: string[],
  ): Promise<CrmRevertResult> {
    const documents = (await ctx.manager.query(
      `DELETE FROM subscriber_documents WHERE tenant_id = $1 AND import_batch_id = $2
       RETURNING storage_key`,
      [ctx.tenantId, ctx.batchId],
    )) as unknown;
    const storageKeys = (
      Array.isArray(documents) && Array.isArray(documents[0])
        ? (documents[0] as Array<{ storage_key: string }>)
        : (documents as Array<{ storage_key: string }>)
    ).map((row) => row.storage_key);
    const suspension = await ctx.manager.query(
      `DELETE FROM crm_lifecycle_changes
        WHERE tenant_id = $1 AND source = 'IMPORTADO' AND batch_id = $2
       RETURNING id`,
      [ctx.tenantId, ctx.batchId],
    );
    const contracts = await ctx.manager.query(
      `DELETE FROM contracts WHERE tenant_id = $1 AND import_batch_id = $2 RETURNING id`,
      [ctx.tenantId, ctx.batchId],
    );
    await ctx.manager.query(
      `DELETE FROM subscriber_tax_profiles
        WHERE tenant_id = $1
          AND subscriber_id IN (SELECT id FROM subscribers WHERE tenant_id = $1 AND import_batch_id = $2)`,
      [ctx.tenantId, ctx.batchId],
    );
    const subscribers = await ctx.manager.query(
      `DELETE FROM subscribers WHERE tenant_id = $1 AND import_batch_id = $2 RETURNING id`,
      [ctx.tenantId, ctx.batchId],
    );
    if (createdPartyIds.length > 0) {
      // CRM descarta los que sus propias tablas aún referencian; Parties retira el resto si
      // sus FK lo permiten (puerto, sin tocar tablas party*).
      const stillUsed = (await ctx.manager.query(
        `SELECT DISTINCT unnest(ARRAY[party_id, legal_representative_party_id])::text AS id
           FROM subscribers
          WHERE party_id = ANY($1::uuid[]) OR legal_representative_party_id = ANY($1::uuid[])`,
        [createdPartyIds],
      )) as Array<{ id: string | null }>;
      const used = new Set(stillUsed.map((row) => row.id));
      await this.partyWritePort.removeOrphanImportedParties(
        createdPartyIds.filter((id) => !used.has(id)),
        PartyRoleType.CUSTOMER,
        { manager: ctx.manager, actorUserId: ctx.actorId },
      );
    }
    return {
      subscribers: affected(subscribers),
      contracts: affected(contracts),
      documents: storageKeys.length,
      suspensionRows: affected(suspension),
      storageKeys,
    };
  }

  private async idsByExternal(
    ctx: MigrationReadContext,
    table: 'contracts' | 'subscriber_documents',
    externalIds: string[],
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (externalIds.length === 0) return result;
    const rows = (await ctx.manager.query(
      `SELECT id::text, external_id FROM ${table}
        WHERE tenant_id = $1 AND external_id = ANY($2::varchar[])`,
      [ctx.tenantId, externalIds],
    )) as Array<{ id: string; external_id: string }>;
    for (const row of rows) result.set(row.external_id, row.id);
    return result;
  }
}
