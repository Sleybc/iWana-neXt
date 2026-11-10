import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  AccessPermissionKey,
  AuditAction,
  SUBSCRIBER_NOTE_BODY_MAX_LENGTH,
  type SubscriberNote,
  type SubscriberNoteListResponse,
} from '@iwana/shared';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { DataSource, QueryRunner } from 'typeorm';
import { AuditService } from '../../../audit/audit.service';
import {
  decryptAes256Gcm,
  encryptAes256Gcm,
  loadPiiAesGcmKeyPair,
} from '../../../../common/crypto/aes-gcm.util';
import { EffectivePermissionsService } from '../../../access-control/services/effective-permissions.service';
import { IPrivacyMarksReadPort } from '../../../privacy/ports/privacy-marks-read.port';
import { buildPageMeta, clampLimit, clampPage } from '../../../../common/pagination';
import { titularAnonymizedConflict } from '../guards/titular-anonymized-conflict';

interface NoteRow {
  id: string;
  subscriber_id: string;
  body_encrypted: string;
  created_by: string;
  created_at: Date | string;
}

interface SubscriberRow {
  id: string;
  party_id: string | null;
  anonymized_at: Date | string | null;
}

type ReadGrant = 'PRIVACY_READ' | 'CRM_BLOCKED_DATA_READ';

/**
 * Notas manuales del suscriptor (MOD05 ficha estilo UISP, D3). Solo se crean y se
 * listan. El cuerpo es texto libre con posible PII: se guarda cifrado (AES-256-GCM,
 * como la nota de ciclo de vida) y nunca va a logs ni a la auditoría.
 */
