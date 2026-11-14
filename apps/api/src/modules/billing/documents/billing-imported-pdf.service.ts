import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { STORAGE_PORT, decryptObjectBuffer, type StoragePort } from '@iwana/storage';
import { AuditAction } from '@iwana/shared';
import { loadPiiAesGcmKeyPair } from '../../../common/crypto/aes-gcm.util';
import { AuditService } from '../../audit/audit.service';

/**
 * PDF histórico de un documento `IMPORTADO` (ADR-110 D5): se entrega el archivo de UISP tal
 * cual lo guardó la promoción; nunca se renderiza como documento de iWana (no es fiscal).
 *
 * El objeto está cifrado (IWE1, clave PII). A diferencia del emitido, no se puede redactar:
 * si el titular tiene DATOS_BLOQUEADOS y quien pide no puede verlos (`buyerProtected`), se
 * rechaza. Cada entrega queda auditada como RECORD_ACCESS.
 */
@Injectable()
export class BillingImportedPdfService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async read(
    documentId: string,
    access: { actorId: string; buyerProtected: boolean },
  ): Promise<Buffer> {
    if (access.buyerProtected) {
      throw new ConflictException({
        code: 'BILLING_IMPORTED_PDF_RESTRICTED',
        message: 'Los datos de este suscriptor están restringidos.',
      });
    }
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const key = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const rows = (await qr.query(
        `SELECT external_pdf_key FROM billing_documents
          WHERE tenant_id = $1 AND id = $2 AND status = 'IMPORTADO'`,
        [tenantId, documentId],
      )) as Array<{ external_pdf_key: string | null }>;
      const found = rows[0]?.external_pdf_key ?? null;
      if (found) {
        await this.audit.logWithin(
          {
            action: AuditAction.RECORD_ACCESS,
            entityType: 'BillingDocument',
            entityId: documentId,
            userId: access.actorId,
            newValue: { purpose: 'BILLING_IMPORTED_PDF_DOWNLOAD' },
          },
          qr.manager,
        );
      }
      return found;
    });
    if (!key) {
      throw new NotFoundException({
        code: 'BILLING_IMPORTED_PDF_NOT_AVAILABLE',
        message: 'La factura importada no trae PDF.',
      });
    }
    // H6: solo claves del schema del tenant.
    if (!key.startsWith(`${schemaName}/`)) throw this.unreadable();
    try {
      const keys = loadPiiAesGcmKeyPair(this.config);
      return decryptObjectBuffer(await this.storage.getObject(key), [
        keys.activeKey,
        ...keys.previousKey,
      ]);
    } catch {
      throw this.unreadable();
    }
  }

  private unreadable(): InternalServerErrorException {
    return new InternalServerErrorException({
      code: 'BILLING_IMPORTED_PDF_UNREADABLE',
      message: 'No fue posible leer el PDF importado.',
    });
  }
}
