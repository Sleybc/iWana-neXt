import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import {
  AuditAction,
  type BillingFirstChargeFiscalField,
  type CustomerSegment,
} from '@iwana/shared';
import { DataSource } from 'typeorm';
import {
  createFiscalDocumentCrypto,
  type EncryptedFiscalDocument,
  type FiscalDocumentCrypto,
} from '../../../common/crypto/fiscal-document.util';
import { AuditService } from '../../audit/audit.service';
import {
  BillingContractFirstChargePort,
  type ContractActivationAnchor,
  type FiscalDataFreezeResult,
  type InstallationFeeFreezeResult,
} from '../../billing/ports/billing-contract-first-charge.port';
import { CommercialCatalogReadPort } from '../../commercial/ports/commercial-catalog-read.port';
import { SettingsPriorityTenantReadPort } from '../../tenant/ports/settings-priority-tenant-read.port';
import { getTenantLocalDate } from './billing-cycle-date.util';
import { resolvePlanInstallationFee } from './utils/plan-installation-fee.util';
import { freezeInstallationVat } from './utils/contract-item-vat.util';

const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/u;

interface AnchorRow {
  contract_id: string;
  status: string;
  start_date: string | null;
  status_changed_at: Date | string | null;
  event_start: string | null;
  anonymized: boolean;
}

interface InstallationRow {
  installation_fee: string | null;
  plan_id: string;
  segment: CustomerSegment | null;
  anonymized: boolean;
}

interface FiscalRow {
  fiscal_name: string | null;
  fiscal_address: string | null;
  has_document: boolean;
  business_name: string | null;
  full_name: string | null;
  address: string | null;
  document_number_encrypted: string | null;
  nit: string | null;
  anonymized: boolean;
}

/** Longitudes de `contracts.fiscal_name` y `contracts.fiscal_address` (migración 029). */
const FISCAL_NAME_MAX = 200;
const FISCAL_ADDRESS_MAX = 255;