@Injectable()
export class SubscriberNotesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly effectivePermissionsService: EffectivePermissionsService,
    @Inject(IPrivacyMarksReadPort) private readonly privacyMarksReadPort: IPrivacyMarksReadPort,
    private readonly configService: ConfigService,
  ) {}

  async list(
    subscriberId: string,
    actor: { id: string; role: string },
    options: { page?: number; limit?: number } = {},
  ): Promise<SubscriberNoteListResponse> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const grant = await this.resolveBlockedReadGrant(actor.id);
    const { page, limit } = clampPage(options.page ?? 1, clampLimit(options.limit));
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const subscriber = await this.findSubscriber(qr, subscriberId, tenantId, false);
      const blocked = await this.isBlocked(qr, subscriber);
      if (blocked && !grant) {
        // Como lifecycleChanges: el intento queda auditado fuera de esta transacción,
        // que se revierte con el 403.
        await this.auditService.log({
          action: AuditAction.RECORD_ACCESS,
          entityType: 'Subscriber',
          entityId: subscriberId,
          userId: actor.id,
          newValue: { role: actor.role, resource: 'SubscriberNote' },
        });
        throw new ForbiddenException({
          code: 'BLOCKED_DATA_READ_FORBIDDEN',
          message: 'No tiene permiso para consultar las notas de un titular con datos bloqueados.',
        });
      }
      await this.auditService.logWithin(
        {
          action: AuditAction.RECORD_ACCESS,
          entityType: 'Subscriber',
          entityId: subscriberId,
          userId: actor.id,
          newValue: {
            role: actor.role,
            resource: 'SubscriberNote',
            ...(blocked && grant ? { privacyMark: 'DATOS_BLOQUEADOS', grantedBy: grant } : {}),
          },
        },
        qr.manager,
      );
      const countRows = (await qr.query(
        `SELECT COUNT(*)::int AS total FROM subscriber_note WHERE subscriber_id = $1`,
        [subscriberId],
      )) as Array<{ total: number }>;
      const rows = (await qr.query(
        `SELECT id, subscriber_id, body_encrypted, created_by, created_at
           FROM subscriber_note
          WHERE subscriber_id = $1
          ORDER BY created_at DESC, id DESC
          LIMIT $2 OFFSET $3`,
        [subscriberId, limit, (page - 1) * limit],
      )) as NoteRow[];
      return {
        data: rows.map((row) => this.toNote(row)),
        meta: buildPageMeta({ total: countRows[0]?.total ?? 0, page, limit, randomAccess: true }),
      };
    });
  }

  /**
   * La guarda HTTP `GuardBlockedTitular` rechaza antes al titular bloqueado o
   * anonimizado; aquí se repite dentro de la transacción, con la fila del
   * suscriptor bloqueada en modo compartido, para cerrar la carrera con la supresión.
   */
  async create(subscriberId: string, body: string, actorId: string): Promise<SubscriberNote> {
    const text = body.trim();
    if (text.length === 0 || text.length > SUBSCRIBER_NOTE_BODY_MAX_LENGTH) {
      throw new BadRequestException({
        code: 'SUBSCRIBER_NOTE_INVALID_LENGTH',
        message: `La nota debe tener entre 1 y ${SUBSCRIBER_NOTE_BODY_MAX_LENGTH} caracteres.`,
      });
    }
    const { activeKey } = loadPiiAesGcmKeyPair(this.configService);
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const subscriber = await this.findSubscriber(qr, subscriberId, tenantId, true);
      if (subscriber.anonymized_at != null) throw titularAnonymizedConflict();
      if (await this.isBlocked(qr, subscriber)) {
        throw new ConflictException({
          code: 'PRIVACY_DATA_BLOCKED',
          message: 'Los datos de este titular están bloqueados para edición.',
        });
      }
      const rows = (await qr.query(
        `INSERT INTO subscriber_note (subscriber_id, body_encrypted, created_by)
         VALUES ($1, $2, $3)
         RETURNING id, subscriber_id, created_by, created_at`,
        [subscriberId, encryptAes256Gcm(text, activeKey), actorId],
      )) as Array<Omit<NoteRow, 'body_encrypted'>>;
      const row = rows[0] as Omit<NoteRow, 'body_encrypted'>;
      const note: SubscriberNote = {
        id: row.id,
        subscriberId: row.subscriber_id,
        body: text,
        createdBy: row.created_by,
        createdAt: toIso(row.created_at),
      };
      await this.auditService.logWithin(
        {
          action: AuditAction.CREATE,
          entityType: 'SubscriberNote',
          entityId: note.id,
          userId: actorId,
          newValue: { subscriberId, bodyLength: note.body.length },
        },
        qr.manager,
      );
      return note;
    });
  }

  private async findSubscriber(
    qr: QueryRunner,
    subscriberId: string,
    tenantId: string,
    lock: boolean,
  ): Promise<SubscriberRow> {
    const rows = (await qr.query(
      `SELECT id, party_id, anonymized_at
         FROM subscribers
        WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL${lock ? ' FOR SHARE' : ''}`,
      [subscriberId, tenantId],
    )) as SubscriberRow[];
    const subscriber = rows[0];
    if (!subscriber) throw new NotFoundException('Suscriptor no encontrado.');
    return subscriber;
  }

  private async isBlocked(qr: QueryRunner, subscriber: SubscriberRow): Promise<boolean> {
    if (subscriber.anonymized_at != null || !subscriber.party_id) return false;
    if (!this.privacyMarksReadPort) {
      throw new ServiceUnavailableException({
        code: 'PRIVACY_MARKS_UNAVAILABLE',
        message: 'No se pudo verificar el estado de privacidad del titular.',
      });
    }
    const marks = await this.privacyMarksReadPort.activeMarks([subscriber.party_id], {
      manager: qr.manager,
    });
    return (marks[subscriber.party_id] ?? []).includes('DATOS_BLOQUEADOS');
  }

  private toNote(row: NoteRow): SubscriberNote {
    const { activeKey, previousKey } = loadPiiAesGcmKeyPair(this.configService);
    return {
      id: row.id,
      subscriberId: row.subscriber_id,
      body: decryptAes256Gcm(row.body_encrypted, activeKey, previousKey),
      createdBy: row.created_by,
      createdAt: toIso(row.created_at),
    };
  }

  private async resolveBlockedReadGrant(actorId: string): Promise<ReadGrant | null> {
    const permissions = new Set(
      await this.effectivePermissionsService.getEffectivePermissionsForUser(actorId),
    );
    if (permissions.has(AccessPermissionKey.PRIVACY_READ)) return 'PRIVACY_READ';
    if (permissions.has(AccessPermissionKey.CRM_BLOCKED_DATA_READ)) return 'CRM_BLOCKED_DATA_READ';
    return null;
  }
}

function toIso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}
