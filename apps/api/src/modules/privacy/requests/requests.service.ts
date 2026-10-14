import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  addColombiaBusinessDays,
  addCalendarMonths,
  AuditAction,
  AccessPermissionKey,
  CreateDataSubjectRequest,
  DocumentTypeParty,
  ListDataSubjectRequestsQuery,
  RequestKind,
  RequestLegalBasis,
  RequestRight,
  RequestStatus,
  RequestTaskKind,
  RequesterKind,
  ResponseChannel,
  IdentityVerificationMethod,
  DataSubjectRequestDetail,
  VerifyIdentityRequest,
} from '@iwana/shared';
import { TenantContext } from '@iwana/db';
import { DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { normalizeDocumentNumber } from '@iwana/shared';
import { hmacPii, resolvePiiHashKey } from '../../../common/crypto/pii-hash-key.util';
import {
  decryptAes256Gcm,
  encryptAes256Gcm,
  loadAesGcmKeyPair,
} from '../../../common/crypto/aes-gcm.util';
import { AuditService } from '../../audit/audit.service';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { MediaService } from '../../media/media.service';
import { MediaUsage } from '@iwana/db';
import { IContractImpersonationPort } from '../ports/contract-impersonation.port';
import { withPrivacyTenant, bogotaCivilDate } from '../ports/privacy-tenant-query';
import {
  calculateDesistAt,
  calculateExtendedUntil,
  calculateImpersonationComplaintDueAt,
  calculateInitialDueAt,
  calculateRequestTaskDueAt,
  civilDateAtBogotaNoon,
  isWithinBusinessDeadline,
  nextRequestStatus,
  RequestAction,
} from './requests-domain';
import { IContractStandingReadPort } from './ports/contract-standing-read.port';

type DbRow = Record<string, unknown>;
type RequestEventDto = {
  id: string;
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus;
  reason: string | null;
  occurredAt: string;
};
type RequestTaskDto = {
  id: string;
  kind: RequestTaskKind;
  dueAt: string;
  doneAt: string | null;
  doneBy: string | null;
  note: string | null;
};
type RequestPublicDto = {
  id: string;
  partyId: string | null;
  requesterKind: RequesterKind;
  kind: RequestKind;
  right: RequestRight;
  purpose: NonNullable<CreateDataSubjectRequest['purpose']> | null;
  status: RequestStatus;
  receivedAt: string;
  completeAt: string | null;
  dueAt: string;
  impersonationComplaintDueAt: string | null;
  suspendedContractIds: string[];
  extendedUntil: string | null;
  infoRequiredAt: string | null;
  desistAt: string | null;
  responseText: string | null;
  responseChannel: ResponseChannel | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  transferredTo: string | null;
  legalBasis: RequestLegalBasis | null;
};
type RequestDetailDto = DataSubjectRequestDetail;
type RequestCreateResponse = {
  request: RequestPublicDto & {
    requesterName: string;
    requesterDocumentType: DocumentTypeParty;
    requesterDocument: string;
    requesterContact: string;
    requesterEvidenceMediaId: string | null;
    identityVerificationMethod: IdentityVerificationMethod | null;
    identityVerifiedAt: string | null;
    identityVerifiedBy: string | null;
  };
  suspendedContractIds: string[];
  tasks: RequestTaskDto[];
};

const OPEN_STATUSES: RequestStatus[] = ['RADICADA', 'INCOMPLETA', 'EN_TRAMITE', 'PRORROGADA'];
const SUBSCRIBER_RETENTION_CATEGORY = 'IDENTIFICACION_DIRECCION_CONTRATO_SUSCRIPTOR';

function stringValue(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  throw new Error('La base de datos devolvió un valor inválido.');
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return stringValue(value);
}

function dateOnly(value: unknown): string {
  return stringValue(value).slice(0, 10);
}

function toTask(row: DbRow): RequestTaskDto {
  return {
    id: stringValue(row['id']),
    kind: row['kind'] as RequestTaskKind,
    dueAt: dateOnly(row['due_at']),
    doneAt: row['done_at'] ? stringValue(row['done_at']) : null,
    doneBy: nullableString(row['done_by']),
    note: nullableString(row['note']),
  };
}

function toEvent(row: DbRow): RequestEventDto {
  return {
    id: stringValue(row['id']),
    fromStatus: (row['from_status'] as RequestStatus | null) ?? null,
    toStatus: row['to_status'] as RequestStatus,
    reason: nullableString(row['reason']),
    occurredAt: stringValue(row['occurred_at']),
  };
}

function toPublicRequest(row: DbRow): RequestPublicDto {
  return {
    id: stringValue(row['id']),
    partyId: nullableString(row['party_id']),
    requesterKind: row['requester_kind'] as RequesterKind,
    kind: row['kind'] as RequestKind,
    right: row['right'] as RequestRight,
    purpose: (row['purpose'] as CreateDataSubjectRequest['purpose']) ?? null,
    status: row['status'] as RequestStatus,
    receivedAt: stringValue(row['received_at']),
    completeAt: nullableString(row['complete_at']),
    dueAt: dateOnly(row['due_at']),
    impersonationComplaintDueAt: row['impersonation_complaint_due_at']
      ? dateOnly(row['impersonation_complaint_due_at'])
      : null,
    suspendedContractIds: Array.isArray(row['suspended_contract_ids'])
      ? (row['suspended_contract_ids'] as string[])
      : [],
    extendedUntil: row['extended_until'] ? dateOnly(row['extended_until']) : null,
    infoRequiredAt: nullableString(row['info_required_at']),
    desistAt: row['desist_at'] ? dateOnly(row['desist_at']) : null,
    responseText: nullableString(row['response_text']),
    responseChannel: nullableString(row['response_channel']) as ResponseChannel | null,
    resolvedAt: nullableString(row['resolved_at']),
    resolvedBy: nullableString(row['resolved_by']),
    transferredTo: nullableString(row['transferred_to']),
    legalBasis: nullableString(row['legal_basis']) as RequestLegalBasis | null,
  };
}

@Injectable()
export class PrivacyRequestsService {
  private readonly encryptionKey: Buffer;
  private readonly previousEncryptionKey: Buffer | null;
  private readonly hashKey: Buffer;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly impersonationPort: IContractImpersonationPort,
    private readonly standingPort: IContractStandingReadPort,
    private readonly mediaService: MediaService,
    private readonly effectivePermissionsService?: EffectivePermissionsService,
  ) {
    const keys = loadAesGcmKeyPair(configService);
    this.encryptionKey = keys.activeKey;
    this.previousEncryptionKey = keys.previousKey;
    this.hashKey = resolvePiiHashKey(configService);
  }

  async create(input: CreateDataSubjectRequest, actorId: string): Promise<RequestCreateResponse> {
    const { schemaName } = TenantContext.getOrThrow();
    const requestId = randomUUID();
    const receivedAt = input.receivedAt ?? bogotaCivilDate(new Date());
    const receivedTimestamp = civilDateAtBogotaNoon(receivedAt);
    const now = new Date();
    const document = normalizeDocumentNumber(input.requesterDocumentType, input.requesterDocument);
    if (!document) throw new BadRequestException('El documento no tiene un formato válido.');

    const requesterNameEncrypted = this.encryptField(input.requesterName, 'nombre');
    const requesterDocumentEncrypted = this.encryptField(document, 'documento');
    const requesterContactEncrypted = this.encryptField(input.requesterContact, 'contacto');
    const requesterDocumentHmac = hmacPii(document, this.hashKey);
    const identityVerificationMethod = input.identityVerificationMethod ?? null;
    const identityVerified = identityVerificationMethod !== null;

    if (input.requesterEvidenceMediaId) {
      const asset = await this.mediaService.findOne(input.requesterEvidenceMediaId, schemaName);
      if (asset.usage !== MediaUsage.PRIVACY_EVIDENCE) {
        throw new BadRequestException('El archivo indicado no es una evidencia de privacidad.');
      }
    }
    if (
      input.kind === 'SUPLANTACION' &&
      (!input.partyId || !identityVerificationMethod || !input.disputedContractIds?.length)
    ) {
      throw new UnprocessableEntityException(
        'La suplantación requiere titular, verificación de identidad y contratos impugnados.',
      );
    }
    if (input.kind !== 'SUPLANTACION' && input.disputedContractIds?.length) {
      throw new UnprocessableEntityException(
        'Los contratos impugnados solo aplican a una solicitud de suplantación.',
      );
    }

    const result = await withPrivacyTenant(this.dataSource, async (manager) => {
      const dueAt = calculateInitialDueAt(input.kind, receivedAt, null);
      let suspendedContractIds: string[] = [];
      let complaintDueAt: string | null = null;
      if (input.kind === 'SUPLANTACION') {
        complaintDueAt = calculateImpersonationComplaintDueAt(receivedAt);
        const suspended = await this.impersonationPort.suspendForImpersonation(
          {
            partyId: input.partyId!,
            contractIds: input.disputedContractIds!,
            requestId,
            actorId,
          },
          { manager },
        );
        suspendedContractIds = suspended.suspendedContractIds;
      }

      const rows = (await manager.query(
        `INSERT INTO data_subject_requests
          (id, party_id, requester_document_hmac, requester_name_encrypted,
           requester_document_type, requester_document_encrypted, requester_contact_encrypted,
           requester_evidence_media_id, identity_verification_method, identity_verified_at,
           identity_verified_by, requester_kind, kind, "right", purpose, status, received_at,
           complete_at, due_at, impersonation_complaint_due_at, suspended_contract_ids,
           disputed_contract_ids)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                 'RADICADA', $16, NULL, $17, $18, $19::uuid[], $20::uuid[])
         RETURNING *`,
        [
          requestId,
          input.partyId ?? null,
          requesterDocumentHmac,
          requesterNameEncrypted,
          input.requesterDocumentType,
          requesterDocumentEncrypted,
          requesterContactEncrypted,
          input.requesterEvidenceMediaId ?? null,
          identityVerificationMethod,
          identityVerified ? now : null,
          identityVerified ? actorId : null,
          input.requesterKind,
          input.kind,
          input.right,
          input.purpose ?? null,
          receivedTimestamp,
          dueAt,
          complaintDueAt,
          suspendedContractIds,
          input.disputedContractIds ?? [],
        ],
      )) as DbRow[];
      const row = rows[0];
      if (!row) throw new Error('No se pudo crear la solicitud.');

      await manager.query(
        `INSERT INTO data_subject_request_events (request_id, from_status, to_status, actor_id, reason)
         VALUES ($1, NULL, 'RADICADA', $2, 'RADICACION')`,
        [requestId, actorId],
      );

      const tasks: RequestTaskDto[] = [];
      if (input.kind === 'SUPLANTACION') {
        await manager.query(
          `INSERT INTO party_privacy_marks (party_id, mark, event, request_id, actor_id)
           VALUES ($1, 'VICTIMA_FALSEDAD_PERSONAL', 'OPEN', $2, $3)`,
          [input.partyId, requestId, actorId],
        );

        const taskKinds: RequestTaskKind[] = [
          'SUSPENDER_COBRO_EXTERNO',
          'ENTREGAR_COPIA_DOCUMENTOS',
        ];
        for (const kind of taskKinds) {
          const taskRows = (await manager.query(
            `INSERT INTO data_subject_request_tasks (request_id, kind, due_at)
             VALUES ($1, $2, $3) RETURNING *`,
            [requestId, kind, calculateRequestTaskDueAt(kind, receivedAt, dueAt)],
          )) as DbRow[];
          const task = taskRows[0];
          if (task) tasks.push(toTask(task));
        }

        const updateRows = (await manager.query(
          `UPDATE data_subject_requests SET suspended_contract_ids = $2::uuid[]
           WHERE id = $1 RETURNING *`,
          [requestId, suspendedContractIds],
        )) as DbRow[];
        if (updateRows[0]) Object.assign(row, updateRows[0]);
      }

      return { row, suspendedContractIds, tasks };
    });

    await this.audit(AuditAction.CREATE, requestId, actorId, {
      operation: 'REQUEST_FILED',
      kind: input.kind,
      status: 'RADICADA',
    });
    return {
      request: {
        ...toPublicRequest(result.row),
        requesterName: input.requesterName,
        requesterDocumentType: input.requesterDocumentType,
        requesterDocument: document,
        requesterContact: input.requesterContact,
        requesterEvidenceMediaId: input.requesterEvidenceMediaId ?? null,
        identityVerificationMethod,
        identityVerifiedAt: identityVerified ? now.toISOString() : null,
        identityVerifiedBy: identityVerified ? actorId : null,
      },
      suspendedContractIds: result.suspendedContractIds,
      tasks: result.tasks,
    };
  }

  async list(query: ListDataSubjectRequestsQuery): Promise<{
    data: Array<RequestPublicDto & { isOverdue: boolean }>;
    meta: { nextCursor: string | null; total: number; limit: number };
  }> {
    const today = bogotaCivilDate(new Date());
    const baseClauses: string[] = [];
    const parameters: unknown[] = [];
    const addCondition = (sql: (index: number) => string, value: unknown) => {
      parameters.push(value);
      baseClauses.push(sql(parameters.length));
    };
    if (query.status) addCondition((i) => `status = $${i}`, query.status);
    if (query.kind) addCondition((i) => `kind = $${i}`, query.kind);
    if (query.dueWithinDays !== undefined) {
      const dueLimit = addColombiaBusinessDays(today, query.dueWithinDays);
      addCondition((i) => `COALESCE(extended_until, due_at) <= $${i}::date`, dueLimit);
    }

    return withPrivacyTenant(this.dataSource, async (manager) => {
      const baseWhere = baseClauses.length ? `WHERE ${baseClauses.join(' AND ')}` : '';
      const totals = (await manager.query(
        `SELECT COUNT(*)::int AS total FROM data_subject_requests ${baseWhere}`,
        parameters,
      )) as Array<{ total: number }>;
      const total = Number(totals[0]?.total ?? 0);

      const pageParameters = [...parameters];
      let cursorClause = '';
      if (query.cursor) {
        const cursorRows = (await manager.query(
          `SELECT due_at::text FROM data_subject_requests WHERE id = $1`,
          [query.cursor],
        )) as Array<{ due_at: string }>;
        const cursorRow = cursorRows[0];
        if (!cursorRow) throw new BadRequestException('El cursor de paginación no existe.');
        pageParameters.push(cursorRow.due_at, query.cursor);
        const dueIndex = pageParameters.length - 1;
        const idIndex = pageParameters.length;
        cursorClause = `${baseWhere ? ' AND' : ' WHERE'} (due_at, id) > ($${dueIndex}::date, $${idIndex}::uuid)`;
      }
      pageParameters.push(query.limit + 1);
      const limitIndex = pageParameters.length;
      const rows = (await manager.query(
        `SELECT * FROM data_subject_requests ${baseWhere}${cursorClause}
         ORDER BY due_at ASC, id ASC LIMIT $${limitIndex}`,
        pageParameters,
      )) as DbRow[];
      const hasNext = rows.length > query.limit;
      const items = hasNext ? rows.slice(0, query.limit) : rows;
      const data = items.map((row) => {
        const request = toPublicRequest(row);
        const effectiveDueAt = request.extendedUntil ?? request.dueAt;
        return {
          ...request,
          isOverdue: OPEN_STATUSES.includes(request.status) && effectiveDueAt < today,
        };
      });
      return {
        data,
        meta: {
          nextCursor: hasNext
            ? items[items.length - 1]
              ? stringValue(items[items.length - 1]!['id'])
              : null
            : null,
          total,
          limit: query.limit,
        },
      };
    });
  }

  async get(id: string, actorId: string): Promise<RequestDetailDto> {
    const permissions =
      await this.effectivePermissionsService?.getEffectivePermissionsForUser(actorId);
    const canViewRequester = permissions?.includes(AccessPermissionKey.PRIVACY_MANAGE) ?? false;
    const detail = await withPrivacyTenant(this.dataSource, async (manager) => {
      const requesterProjection = canViewRequester
        ? `, requester_name_encrypted, requester_document_type,
             requester_document_encrypted, requester_contact_encrypted`
        : '';
      const rows = (await manager.query(
        `SELECT id, party_id, requester_kind, kind, "right", purpose, status, received_at,
                complete_at, due_at, impersonation_complaint_due_at, suspended_contract_ids,
                extended_until, info_required_at, desist_at, response_text, response_channel,
                resolved_at, resolved_by, transferred_to, legal_basis,
                identity_verification_method, identity_verified_at,
                requester_evidence_media_id IS NOT NULL AS has_requester_evidence
                ${requesterProjection}
         FROM data_subject_requests WHERE id = $1`,
        [id],
      )) as DbRow[];
      const row = rows[0];
      if (!row) throw new NotFoundException('No se encontró la solicitud indicada.');
      const events = (await manager.query(
        `SELECT id::text, from_status, to_status, reason, occurred_at
         FROM data_subject_request_events WHERE request_id = $1 ORDER BY occurred_at, id`,
        [id],
      )) as DbRow[];
      const tasks = (await manager.query(
        `SELECT id::text, kind, due_at::text, done_at, done_by::text, note
         FROM data_subject_request_tasks WHERE request_id = $1 ORDER BY due_at, id`,
        [id],
      )) as DbRow[];
      const identityVerifiedAt = nullableString(row['identity_verified_at']);
      const identityStatus = identityVerifiedAt ? ('VERIFICADA' as const) : ('PENDIENTE' as const);
      const requester = canViewRequester
        ? {
            name: this.decryptField(row['requester_name_encrypted']),
            documentType: row['requester_document_type'] as DocumentTypeParty,
            document: this.decryptField(row['requester_document_encrypted']),
            contact: this.decryptField(row['requester_contact_encrypted']),
          }
        : null;
      return {
        request: {
          ...toPublicRequest(row),
          identityStatus,
          identityVerificationMethod:
            (row['identity_verification_method'] as IdentityVerificationMethod | null) ?? null,
          identityVerifiedAt,
          hasRequesterEvidence: row['has_requester_evidence'] === true,
          requester,
        },
        events: events.map(toEvent),
        tasks: tasks.map(toTask),
      };
    });
    if (detail.request.requester) {
      await this.audit(AuditAction.RECORD_ACCESS, id, actorId, {
        operation: 'REQUEST_IDENTITY_VIEWED',
        requestId: id,
      });
    }
    return detail;
  }

  async getRequesterEvidence(
    requestId: string,
    actorId: string,
  ): Promise<{ url: string; expiresAt: string }> {
    const { schemaName } = TenantContext.getOrThrow();
    const evidenceMediaId = await withPrivacyTenant(this.dataSource, async (manager) => {
      const rows = (await manager.query(
        `SELECT requester_evidence_media_id FROM data_subject_requests WHERE id = $1`,
        [requestId],
      )) as DbRow[];
      const row = rows[0];
      if (!row) throw new NotFoundException('No se encontró la solicitud indicada.');
      const mediaId = nullableString(row['requester_evidence_media_id']);
      if (!mediaId) {
        throw new NotFoundException({
          code: 'PRIVACY_REQUEST_EVIDENCE_NOT_FOUND',
          message: 'La solicitud no tiene evidencia del solicitante.',
        });
      }
      return mediaId;
    });

    let evidence: { signedUrl: string; expiresAt: Date };
    try {
      evidence = await this.mediaService.getPrivacyEvidenceSignedUrl(evidenceMediaId, schemaName);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException({
          code: 'PRIVACY_REQUEST_EVIDENCE_NOT_FOUND',
          message: 'No se encontró la evidencia del solicitante.',
        });
      }
      throw error;
    }
    await this.audit(AuditAction.RECORD_ACCESS, requestId, actorId, {
      operation: 'REQUEST_EVIDENCE_VIEWED',
      requestId,
    });
    return { url: evidence.signedUrl, expiresAt: evidence.expiresAt.toISOString() };
  }

  async verifyIdentity(
    requestId: string,
    input: VerifyIdentityRequest,
    actorId: string,
  ): Promise<RequestDetailDto> {
    const { schemaName } = TenantContext.getOrThrow();
    if (
      input.identityVerificationMethod !== 'DOCUMENTO_PRESENCIAL' &&
      !input.requesterEvidenceMediaId
    ) {
      throw new BadRequestException('Este método requiere adjuntar la evidencia de identidad.');
    }
    if (input.requesterEvidenceMediaId) {
      const asset = await this.mediaService.findOne(input.requesterEvidenceMediaId, schemaName);
      if (asset.usage !== MediaUsage.PRIVACY_EVIDENCE) {
        throw new BadRequestException('El archivo indicado no es una evidencia de privacidad.');
      }
    }

    await withPrivacyTenant(this.dataSource, async (manager) => {
      const rows = (await manager.query(
        `SELECT status, requester_kind, identity_verified_at
         FROM data_subject_requests WHERE id = $1 FOR UPDATE`,
        [requestId],
      )) as DbRow[];
      const current = rows[0];
      if (!current) throw new NotFoundException('No se encontró la solicitud indicada.');
      if (current['identity_verified_at']) {
        throw new ConflictException({
          code: 'PRIVACY_REQUEST_IDENTITY_ALREADY_VERIFIED',
          message: 'La identidad de esta solicitud ya fue verificada.',
        });
      }
      if (!['RADICADA', 'INCOMPLETA'].includes(String(current['status']))) {
        throw new ConflictException({
          code: 'PRIVACY_REQUEST_INVALID_TRANSITION',
          message: 'No se puede verificar la identidad en el estado actual.',
        });
      }
      this.assertIdentityMethodForRequester(
        input.identityVerificationMethod,
        current['requester_kind'] as RequesterKind,
      );
      const verifiedAt = new Date();
      await manager.query(
        `UPDATE data_subject_requests
         SET requester_evidence_media_id = COALESCE($2, requester_evidence_media_id),
             identity_verification_method = $3,
             identity_verified_at = $4,
             identity_verified_by = $5
         WHERE id = $1`,
        [
          requestId,
          input.requesterEvidenceMediaId ?? null,
          input.identityVerificationMethod,
          verifiedAt,
          actorId,
        ],
      );
      await manager.query(
        `INSERT INTO data_subject_request_events (request_id, from_status, to_status, actor_id, reason)
         VALUES ($1, $2, $2, $3, 'IDENTIDAD_VERIFICADA')`,
        [requestId, current['status'], actorId],
      );
    });
    await this.audit(AuditAction.UPDATE, requestId, actorId, {
      operation: 'REQUEST_IDENTITY_VERIFIED',
      requestId,
    });
    return this.get(requestId, actorId);
  }

  async markDesisted(today: string, manager: EntityManager): Promise<{ count: number }> {
    const rows = (await manager.query(
      `WITH desisted AS (
         UPDATE data_subject_requests
         SET status = 'DESISTIDA'
         WHERE status = 'INCOMPLETA' AND desist_at <= $1::date
         RETURNING id
       ), logged AS (
         INSERT INTO data_subject_request_events (request_id, from_status, to_status, actor_id, reason)
         SELECT id, 'INCOMPLETA', 'DESISTIDA', NULL, 'DESISTIMIENTO_AUTOMATICO'
         FROM desisted
         RETURNING request_id
       )
       SELECT request_id::text AS id FROM logged`,
      [today],
    )) as Array<{ id: string }>;
    for (const row of rows) {
      await this.audit(AuditAction.UPDATE, row.id, null, {
        operation: 'REQUEST_AUTO_DESISTED',
        requestId: row.id,
      });
    }
    return { count: rows.length };
  }

  async transition(
    id: string,
    action: RequestAction,
    body: Record<string, unknown>,
    actorId: string,
  ): Promise<RequestDetailDto> {
    const result = await withPrivacyTenant(this.dataSource, async (manager) => {
      const rows = (await manager.query(
        'SELECT * FROM data_subject_requests WHERE id = $1 FOR UPDATE',
        [id],
      )) as DbRow[];
      const current = rows[0];
      if (!current) throw new NotFoundException('No se encontró la solicitud indicada.');
      const currentStatus = current['status'] as RequestStatus;
      const nextStatus = nextRequestStatus(currentStatus, action);
      const kind = current['kind'] as RequestKind;
      const right = current['right'] as RequestRight;
      const partyId = nullableString(current['party_id']);
      const today = bogotaCivilDate(new Date());
      const receivedAt = bogotaCivilDate(new Date(stringValue(current['received_at'])));
      const now = new Date();
      let reasonCode = action.toUpperCase().replace('-', '_');

      if (action === 'require-info') {
        if (!isWithinBusinessDeadline(today, receivedAt, 5)) {
          throw new ConflictException(
            'El requerimiento de información excede los cinco días hábiles.',
          );
        }
        const missingItems = String(body['missingItems']);
        await manager.query(
          `UPDATE data_subject_requests
           SET status = $2, info_required_at = $3, desist_at = $4::date,
               response_text = $5, response_channel = $6
           WHERE id = $1`,
          [id, nextStatus, now, calculateDesistAt(today), missingItems, body['channel']],
        );
      } else if (action === 'complete') {
        if (!current['identity_verified_at'] || !current['identity_verified_by']) {
          throw new UnprocessableEntityException(
            'Verifica la identidad del solicitante antes de completar.',
          );
        }
        const completedAt = String(body['completedAt'] ?? today);
        if (completedAt < receivedAt || completedAt > today) {
          throw new ConflictException(
            'La fecha de completitud debe estar entre la radicación y hoy.',
          );
        }
        const newDueAt = calculateInitialDueAt(kind, receivedAt, completedAt);
        await manager.query(
          `UPDATE data_subject_requests
           SET status = $2, complete_at = $3, due_at = $4::date,
               info_required_at = NULL, desist_at = NULL
           WHERE id = $1`,
          [id, nextStatus, civilDateAtBogotaNoon(completedAt), newDueAt],
        );
        if (kind === 'RECLAMO' && partyId) {
          await manager.query(
            `INSERT INTO party_privacy_marks (party_id, mark, event, request_id, actor_id)
             VALUES ($1, 'RECLAMO_EN_TRAMITE', 'OPEN', $2, $3)`,
            [partyId, id, actorId],
          );
        }
      } else if (action === 'extend') {
        if (kind === 'SUPLANTACION') {
          throw new ConflictException('La solicitud de suplantación no admite prórroga.');
        }
        if (current['extended_until']) {
          throw new ConflictException('La solicitud ya tiene una prórroga registrada.');
        }
        const extendedUntil = calculateExtendedUntil(kind, dateOnly(current['due_at']));
        await manager.query(
          `UPDATE data_subject_requests SET status = $2, extended_until = $3::date,
             response_text = $4 WHERE id = $1`,
          [id, nextStatus, extendedUntil, body['reason']],
        );
      } else if (action === 'resolve') {
        const requiresConservationCheck =
          right === 'SUPRIMIR' ||
          (right === 'REVOCAR' && current['purpose'] === 'TRATAMIENTO_CONTRACTUAL');
        if (requiresConservationCheck) {
          if (!partyId) {
            throw new ConflictException(
              'No se puede verificar el deber de conservación sin identificar al titular.',
            );
          }
          if (await this.hasConservationDuty(manager, partyId)) {
            throw new ConflictException(
              'La solicitud requiere una decisión de no procedencia por deber de conservación.',
            );
          }
        }
        const dataChangeReference = body['dataChangeReference'];
        const responseText =
          typeof dataChangeReference === 'string' && dataChangeReference.length > 0
            ? `${String(body['responseText'])}\n\nReferencia de cambio: ${dataChangeReference}`
            : body['responseText'];
        await manager.query(
          `UPDATE data_subject_requests SET status = $2, response_text = $3,
           response_channel = $4, resolved_at = $5, resolved_by = $6 WHERE id = $1`,
          [id, nextStatus, responseText, body['responseChannel'], now, actorId],
        );
        if (right === 'REVOCAR' && partyId && current['purpose']) {
          await manager.query(
            `INSERT INTO data_authorizations
              (party_id, purpose, kind, granted, channel, evidence_media_id, legal_text_id,
               ip, user_agent, captured_by, captured_at, source_ref)
             VALUES ($1, $2, 'REVOCATION', false, $3, NULL, NULL, NULL, NULL, $4, $5, $6)
             ON CONFLICT (source_ref) WHERE source_ref IS NOT NULL DO NOTHING`,
            [
              partyId,
              current['purpose'],
              body['responseChannel'],
              actorId,
              now,
              `privacy-request:${id}:REVOCATION`,
            ],
          );
        }
        if (kind === 'RECLAMO' && partyId) {
          await this.appendMark(manager, partyId, 'RECLAMO_EN_TRAMITE', 'CLOSE', id, actorId);
        }
      } else if (action === 'reject') {
        const basis = body['legalBasis'] as RequestLegalBasis;
        if (!current['identity_verified_at'] && basis !== 'SOLICITANTE_NO_LEGITIMADO') {
          throw new UnprocessableEntityException({
            code: 'PRIVACY_REQUEST_IDENTITY_REQUIRED',
            message:
              'Verifica la identidad del solicitante antes de declarar la solicitud no procedente.',
          });
        }
        const requiresConservationCheck =
          Boolean(current['identity_verified_at']) &&
          (right === 'SUPRIMIR' ||
            (right === 'REVOCAR' && current['purpose'] === 'TRATAMIENTO_CONTRACTUAL'));
        const duty = requiresConservationCheck
          ? await this.conservationDuty(manager, partyId)
          : { applies: false, openContract: false, retention: false };

        if (requiresConservationCheck && !partyId) {
          throw new ConflictException(
            'No se puede verificar el deber de conservación sin identificar al titular.',
          );
        }
        if (duty.applies) {
          const requiredBasis: RequestLegalBasis = duty.openContract
            ? 'DEBER_CONTRACTUAL'
            : 'DEBER_LEGAL_CONSERVACION';
          if (basis !== requiredBasis) {
            throw new ConflictException(
              'El fundamento debe corresponder al deber de conservación vigente.',
            );
          }
        } else if (basis === 'DEBER_CONTRACTUAL' || basis === 'DEBER_LEGAL_CONSERVACION') {
          throw new ConflictException(
            'No se encontró un deber vigente que sustente esta decisión.',
          );
        }

        if (basis === 'DEBER_CONTRACTUAL' || basis === 'DEBER_LEGAL_CONSERVACION') {
          if (right === 'REVOCAR' && current['purpose'] !== 'TRATAMIENTO_CONTRACTUAL') {
            throw new ConflictException(
              'Esta finalidad no se puede rechazar por deber contractual.',
            );
          }
          if (right !== 'REVOCAR' && right !== 'SUPRIMIR') {
            throw new ConflictException(
              'El fundamento de conservación solo aplica a revocación o supresión.',
            );
          }
          if (right === 'SUPRIMIR') {
            if (!partyId)
              throw new ConflictException('No se puede abrir la marca sin identificar al titular.');
            await this.appendMark(manager, partyId, 'DATOS_BLOQUEADOS', 'OPEN', id, actorId);
          }
        } else if (right === 'REVOCAR' && current['purpose'] === 'CONTACTO_COMERCIAL') {
          // Esta finalidad siempre procede; solo se rechaza por una causa distinta de conservación.
        }
        await manager.query(
          `UPDATE data_subject_requests SET status = $2, response_text = $3,
           response_channel = $4, legal_basis = $5, resolved_at = $6, resolved_by = $7
           WHERE id = $1`,
          [id, nextStatus, body['responseText'], body['responseChannel'], basis, now, actorId],
        );
        if (kind === 'RECLAMO' && partyId) {
          await this.appendMark(manager, partyId, 'RECLAMO_EN_TRAMITE', 'CLOSE', id, actorId);
        }
      } else if (action === 'transfer') {
        reasonCode = String(body['reason']);
        await manager.query(
          `UPDATE data_subject_requests
           SET status = $2, transferred_to = $3, response_channel = $4
           WHERE id = $1`,
          [id, nextStatus, body['transferredTo'], body['channel']],
        );
      }

      await manager.query(
        `INSERT INTO data_subject_request_events (request_id, from_status, to_status, actor_id, reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, currentStatus, nextStatus, actorId, reasonCode],
      );
      return { status: nextStatus, kind };
    });

    await this.audit(AuditAction.UPDATE, id, actorId, {
      operation: 'REQUEST_TRANSITION',
      action,
      toStatus: result.status,
    });
    return this.get(id, actorId);
  }

  async completeTask(
    requestId: string,
    taskId: string,
    note: string,
    actorId: string,
  ): Promise<RequestTaskDto> {
    const result = await withPrivacyTenant(this.dataSource, async (manager) => {
      const rows = (await manager.query(
        `SELECT task.*, request.status FROM data_subject_request_tasks task
         INNER JOIN data_subject_requests request ON request.id = task.request_id
         WHERE task.id = $1 AND task.request_id = $2 FOR UPDATE OF task`,
        [taskId, requestId],
      )) as DbRow[];
      const task = rows[0];
      if (!task) throw new NotFoundException('No se encontró la tarea indicada.');
      if (task['done_at']) throw new ConflictException('La tarea ya fue completada.');
      const now = new Date();
      const updated = (await manager.query(
        `UPDATE data_subject_request_tasks SET done_at = $2, done_by = $3, note = $4
         WHERE id = $1 AND done_at IS NULL RETURNING id`,
        [taskId, now, actorId, note],
      )) as DbRow[];
      if (!updated[0]) throw new ConflictException('La tarea ya fue completada.');
      await manager.query(
        `INSERT INTO data_subject_request_events (request_id, from_status, to_status, actor_id, reason)
         VALUES ($1, $2, $2, $3, $4)`,
        [requestId, task['status'], actorId, `TAREA_COMPLETADA:${task['kind']}`],
      );
      return toTask({ ...task, done_at: now, done_by: actorId, note });
    });
    await this.audit(AuditAction.UPDATE, taskId, actorId, {
      operation: 'REQUEST_TASK_COMPLETED',
      requestId,
    });
    return result;
  }

  private async conservationDuty(
    manager: EntityManager,
    partyId: string | null,
  ): Promise<{ applies: boolean; openContract: boolean; retention: boolean }> {
    if (!partyId) return { applies: false, openContract: false, retention: false };
    const standing = await this.standingPort.standing(partyId);
    const openContract = standing.openContractIds.length > 0;
    if (!standing.lastTerminatedAt)
      return { applies: openContract, openContract, retention: false };

    const policies = (await manager.query(
      'SELECT years FROM retention_policies WHERE category = $1',
      [SUBSCRIBER_RETENTION_CATEGORY],
    )) as Array<{ years: number }>;
    const years = Number(policies[0]?.years ?? 0);
    const retentionUntil = addCalendarMonths(standing.lastTerminatedAt.slice(0, 10), years * 12);
    const retention = retentionUntil > bogotaCivilDate(new Date());
    return { applies: openContract || retention, openContract, retention };
  }

  private async hasConservationDuty(manager: EntityManager, partyId: string): Promise<boolean> {
    return (await this.conservationDuty(manager, partyId)).applies;
  }

  private assertIdentityMethodForRequester(
    method: IdentityVerificationMethod,
    requesterKind: RequesterKind,
  ): void {
    if (
      (requesterKind === 'REPRESENTANTE' || requesterKind === 'APODERADO') &&
      method !== 'PODER_O_REPRESENTACION'
    ) {
      throw new BadRequestException('La representación requiere validar el poder correspondiente.');
    }
    if (requesterKind === 'CAUSAHABIENTE' && method !== 'DECLARACION_CAUSAHABIENTE') {
      throw new BadRequestException('El causahabiente requiere validar su declaración.');
    }
  }

  private appendMark(
    manager: EntityManager,
    partyId: string,
    mark: 'RECLAMO_EN_TRAMITE' | 'DATOS_BLOQUEADOS',
    event: 'OPEN' | 'CLOSE',
    requestId: string,
    actorId: string,
  ): Promise<unknown> {
    return manager.query(
      `INSERT INTO party_privacy_marks (party_id, mark, event, request_id, actor_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [partyId, mark, event, requestId, actorId],
    );
  }

  private encryptField(value: string, label: string): string {
    if (Buffer.byteLength(value, 'utf8') > 221) {
      throw new BadRequestException(`El campo ${label} excede el máximo que admite el cifrado.`);
    }
    const encrypted = encryptAes256Gcm(value, this.encryptionKey);
    if (encrypted.length > 500) {
      throw new BadRequestException(`El campo ${label} excede el tamaño permitido.`);
    }
    return encrypted;
  }

  private decryptField(value: unknown): string {
    if (typeof value !== 'string') {
      throw new Error('La base de datos devolvió un campo cifrado inválido.');
    }
    return decryptAes256Gcm(value, this.encryptionKey, this.previousEncryptionKey);
  }

  private async audit(
    action: AuditAction,
    entityId: string,
    actorId: string | null,
    safeValue: Record<string, unknown>,
  ): Promise<void> {
    await this.auditService.log({
      action,
      entityType: 'DataSubjectRequest',
      entityId,
      userId: actorId,
      newValue: safeValue,
    });
  }
}
