import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import type { DataSource } from 'typeorm';
import { decryptAes256Gcm, loadPiiAesGcmKeyPair } from '../../../common/crypto/aes-gcm.util';
import {
  BillingTitularContactReadPort,
  type BillingTitularContact,
} from '../../billing/ports/billing-titular-contact-read.port';

type TitularContactRow = {
  party_id: string | null;
  email_encrypted: string | null;
  anonymized_at: Date | string | null;
  anonymized_request_id: string | null;
};

/**
 * Correo registrado del titular para Facturación (spec MOD05↔MOD14 2026-11-13 D5, P8).
 *
 * Fuente: `subscribers.email_encrypted`, la misma que usa la copia del contrato firmado
 * (`SubscribersService.findById` → `email`). Es la columna de CRM que se escribe al crear y al
 * editar el suscriptor; `party_contact` es de Parties (MOD08) y leerla desde aquí cruzaría su
 * boundary. Descifra en memoria; un fallo de descifrado se trata como «sin correo» y solo se
 * loguea el identificador.
 */
@Injectable()
export class BillingTitularContactReadAdapter extends BillingTitularContactReadPort {
  private readonly logger = new Logger(BillingTitularContactReadAdapter.name);
  private readonly keys: { activeKey: Buffer; previousKey: Buffer[] };

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    configService: ConfigService,
  ) {
    super();
    this.keys = loadPiiAesGcmKeyPair(configService);
  }

  async findTitularEmail(subscriberId: string): Promise<BillingTitularContact> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const rows = (await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.query(
        `SELECT party_id::text AS party_id, email_encrypted, anonymized_at, anonymized_request_id
           FROM subscribers
          WHERE tenant_id = $1 AND id = $2::uuid AND deleted_at IS NULL
          LIMIT 1`,
        [tenantId, subscriberId],
      ),
    )) as TitularContactRow[];
    const row = rows[0];
    if (!row) return { exists: false, anonymized: false, partyId: null, email: null };
    const anonymized = row.anonymized_at != null || row.anonymized_request_id != null;
    if (anonymized) return { exists: true, anonymized, partyId: row.party_id, email: null };
    return {
      exists: true,
      anonymized,
      partyId: row.party_id,
      email: this.decrypt(subscriberId, row),
    };
  }

  private decrypt(subscriberId: string, row: TitularContactRow): string | null {
    if (!row.email_encrypted) return null;
    try {
      const email = decryptAes256Gcm(
        row.email_encrypted,
        this.keys.activeKey,
        this.keys.previousKey,
      ).trim();
      return email || null;
    } catch {
      this.logger.warn(`billing.titular_email.decrypt_failed subscriberId=${subscriberId}`);
      return null;
    }
  }
}