function present(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Adaptador CRM del puerto «Generar primer cobro» (spec 2026-11-11 R3/R4/R7). Lee y escribe solo
 * tablas de CRM; el cargo vigente del plan sale del puerto de MOD06 con la misma regla que la
 * creación del contrato (`resolvePlanInstallationFee`).
 */
@Injectable()
export class BillingContractFirstChargeAdapter extends BillingContractFirstChargePort {
  private readonly fiscalDocumentCrypto: FiscalDocumentCrypto;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tenantSettings: SettingsPriorityTenantReadPort,
    private readonly catalog: CommercialCatalogReadPort,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    super();
    this.fiscalDocumentCrypto = createFiscalDocumentCrypto(config);
  }

  async findActivationAnchor(contractId: string): Promise<ContractActivationAnchor | null> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const { timezone } = await this.tenantSettings.getSnapshot({ tenantId });
    const rows = (await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.query(
        `SELECT c.id::text AS contract_id, c.status, c.start_date::text AS start_date,
                c.status_changed_at,
                (SELECT e.envelope #>> '{payload,billingStartDate}'
                   FROM contract_activation_events e
                  WHERE e.contract_id = c.id AND e.tenant_id = c.tenant_id
                  LIMIT 1) AS event_start,
                (s.anonymized_at IS NOT NULL OR s.anonymized_request_id IS NOT NULL) AS anonymized
           FROM contracts c
           JOIN subscribers s ON s.id = c.subscriber_id AND s.tenant_id = c.tenant_id
          WHERE c.id = $1::uuid AND c.tenant_id = $2
            AND c.deleted_at IS NULL AND s.deleted_at IS NULL
          LIMIT 1`,
        [contractId, tenantId],
      ),
    )) as AnchorRow[];
    const row = rows[0];
    if (!row || row.anonymized) return null;
    if (row.event_start && CIVIL_DATE.test(row.event_start)) {
      return { contractId, status: row.status, date: row.event_start, source: 'ACTIVATION_EVENT' };
    }
    if (row.start_date && CIVIL_DATE.test(row.start_date.slice(0, 10))) {
      return {
        contractId,
        status: row.status,
        date: row.start_date.slice(0, 10),
        source: 'START_DATE',
      };
    }
    if (row.status_changed_at != null) {
      // Contrato heredado: sin evento ni fecha de inicio, la última transición es la activación
      // mientras siga ACTIVE sin haber pasado por SUSPENDED (no hay historial de estados).
      return {
        contractId,
        status: row.status,
        date: getTenantLocalDate(new Date(row.status_changed_at), timezone),
        source: 'STATUS_CHANGED_AT',
      };
    }
    return { contractId, status: row.status, date: null, source: null };
  }

  async freezeInstallationFeeIfMissing(
    contractId: string,
    actorId: string,
  ): Promise<InstallationFeeFreezeResult> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const rows = (await qr.query(
        `SELECT c.installation_fee::text AS installation_fee, c.plan_id,
                COALESCE(c.customer_segment::text, s.customer_segment::text) AS segment,
                (s.anonymized_at IS NOT NULL OR s.anonymized_request_id IS NOT NULL) AS anonymized
           FROM contracts c
           JOIN subscribers s ON s.id = c.subscriber_id AND s.tenant_id = c.tenant_id
          WHERE c.id = $1::uuid AND c.tenant_id = $2
            AND c.deleted_at IS NULL AND s.deleted_at IS NULL
          FOR UPDATE OF c`,
        [contractId, tenantId],
      )) as InstallationRow[];
      const row = rows[0];
      if (!row || row.anonymized) {
        throw new NotFoundException({
          code: 'CONTRACT_NOT_FOUND',
          message: 'No se encontró el contrato.',
        });
      }
      if (row.installation_fee != null) {
        return { outcome: 'ALREADY_SET', amount: row.installation_fee };
      }
      const fee = await resolvePlanInstallationFee(
        this.catalog,
        { tenantId, schemaName },
        qr.manager,
        row.plan_id,
        row.segment,
      );
      if (fee == null) return { outcome: 'UNRESOLVED', amount: null };
      const amount = fee.toFixed(2);
      // Spec MOD14 2026-11-12 R2: el IVA de la instalación se congela con el cargo; uno ya
      // congelado no se toca.
      const installationVat = await freezeInstallationVat(
        this.catalog,
        { tenantId, schemaName },
        qr.manager,
        row.plan_id,
      );
      // Sube `updated_at` (versión/ETag del contrato) como cualquier otra escritura del contrato.
      // TypeORM devuelve [filas, afectadas] para UPDATE en PostgreSQL.
      const [, affected] = (await qr.query(
        `UPDATE contracts
            SET installation_fee = $3::numeric,
                installation_vat_snapshot = COALESCE(installation_vat_snapshot, $4::jsonb),
                updated_at = GREATEST(
                  date_trunc('milliseconds', clock_timestamp()),
                  date_trunc('milliseconds', updated_at) + interval '1 millisecond'
                )
          WHERE id = $1::uuid AND tenant_id = $2 AND installation_fee IS NULL`,
        [contractId, tenantId, amount, JSON.stringify(installationVat)],
      )) as [unknown[], number];
      if (affected !== 1)
        throw new Error('El cargo de instalación cambió durante el congelamiento.');
      await this.audit.logWithin(
        {
          action: AuditAction.UPDATE,
          entityType: 'Contract',
          entityId: contractId,
          userId: actorId,
          oldValue: { installationFee: null },
          newValue: { installationFee: amount, reason: 'PRIMER_COBRO_CONTRATO_HEREDADO' },
        },
        qr.manager,
      );
      return { outcome: 'FROZEN', amount };
    });
  }

  async freezeFiscalDataIfMissing(
    contractId: string,
    actorId: string,
  ): Promise<FiscalDataFreezeResult> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const rows = (await qr.query(
        `SELECT c.fiscal_name, c.fiscal_address,
                (NULLIF(c.fiscal_document_encrypted, '') IS NOT NULL
                 OR NULLIF(c.fiscal_document, '') IS NOT NULL) AS has_document,
                s.business_name,
                NULLIF(concat_ws(' ', s.first_name, s.last_name), '') AS full_name,
                s.address, s.document_number_encrypted, s.nit,
                (s.anonymized_at IS NOT NULL OR s.anonymized_request_id IS NOT NULL) AS anonymized
           FROM contracts c
           JOIN subscribers s ON s.id = c.subscriber_id AND s.tenant_id = c.tenant_id
          WHERE c.id = $1::uuid AND c.tenant_id = $2
            AND c.deleted_at IS NULL AND s.deleted_at IS NULL
          FOR UPDATE OF c`,
        [contractId, tenantId],
      )) as FiscalRow[];
      const row = rows[0];
      if (!row || row.anonymized) {
        throw new NotFoundException({
          code: 'CONTRACT_NOT_FOUND',
          message: 'No se encontró el contrato.',
        });
      }

      const frozen: BillingFirstChargeFiscalField[] = [];
      const missing: BillingFirstChargeFiscalField[] = [];
      let name: string | null = null;
      let address: string | null = null;
      let document: EncryptedFiscalDocument | null = null;

      if (!present(row.fiscal_name)) {
        const candidate = present(row.business_name) ? row.business_name : row.full_name;
        if (present(candidate) && candidate.trim().length <= FISCAL_NAME_MAX) {
          name = candidate.trim();
          frozen.push('NAME');
        } else missing.push('NAME');
      }
      if (!row.has_document) {
        document = this.subscriberDocument(row);
        if (document) frozen.push('DOCUMENT');
        else missing.push('DOCUMENT');
      }
      if (!present(row.fiscal_address)) {
        if (present(row.address) && row.address.trim().length <= FISCAL_ADDRESS_MAX) {
          address = row.address.trim();
          frozen.push('ADDRESS');
        } else missing.push('ADDRESS');
      }

      if (frozen.length === 0) {
        return {
          outcome: missing.length ? 'UNRESOLVED' : 'ALREADY_SET',
          frozenFields: [],
          missingFields: missing,
        };
      }

      // Solo se escriben los campos vacíos; el texto plano heredado del documento se limpia
      // al guardar el cifrado (misma regla que setFiscalDocumentStorage).
      const [, affected] = (await qr.query(
        `UPDATE contracts
            SET fiscal_name = COALESCE($3::text, fiscal_name),
                fiscal_address = COALESCE($4::text, fiscal_address),
                fiscal_document_encrypted = COALESCE($5::text, fiscal_document_encrypted),
                fiscal_document_hmac = COALESCE($6::text, fiscal_document_hmac),
                fiscal_document = CASE WHEN $5::text IS NULL THEN fiscal_document ELSE NULL END,
                updated_at = GREATEST(
                  date_trunc('milliseconds', clock_timestamp()),
                  date_trunc('milliseconds', updated_at) + interval '1 millisecond'
                )
          WHERE id = $1::uuid AND tenant_id = $2`,
        [contractId, tenantId, name, address, document?.encrypted ?? null, document?.hmac ?? null],
      )) as [unknown[], number];
      if (affected !== 1) throw new Error('No se pudieron congelar los datos fiscales.');
      await this.audit.logWithin(
        {
          action: AuditAction.UPDATE,
          entityType: 'Contract',
          entityId: contractId,
          userId: actorId,
          oldValue: { fiscalFieldsMissing: [...frozen, ...missing] },
          newValue: {
            fiscalFieldsFrozen: frozen,
            source: 'SUBSCRIBER',
            reason: 'PRIMER_COBRO_CONTRATO_HEREDADO',
          },
        },
        qr.manager,
      );
      return { outcome: 'FROZEN', frozenFields: frozen, missingFields: missing };
    });
  }

  /**
   * Documento del titular: `document_number_encrypted` (mismo par de llaves PII que el documento
   * fiscal) o, en su defecto, el NIT de la persona jurídica. Se vuelve a cifrar con su HMAC para
   * el contrato; nunca se registra ni se devuelve. Un valor ilegible o inválido no se congela.
   */
  private subscriberDocument(row: FiscalRow): EncryptedFiscalDocument | null {
    try {
      const plain = present(row.document_number_encrypted)
        ? this.fiscalDocumentCrypto.decrypt(row.document_number_encrypted)
        : present(row.nit)
          ? row.nit
          : null;
      return present(plain) ? this.fiscalDocumentCrypto.encrypt(plain.trim()) : null;
    } catch {
      return null;
    }
  }
}
