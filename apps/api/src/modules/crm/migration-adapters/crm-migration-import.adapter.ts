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
import {
  decryptAes256Gcm,
  encryptAes256Gcm,
  loadPiiAesGcmKeyPair,
} from '../../../common/crypto/aes-gcm.util';
import { hashDocumentNumber } from '../../../common/crypto/hash-document.util';
import { hashEmail } from '../../../common/crypto/hash-email.util';
import { calculateNitVerificationDigit } from '../../../common/crypto/nit-verification-digit.adapter';
import { hmacPii, resolvePiiHashKey } from '../../../common/crypto/pii-hash-key.util';
import { CommercialCatalogReadPort } from '../../commercial/ports/commercial-catalog-read.port';
import {
  MigrationCrmImportPort,
  type ComplementField,
  type ComplementFillResult,
  type ComplementFilled,
  type ComplementRecord,
  type ComplementSubscriberInput,
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

const ALT_PHONE_CIPHERTEXT_MAX = 100;
/** Dirección por defecto del alta importada: para el complemento cuenta como vacía. */
const ADDRESS_PLACEHOLDER = 'Sin dirección registrada';

/** Columna de `subscribers` de cada campo completable (lectura como texto, sin descifrar). */
const COMPLEMENT_COLUMNS: Record<ComplementField, string> = {
  email: 'email_encrypted',
  phone: 'phone_encrypted',
  altContactName: 'alt_contact_name',
  altContactPhone: 'alt_contact_phone_encrypted',
  address: 'address',
  city: 'city',
  latitude: 'latitude',
  longitude: 'longitude',
};
const COMPLEMENT_FIELDS = Object.keys(COMPLEMENT_COLUMNS) as ComplementField[];
const COMPLEMENT_SELECT = COMPLEMENT_FIELDS.map(
  (field) => `${COMPLEMENT_COLUMNS[field]}::text AS "${field}"`,
).join(', ');

type ComplementSnapshot = Record<ComplementField, string | null>;
/** Campos guardados cifrados: su HMAC de complemento se calcula sobre el valor en claro. */
const ENCRYPTED_COMPLEMENT_FIELDS: ReadonlySet<ComplementField> = new Set([
  'email',
  'phone',
  'altContactPhone',
]);
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
  private readonly previousKeys: Buffer[];
  private readonly hashKey: Buffer;

  constructor(
    config: ConfigService,
    private readonly partyWritePort: IPartyWritePort,
    private readonly catalog: CommercialCatalogReadPort,
  ) {
    super();
    const keys = loadPiiAesGcmKeyPair(config);
    this.activeKey = keys.activeKey;
    this.previousKeys = keys.previousKey;
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
            // Los demás contactos de UISP: no principales, cifrados y con HMAC por Parties.
            ...(input.additionalContacts ?? []).map((contact) => ({
              type: contact.type === 'EMAIL' ? PartyContactType.EMAIL : PartyContactType.PHONE,
              value: contact.value,
              isPrimary: false,
            })),
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
         status, external_id, import_batch_id, created_by, converted_at, activated_at,
         alt_contact_name, alt_contact_phone_encrypted)
       VALUES ($1, $2, $3::person_type_enum, $4::customer_segment_enum, $5,
         $6, $7, $8, $9, $28,
         $10, $11, $12, $13, $14,
         $15, $16, $17::vat_treatment_enum, $18, $19, $20, $21,
         $22::subscriber_status_enum, $23, $24, $25, $26::date, $27::date,
         $29, $30)
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
        input.altContactName?.slice(0, 160) ?? null,
        this.altPhoneCiphertext(input.altContactPhone ?? null),
      ],
    )) as Array<{ id: string }>;
    return { subscriberId: rows[0]!.id, partyId, partyCreated };
  }

  /**
   * `alt_contact_phone_encrypted` es varchar(100): un teléfono de más de 21 bytes no cabe
   * cifrado. Queda solo en `party_contact` (que sí guarda su HMAC) en vez de abortar el titular.
   */
  private altPhoneCiphertext(phone: string | null): string | null {
    if (!phone) return null;
    const ciphertext = encryptAes256Gcm(phone, this.activeKey);
    return ciphertext.length <= ALT_PHONE_CIPHERTEXT_MAX ? ciphertext : null;
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

  // ── Complemento de un titular existente (spec 2026-11-15 §2.3–§2.6) ──────────────────

  async linkComplement(
    ctx: MigrationWriteContext,
    subscriberId: string,
    externalId: string,
  ): Promise<boolean> {
    // Nunca `import_batch_id`: la reversión borra los suscriptores que lo tienen.
    const rows = await ctx.manager.query(
      `UPDATE subscribers SET external_id = $3, updated_at = now()
        WHERE tenant_id = $1 AND id = $2 AND external_id IS NULL
       RETURNING id`,
      [ctx.tenantId, subscriberId, externalId],
    );
    return affected(rows) > 0;
  }

  async fillEmptyFields(
    ctx: MigrationWriteContext,
    input: ComplementSubscriberInput,
  ): Promise<ComplementFillResult> {
    const rows = (await ctx.manager.query(
      `SELECT ${COMPLEMENT_SELECT}, email_hmac, phone_hmac, party_id::text AS party_id
         FROM subscribers WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
      [ctx.tenantId, input.subscriberId],
    )) as Array<
      ComplementSnapshot & {
        email_hmac: string | null;
        phone_hmac: string | null;
        party_id: string | null;
      }
    >;
    const current = rows[0];
    if (!current) return { filled: [], differing: [], contactIds: [] };

    const set = new Map<ComplementField, unknown>();
    const differing: ComplementField[] = [];
    const plain = (value: string | null) => value?.trim().toLowerCase() || null;

    if (input.email) {
      if (current.email === null) set.set('email', encryptAes256Gcm(input.email, this.activeKey));
      else if (current.email_hmac !== hashEmail(input.email, this.hashKey)) differing.push('email');
    }
    if (input.phone) {
      if (current.phone === null) set.set('phone', encryptAes256Gcm(input.phone, this.activeKey));
      else if (current.phone_hmac !== hmacPii(input.phone, this.hashKey)) differing.push('phone');
    }
    if (input.altContactName && input.altContactPhone) {
      const phone = this.altPhoneCiphertext(input.altContactPhone);
      if (current.altContactName === null && current.altContactPhone === null && phone) {
        set.set('altContactName', input.altContactName.slice(0, 160));
        set.set('altContactPhone', phone);
      } else if (
        current.altContactName !== null &&
        plain(current.altContactName) !== plain(input.altContactName)
      ) {
        differing.push('altContactName');
      }
    }
    const address = input.address?.trim() || null;
    if (address) {
      const empty = !current.address?.trim() || current.address.trim() === ADDRESS_PLACEHOLDER;
      if (empty) {
        // Dirección, municipio y coordenadas se completan juntas, nunca mezcladas.
        set.set('address', address.slice(0, 500));
        if (current.city === null && input.city) set.set('city', input.city.slice(0, 100));
        if (current.latitude === null && current.longitude === null) {
          if (input.latitude !== null && input.longitude !== null) {
            set.set('latitude', input.latitude);
            set.set('longitude', input.longitude);
          }
        }
      } else if (plain(current.address) !== plain(address)) {
        differing.push('address');
      }
    }

    let filled: ComplementFilled[] = [];
    if (set.size > 0) {
      const fields = [...set.keys()];
      const assignments = fields.map(
        (field, index) => `${COMPLEMENT_COLUMNS[field]} = $${index + 3}`,
      );
      const params: unknown[] = [
        ctx.tenantId,
        input.subscriberId,
        ...fields.map((field) => set.get(field)),
      ];
      if (set.has('email')) {
        params.push(hashEmail(input.email!, this.hashKey));
        assignments.push(`email_hmac = $${params.length}`);
      }
      if (set.has('phone')) {
        params.push(hmacPii(input.phone!, this.hashKey));
        assignments.push(`phone_hmac = $${params.length}`);
      }
      const updated = (await ctx.manager.query(
        `UPDATE subscribers SET ${assignments.join(', ')}, updated_at = now()
          WHERE tenant_id = $1 AND id = $2
         RETURNING ${COMPLEMENT_SELECT}`,
        params,
      )) as unknown;
      const after = (
        Array.isArray(updated) && Array.isArray(updated[0]) ? updated[0] : updated
      ) as ComplementSnapshot[];
      filled = fields.map((field) => ({
        field,
        hmac: this.complementHmac(field, after[0]?.[field] ?? null) ?? '',
        // Marca sin PII del valor original (placeholder o en blanco) para restaurarlo exacto.
        ...(field === 'address' ? { original: current.address } : {}),
      }));
    }

    let contactIds: string[] = [];
    if (current.party_id && input.additionalContacts.length > 0) {
      contactIds = await this.partyWritePort.addContactsIfAbsent(
        current.party_id,
        input.additionalContacts.map((contact) => ({
          type: contact.type === 'EMAIL' ? PartyContactType.EMAIL : PartyContactType.PHONE,
          value: contact.value,
        })),
        { manager: ctx.manager, actorUserId: ctx.actorId },
      );
    }
    return { filled, differing, contactIds };
  }

  async revertComplement(ctx: MigrationWriteContext, records: ComplementRecord[]): Promise<number> {
    let reverted = 0;
    for (const record of records) {
      const assignments = record.filled.map((item) =>
        item.field === 'address'
          ? `address = ${this.originalAddressSql(item.original)}`
          : `${COMPLEMENT_COLUMNS[item.field]} = NULL`,
      );
      if (record.filled.some((item) => item.field === 'email'))
        assignments.push('email_hmac = NULL');
      if (record.filled.some((item) => item.field === 'phone'))
        assignments.push('phone_hmac = NULL');
      if (assignments.length > 0) {
        await ctx.manager.query(
          `UPDATE subscribers SET ${assignments.join(', ')}, updated_at = now()
            WHERE tenant_id = $1 AND id = $2`,
          [ctx.tenantId, record.subscriberId],
        );
      }
      if (record.linkedExternalId) {
        await ctx.manager.query(
          `UPDATE subscribers SET external_id = NULL, updated_at = now()
            WHERE tenant_id = $1 AND id = $2 AND external_id = $3`,
          [ctx.tenantId, record.subscriberId, record.linkedExternalId],
        );
      }
      if (record.contactIds.length > 0) {
        const party = (await ctx.manager.query(
          `SELECT party_id::text AS party_id FROM subscribers WHERE tenant_id = $1 AND id = $2`,
          [ctx.tenantId, record.subscriberId],
        )) as Array<{ party_id: string | null }>;
        if (party[0]?.party_id) {
          await this.partyWritePort.removeContacts(party[0].party_id, record.contactIds, {
            manager: ctx.manager,
            actorUserId: ctx.actorId,
          });
        }
      }
      reverted += 1;
    }
    return reverted;
  }

  /** Campos completados que alguien cambió después (HMAC actual distinto del escrito). */
  private async modifiedComplementFields(
    ctx: MigrationReadContext,
    records: ComplementRecord[],
  ): Promise<number> {
    let modified = 0;
    for (const record of records) {
      if (record.filled.length === 0) continue;
      const rows = (await ctx.manager.query(
        `SELECT ${COMPLEMENT_SELECT} FROM subscribers WHERE tenant_id = $1 AND id = $2`,
        [ctx.tenantId, record.subscriberId],
      )) as ComplementSnapshot[];
      const current = rows[0];
      for (const item of record.filled) {
        const now = current ? this.complementHmac(item.field, current[item.field] ?? null) : null;
        if (now !== item.hmac) modified += 1;
      }
    }
    return modified;
  }

  /**
   * HMAC del valor EN CLARO con el campo como dominio: `hmacPii("<campo>:<valor>")`. Los campos
   * cifrados se descifran (clave activa y anteriores) para que el recifrado de claves, que
   * cambia el texto cifrado sin cambiar el dato, no cuente como edición. Se descifra en vez de
   * usar `email_hmac`/`phone_hmac` porque `alt_contact_phone` no tiene columna HMAC y así la
   * regla es una sola para todos los campos. Si no descifra, devuelve null (cuenta como
   * modificado: falla cerrada).
   */
  private complementHmac(field: ComplementField, stored: string | null): string | null {
    let value = stored;
    if (value !== null && ENCRYPTED_COMPLEMENT_FIELDS.has(field)) {
      try {
        value = decryptAes256Gcm(value, this.activeKey, this.previousKeys);
      } catch {
        return null;
      }
    }
    return hmacPii(`${field}:${value ?? ''}`, this.hashKey);
  }

  /**
   * Literal SQL de la dirección original. Solo admite el placeholder del alta o un valor en
   * blanco (lo único que el complemento sobrescribe); cualquier otra cosa o la marca ausente
   * (registros previos) vuelve al placeholder.
   */
  private originalAddressSql(original: string | null | undefined): string {
    if (original === null) return 'NULL';
    if (typeof original === 'string' && /^\s*$/u.test(original)) return `'${original}'`;
    return `'${ADDRESS_PLACEHOLDER}'`;
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
    const modified = blocker(
      'DATO_COMPLETADO_MODIFICADO',
      await this.modifiedComplementFields(ctx, ids.complements ?? []),
    );
    if (ids.subscriberIds.length === 0 && ids.contractIds.length === 0) return modified;
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
      ...modified,
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
