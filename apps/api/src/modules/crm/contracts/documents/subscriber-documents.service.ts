import {
  ConflictException,
  ForbiddenException,
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
import { loadPiiAesGcmKeyPair } from '../../../../common/crypto/aes-gcm.util';
import {
  AccessPermissionKey,
  AuditAction,
  SubscriberDocumentSchema,
  type SubscriberDocument,
} from '@iwana/shared';
import { EffectivePermissionsService } from '../../../access-control/services/effective-permissions.service';
import { AuditService } from '../../../audit/audit.service';
import type { JwtPayload } from '../../../auth/interfaces/jwt-payload.interface';
import { ContractsService } from '../contracts.service';

interface DocumentRow {
  id: string;
  subscriber_id: string;
  kind: SubscriberDocument['kind'];
  content_type: string;
  size_bytes: number;
  origin: SubscriberDocument['origin'];
  visibility: SubscriberDocument['visibility'];
  document_date: string | null;
  created_at: Date | string;
  storage_key: string;
}

/**
 * Soportes documentales del suscriptor en la pestaña Documentos (ADR-110 D13). Listar exige
 * `crm.subscribers.read`; descargar además `crm.subscribers.document.read` (los soportes de
 * UISP suelen ser copias de la cédula) y que el titular no esté bloqueado ni anonimizado.
 * Cada descarga queda auditada. El archivo sale por la API, nunca por una URL del storage.
 */
@Injectable()
export class SubscriberDocumentsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly contractsService: ContractsService,
    private readonly permissions: EffectivePermissionsService,
    private readonly auditService: AuditService,
    private readonly config: ConfigService,
  ) {}

  async listForSubscriber(subscriberId: string): Promise<SubscriberDocument[]> {
    // Misma guarda de titular que la descarga: anonimizado o bloqueado no lista soportes.
    await this.assertTitularReadable(subscriberId);
    const rows = await this.rows(subscriberId, null);
    return rows.map((row) =>
      SubscriberDocumentSchema.parse({
        id: row.id,
        subscriberId: row.subscriber_id,
        kind: row.kind,
        contentType: row.content_type,
        sizeBytes: Number(row.size_bytes),
        origin: row.origin,
        visibility: row.visibility,
        documentDate: row.document_date,
        createdAt: new Date(row.created_at).toISOString(),
      }),
    );
  }

  async download(
    subscriberId: string,
    documentId: string,
    actor: JwtPayload,
  ): Promise<{ content: Buffer; contentType: string }> {
    const [row] = await this.rows(subscriberId, documentId);
    if (!row) {
      throw new NotFoundException({
        code: 'SUBSCRIBER_DOCUMENT_NOT_FOUND',
        message: 'El soporte no existe.',
      });
    }
    const granted = await this.permissions.getEffectivePermissionsForUser(actor.sub);
    if (!granted.includes(AccessPermissionKey.CRM_SUBSCRIBERS_DOCUMENT_READ)) {
      throw new ForbiddenException({
        code: 'SUBSCRIBER_DOCUMENT_RESTRICTED',
        message: 'No tienes autorización para descargar los soportes del suscriptor.',
      });
    }
    await this.assertTitularReadable(subscriberId);
    const { schemaName } = TenantContext.getOrThrow();
    // H6: la clave debe pertenecer al schema del tenant antes de pedir el objeto.
    if (!row.storage_key.startsWith(`${schemaName}/`)) {
      throw new InternalServerErrorException({
        code: 'SUBSCRIBER_DOCUMENT_UNREADABLE',
        message: 'No fue posible leer el soporte.',
      });
    }
    // H1: el objeto está cifrado (IWE1) con la clave PII; se lee con la activa y la previa.
    let content: Buffer;
    try {
      const keys = loadPiiAesGcmKeyPair(this.config);
      content = decryptObjectBuffer(await this.storage.getObject(row.storage_key), [
        keys.activeKey,
        ...keys.previousKey,
      ]);
    } catch {
      throw new InternalServerErrorException({
        code: 'SUBSCRIBER_DOCUMENT_UNREADABLE',
        message: 'No fue posible leer el soporte.',
      });
    }
    await this.auditService.log({
      action: AuditAction.RECORD_ACCESS,
      entityType: 'SubscriberDocument',
      entityId: row.id,
      userId: actor.sub,
      newValue: { subscriberId, purpose: 'SUBSCRIBER_DOCUMENT_DOWNLOAD' },
    });
    return { content, contentType: row.content_type };
  }

  private async assertTitularReadable(subscriberId: string): Promise<void> {
    try {
      await this.contractsService.assertSubscriberNotBlockedForMutation(subscriberId);
    } catch (error) {
      if (error instanceof ConflictException || error instanceof NotFoundException) {
        throw new ConflictException({
          code: 'SUBSCRIBER_DOCUMENT_TITULAR_RESTRICTED',
          message: 'Los datos de este suscriptor están restringidos.',
        });
      }
      throw error;
    }
  }

  private async rows(subscriberId: string, documentId: string | null): Promise<DocumentRow[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return (await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.query(
        `SELECT id::text, subscriber_id::text, kind, content_type, size_bytes, origin, visibility,
                document_date::text AS document_date, created_at, storage_key
           FROM subscriber_documents
          WHERE tenant_id = $1 AND subscriber_id = $2 AND deleted_at IS NULL
            AND ($3::uuid IS NULL OR id = $3::uuid)
          ORDER BY created_at DESC, id DESC`,
        [tenantId, subscriberId, documentId],
      ),
    )) as DocumentRow[];
  }
}
