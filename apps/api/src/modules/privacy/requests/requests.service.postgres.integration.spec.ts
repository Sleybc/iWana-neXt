import { randomBytes, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { MediaUsage, resolveMigrationDbCredentials, TenantContext } from '@iwana/db';
import { DataSource } from 'typeorm';
import { AccessPermissionKey, DocumentTypeParty } from '@iwana/shared';
import { AuditService } from '../../audit/audit.service';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { MediaService } from '../../media/media.service';
import { IContractImpersonationPort } from '../ports/contract-impersonation.port';
import { PrivacyRequestsService } from './requests.service';
import { IContractStandingReadPort } from './ports/contract-standing-read.port';
import { PrivacyRequestsReadAdapter } from './ports/privacy-requests-read.adapter';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const allowedDatabaseName = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;
const schemaName = `tenant_privacy_requests_${randomBytes(5).toString('hex')}`;
const actorId = '60000000-0000-4000-8000-000000000001';
const partyId = '60000000-0000-4000-8000-000000000002';
const suspendedContractId = '60000000-0000-4000-8000-000000000003';
const keyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

if (dbAvailable && !allowedDatabaseName.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración privacy requests: DB_NAME debe ser dbiw, test o iwana_it_*; solo se crea y elimina un schema efímero.',
  );
}

function todayInBogota(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

describeWithDb('Privacy requests — reglas R3/R4/R5 en PostgreSQL real', () => {
  let dataSource: DataSource;
  let service: PrivacyRequestsService;
  const standingPort: jest.Mocked<IContractStandingReadPort> = {
    standing: jest.fn(),
  };
  const impersonationPort: jest.Mocked<IContractImpersonationPort> = {
    suspendForImpersonation: jest.fn(),
  };
  const auditService = { log: jest.fn().mockResolvedValue(undefined) };
  const effectivePermissionsService = { getEffectivePermissionsForUser: jest.fn() };
  const mediaService = { findOne: jest.fn(), getPrivacyEvidenceSignedUrl: jest.fn() };
  const configService = {
    getOrThrow: (key: string) => {
      if (key === 'MFA_ENCRYPTION_KEY' || key === 'PII_HASH_KEY') return keyHex;
      throw new Error('Clave de prueba no configurada.');
    },
    get: () => undefined,
  };

  const inTenant = <T>(operation: () => Promise<T>): Promise<T> =>
    TenantContext.run(
      { tenantId: randomUUID(), schemaName, tenantSlug: 'privacy-test' },
      operation,
    );

  async function createRequest(input: {
    kind?: 'CONSULTA' | 'RECLAMO' | 'SUPLANTACION';
    right: 'CONOCER' | 'ACTUALIZAR' | 'SUPRIMIR' | 'REVOCAR';
    purpose?: 'TRATAMIENTO_CONTRACTUAL' | 'CONTACTO_COMERCIAL';
    receivedAt?: string;
    unverified?: boolean;
    requesterEvidenceMediaId?: string;
    identityVerificationMethod?:
      | 'DOCUMENTO_PRESENCIAL'
      | 'COPIA_DOCUMENTO'
      | 'PODER_O_REPRESENTACION'
      | 'DECLARACION_CAUSAHABIENTE';
    disputedContractIds?: string[];
  }) {
    const identityVerificationMethod =
      input.identityVerificationMethod ?? (input.unverified ? undefined : 'DOCUMENTO_PRESENCIAL');
    return inTenant(() =>
      service.create(
        {
          kind: input.kind ?? 'RECLAMO',
          right: input.right,
          ...(input.purpose ? { purpose: input.purpose } : {}),
          requesterKind: 'TITULAR',
          requesterName: 'Titular ficticio de integración',
          requesterDocumentType: DocumentTypeParty.CC,
          requesterDocument: '1234567',
          requesterContact: 'titular@example.invalid',
          ...(identityVerificationMethod ? { identityVerificationMethod } : {}),
          ...(input.requesterEvidenceMediaId
            ? { requesterEvidenceMediaId: input.requesterEvidenceMediaId }
            : {}),
          ...(input.disputedContractIds ? { disputedContractIds: input.disputedContractIds } : {}),
          partyId,
          receivedAt: input.receivedAt ?? todayInBogota(),
        },
        actorId,
      ),
    );
  }

  beforeAll(async () => {
    const databaseName = process.env['DB_NAME'] ?? 'dbiw';
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? '127.0.0.1',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5433', 10),
      username: credentials.username,
      password: credentials.password,
      database: databaseName,
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 3, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
    await dataSource.query(`CREATE SCHEMA "${schemaName}"`);
    await dataSource.query(`CREATE TABLE "${schemaName}".party (id uuid PRIMARY KEY)`);
    await dataSource.query(`INSERT INTO "${schemaName}".party (id) VALUES ($1)`, [partyId]);
    await dataSource.query(`
      CREATE TABLE "${schemaName}".data_subject_requests (
        id uuid PRIMARY KEY,
        party_id uuid,
        requester_document_hmac text,
        requester_name_encrypted varchar(500),
        requester_document_type varchar(20),
        requester_document_encrypted varchar(500),
        requester_contact_encrypted varchar(500),
        requester_evidence_media_id uuid,
        identity_verification_method varchar(30),
        identity_verified_at timestamptz,
        identity_verified_by uuid,
        requester_kind text NOT NULL,
        kind text NOT NULL,
        "right" text NOT NULL,
        purpose text,
        status text NOT NULL,
        received_at timestamptz NOT NULL,
        complete_at timestamptz,
        due_at date NOT NULL,
        impersonation_complaint_due_at date,
        suspended_contract_ids uuid[] NOT NULL DEFAULT '{}',
        extended_until date,
        info_required_at timestamptz,
        desist_at date,
        response_text text,
        response_channel text,
        resolved_at timestamptz,
        resolved_by uuid,
        transferred_to varchar(200),
        disputed_contract_ids uuid[] NOT NULL DEFAULT '{}',
        legal_basis text,
        CONSTRAINT ck_data_subject_requests_verified_before_processing
          CHECK (status NOT IN ('EN_TRAMITE', 'PRORROGADA', 'RESUELTA') OR identity_verified_at IS NOT NULL),
        CONSTRAINT ck_data_subject_requests_unverified_not_procedent_basis
          CHECK (status <> 'NO_PROCEDENTE' OR identity_verified_at IS NOT NULL OR legal_basis = 'SOLICITANTE_NO_LEGITIMADO')
      )
    `);
    await dataSource.query(`
      CREATE TABLE "${schemaName}".data_subject_request_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id uuid NOT NULL REFERENCES "${schemaName}".data_subject_requests(id),
        from_status text,
        to_status text NOT NULL,
        actor_id uuid,
        reason text,
        occurred_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await dataSource.query(`
      CREATE TABLE "${schemaName}".data_subject_request_tasks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id uuid NOT NULL REFERENCES "${schemaName}".data_subject_requests(id),
        kind varchar(40) NOT NULL,
        due_at date NOT NULL,
        done_at timestamptz,
        done_by uuid,
        note text
      )
    `);
    await dataSource.query(`
      CREATE TABLE "${schemaName}".party_privacy_marks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        party_id uuid NOT NULL REFERENCES "${schemaName}".party(id),
        mark text NOT NULL,
        event text NOT NULL,
        request_id uuid REFERENCES "${schemaName}".data_subject_requests(id),
        occurred_at timestamptz NOT NULL DEFAULT now(),
        actor_id uuid
      )
    `);
    await dataSource.query(`
      CREATE TABLE "${schemaName}".retention_policies (
        category text PRIMARY KEY,
        years integer NOT NULL
      )
    `);
    await dataSource.query(
      `INSERT INTO "${schemaName}".retention_policies (category, years)
       VALUES ('IDENTIFICACION_DIRECCION_CONTRATO_SUSCRIPTOR', 5)`,
    );
    await dataSource.query(`
      CREATE TABLE "${schemaName}".data_authorizations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        party_id uuid NOT NULL REFERENCES "${schemaName}".party(id),
        purpose text NOT NULL,
        kind text NOT NULL,
        granted boolean NOT NULL,
        channel text NOT NULL,
        evidence_media_id uuid,
        legal_text_id uuid,
        ip inet,
        user_agent text,
        captured_by uuid,
        captured_at timestamptz NOT NULL DEFAULT now(),
        source_ref text
      )
    `);
    await dataSource.query(
      `CREATE UNIQUE INDEX ON "${schemaName}".data_authorizations (source_ref) WHERE source_ref IS NOT NULL`,
    );

    service = new PrivacyRequestsService(
      dataSource,
      configService as unknown as ConfigService,
      auditService as unknown as AuditService,
      impersonationPort,
      standingPort,
      mediaService as unknown as MediaService,
      effectivePermissionsService as unknown as EffectivePermissionsService,
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      try {
        await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      } finally {
        await dataSource.destroy();
      }
    }
  });

  beforeEach(() => {
    auditService.log.mockClear();
    impersonationPort.suspendForImpersonation.mockReset();
    impersonationPort.suspendForImpersonation.mockResolvedValue({
      suspendedContractIds: [suspendedContractId],
    });
    standingPort.standing.mockReset();
    standingPort.standing.mockResolvedValue({ openContractIds: [], lastTerminatedAt: null });
    mediaService.findOne.mockReset();
    mediaService.getPrivacyEvidenceSignedUrl.mockReset();
    effectivePermissionsService.getEffectivePermissionsForUser.mockReset();
    effectivePermissionsService.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.PRIVACY_READ,
    ]);
  });

  it('devuelve identidad pendiente sin evidencia y omite actores en el detalle', async () => {
    const filed = await createRequest({ right: 'CONOCER', unverified: true });

    const detail = await inTenant(() => service.get(filed.request.id, actorId));

    expect(detail.request).toMatchObject({
      identityStatus: 'PENDIENTE',
      identityVerificationMethod: null,
      identityVerifiedAt: null,
      hasRequesterEvidence: false,
      requester: null,
    });
    expect(detail.events[0]).not.toHaveProperty('actorId');
    expect(detail.request).not.toHaveProperty('requesterEvidenceMediaId');
    expect(auditService.log).not.toHaveBeenCalledWith(
      expect.objectContaining({
        newValue: expect.objectContaining({ operation: 'REQUEST_IDENTITY_VIEWED' }),
      }),
    );
  });

  it('devuelve solicitante descifrado con manage y evidencia sin exponer su mediaId ni actor', async () => {
    const evidenceId = '60000000-0000-4000-8000-000000000009';
    mediaService.findOne.mockResolvedValue({ usage: MediaUsage.PRIVACY_EVIDENCE });
    effectivePermissionsService.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.PRIVACY_READ,
      AccessPermissionKey.PRIVACY_MANAGE,
    ]);
    const filed = await createRequest({
      right: 'CONOCER',
      requesterEvidenceMediaId: evidenceId,
      identityVerificationMethod: 'COPIA_DOCUMENTO',
    });

    auditService.log.mockClear();
    const detail = await inTenant(() => service.get(filed.request.id, actorId));

    expect(detail.request).toMatchObject({
      identityStatus: 'VERIFICADA',
      identityVerificationMethod: 'COPIA_DOCUMENTO',
      hasRequesterEvidence: true,
      requester: {
        name: 'Titular ficticio de integración',
        documentType: DocumentTypeParty.CC,
        document: '1234567',
        contact: 'titular@example.invalid',
      },
    });
    expect(detail.request).not.toHaveProperty('requesterEvidenceMediaId');
    expect(detail.request).not.toHaveProperty('mediaId');
    expect(detail.request).not.toHaveProperty('identityVerifiedBy');
    expect(detail.events[0]).not.toHaveProperty('actorId');
    expect(JSON.stringify(detail)).not.toContain(evidenceId);
    expect(auditService.log).toHaveBeenCalledWith({
      action: 'RECORD_ACCESS',
      entityType: 'DataSubjectRequest',
      entityId: filed.request.id,
      userId: actorId,
      newValue: {
        operation: 'REQUEST_IDENTITY_VIEWED',
        requestId: filed.request.id,
      },
    });
    const auditText = JSON.stringify(auditService.log.mock.calls[0]?.[0]);
    expect(auditText).not.toContain('Titular ficticio de integración');
    expect(auditText).not.toContain('1234567');
    expect(auditText).not.toContain('titular@example.invalid');
  });

  it('radica suplantación, guarda plazos y tareas, invoca el puerto y completa las tareas una vez', async () => {
    const receivedAt = todayInBogota();
    const response = await createRequest({
      kind: 'SUPLANTACION',
      right: 'CONOCER',
      receivedAt,
      disputedContractIds: [suspendedContractId],
    });

    expect(response.suspendedContractIds).toEqual([suspendedContractId]);
    expect(response.request.impersonationComplaintDueAt).toBeDefined();
    expect(response.tasks.map((task) => task.kind).sort()).toEqual(
      ['ENTREGAR_COPIA_DOCUMENTOS', 'SUSPENDER_COBRO_EXTERNO'].sort(),
    );
    expect(response.tasks.find((task) => task.kind === 'SUSPENDER_COBRO_EXTERNO')?.dueAt).toBe(
      receivedAt,
    );
    expect(response.tasks.find((task) => task.kind === 'ENTREGAR_COPIA_DOCUMENTOS')?.dueAt).toBe(
      response.request.dueAt,
    );
    const [impersonationInput, impersonationContext] =
      impersonationPort.suspendForImpersonation.mock.calls[0] ?? [];
    expect(impersonationInput).toEqual({
      partyId,
      contractIds: [suspendedContractId],
      requestId: response.request.id,
      actorId,
    });
    expect(impersonationContext?.manager).toBeDefined();

    const task = response.tasks[0]!;
    const completed = await inTenant(() =>
      service.completeTask(response.request.id, task.id, 'Tarea ejecutada', actorId),
    );
    expect(completed.doneAt).not.toBeNull();
    await expect(
      inTenant(() => service.completeTask(response.request.id, task.id, 'Reapertura', actorId)),
    ).rejects.toBeInstanceOf(ConflictException);

    const rows = (await dataSource.query(
      `SELECT impersonation_complaint_due_at::text, suspended_contract_ids::text
       FROM "${schemaName}".data_subject_requests WHERE id = $1`,
      [response.request.id],
    )) as Array<{ impersonation_complaint_due_at: string; suspended_contract_ids: string }>;
    expect(rows[0]?.impersonation_complaint_due_at).toBe(
      response.request.impersonationComplaintDueAt,
    );
    expect(rows[0]?.suspended_contract_ids).toContain(suspendedContractId);
  });

  it('R3: impide resolver revocación contractual con contrato abierto y exige fundamento contractual', async () => {
    standingPort.standing.mockResolvedValue({
      openContractIds: [suspendedContractId],
      lastTerminatedAt: null,
    });
    const request = await createRequest({ right: 'REVOCAR', purpose: 'TRATAMIENTO_CONTRACTUAL' });
    await inTenant(() => service.transition(request.request.id, 'complete', {}, actorId));

    await expect(
      inTenant(() =>
        service.transition(
          request.request.id,
          'resolve',
          {
            responseText: 'No procede retirar la finalidad contractual.',
            responseChannel: 'EMAIL',
          },
          actorId,
        ),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      inTenant(() =>
        service.transition(
          request.request.id,
          'reject',
          {
            responseText: 'Otra justificación.',
            responseChannel: 'EMAIL',
            legalBasis: 'OTRO',
          },
          actorId,
        ),
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    const rejected = await inTenant(() =>
      service.transition(
        request.request.id,
        'reject',
        {
          responseText: 'Existe un contrato vigente.',
          responseChannel: 'EMAIL',
          legalBasis: 'DEBER_CONTRACTUAL',
        },
        actorId,
      ),
    );
    expect(rejected.request.status).toBe('NO_PROCEDENTE');
    expect(rejected.request.legalBasis).toBe('DEBER_CONTRACTUAL');
  });

  it('R3/R4: la retención impide resolver y el rechazo de supresión abre DATOS_BLOQUEADOS', async () => {
    standingPort.standing.mockResolvedValue({
      openContractIds: [],
      lastTerminatedAt: '2025-01-15T00:00:00.000Z',
    });
    const request = await createRequest({ right: 'SUPRIMIR' });
    await inTenant(() => service.transition(request.request.id, 'complete', {}, actorId));

    await expect(
      inTenant(() =>
        service.transition(
          request.request.id,
          'resolve',
          { responseText: 'Se mantiene el dato por retención.', responseChannel: 'EMAIL' },
          actorId,
        ),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    const rejected = await inTenant(() =>
      service.transition(
        request.request.id,
        'reject',
        {
          responseText: 'La retención legal sigue vigente.',
          responseChannel: 'EMAIL',
          legalBasis: 'DEBER_LEGAL_CONSERVACION',
        },
        actorId,
      ),
    );
    expect(rejected.request.status).toBe('NO_PROCEDENTE');
    const marks = (await dataSource.query(
      `SELECT mark, event FROM "${schemaName}".party_privacy_marks WHERE request_id = $1`,
      [request.request.id],
    )) as Array<{ mark: string; event: string }>;
    expect(marks).toContainEqual({ mark: 'DATOS_BLOQUEADOS', event: 'OPEN' });
    expect(marks).toContainEqual({ mark: 'RECLAMO_EN_TRAMITE', event: 'OPEN' });
    expect(marks).toContainEqual({ mark: 'RECLAMO_EN_TRAMITE', event: 'CLOSE' });
  });

  it('ejecuta require-info, complete, extend y resolve con referencia de cambio y cierre de marca', async () => {
    const receivedAt = todayInBogota();
    const request = await createRequest({ right: 'ACTUALIZAR', receivedAt });
    const incomplete = await inTenant(() =>
      service.transition(
        request.request.id,
        'require-info',
        { missingItems: 'Falta un soporte', channel: 'EMAIL' },
        actorId,
      ),
    );
    expect(incomplete.request.status).toBe('INCOMPLETA');
    expect(incomplete.request.desistAt).toBeDefined();

    const inProgress = await inTenant(() =>
      service.transition(request.request.id, 'complete', { completedAt: receivedAt }, actorId),
    );
    expect(inProgress.request.status).toBe('EN_TRAMITE');
    const extended = await inTenant(() =>
      service.transition(
        request.request.id,
        'extend',
        { reason: 'Complejidad de validación documental.' },
        actorId,
      ),
    );
    expect(extended.request.status).toBe('PRORROGADA');
    const resolved = await inTenant(() =>
      service.transition(
        request.request.id,
        'resolve',
        {
          responseText: 'Se actualizó el dato indicado.',
          responseChannel: 'EMAIL',
          dataChangeReference: 'CRM-PRIV-123',
        },
        actorId,
      ),
    );
    expect(resolved.request.status).toBe('RESUELTA');
    expect(resolved.request.responseText).toContain('CRM-PRIV-123');
    const markEvents = (await dataSource.query(
      `SELECT event FROM "${schemaName}".party_privacy_marks
       WHERE request_id = $1 AND mark = 'RECLAMO_EN_TRAMITE' ORDER BY occurred_at`,
      [request.request.id],
    )) as Array<{ event: string }>;
    expect(markEvents.map((row) => row.event)).toEqual(['OPEN', 'CLOSE']);
    const auditPayloads = auditService.log.mock.calls.map(([entry]) =>
      JSON.stringify(entry.newValue ?? null),
    );
    expect(auditPayloads.join(' ')).not.toContain('Titular ficticio');
    expect(auditPayloads.join(' ')).not.toContain('1234567');
  });

  it('abre la leyenda de reclamo en la misma transacción que complete', async () => {
    const request = await createRequest({ right: 'ACTUALIZAR' });
    await dataSource.query(`
      ALTER TABLE "${schemaName}".data_subject_request_events
      ADD CONSTRAINT reject_complete_event CHECK (to_status <> 'EN_TRAMITE') NOT VALID
    `);

    try {
      await expect(
        inTenant(() => service.transition(request.request.id, 'complete', {}, actorId)),
      ).rejects.toThrow(/reject_complete_event/u);

      const rows = (await dataSource.query(
        `SELECT status FROM "${schemaName}".data_subject_requests WHERE id = $1`,
        [request.request.id],
      )) as Array<{ status: string }>;
      const marks = (await dataSource.query(
        `SELECT event FROM "${schemaName}".party_privacy_marks
         WHERE request_id = $1 AND mark = 'RECLAMO_EN_TRAMITE'`,
        [request.request.id],
      )) as Array<{ event: string }>;

      expect(rows).toEqual([{ status: 'RADICADA' }]);
      expect(marks).toEqual([]);
    } finally {
      await dataSource.query(`
        ALTER TABLE "${schemaName}".data_subject_request_events
        DROP CONSTRAINT IF EXISTS reject_complete_event
      `);
    }
  });

  it('inserta REVOCATION al resolver CONTACTO_COMERCIAL y traslada con entidad, canal y motivo', async () => {
    const revokeRequest = await createRequest({
      right: 'REVOCAR',
      purpose: 'CONTACTO_COMERCIAL',
    });
    await inTenant(() => service.transition(revokeRequest.request.id, 'complete', {}, actorId));
    const resolved = await inTenant(() =>
      service.transition(
        revokeRequest.request.id,
        'resolve',
        { responseText: 'Se revoca la finalidad comercial.', responseChannel: 'PORTAL_ISP' },
        actorId,
      ),
    );
    expect(resolved.request.status).toBe('RESUELTA');
    const authorizations = (await dataSource.query(
      `SELECT purpose, kind, granted FROM "${schemaName}".data_authorizations
       WHERE source_ref = $1`,
      [`privacy-request:${revokeRequest.request.id}:REVOCATION`],
    )) as Array<{ purpose: string; kind: string; granted: boolean }>;
    expect(authorizations).toEqual([
      { purpose: 'CONTACTO_COMERCIAL', kind: 'REVOCATION', granted: false },
    ]);

    const transferRequest = await createRequest({
      kind: 'CONSULTA',
      right: 'CONOCER',
      unverified: true,
    });
    const transferred = await inTenant(() =>
      service.transition(
        transferRequest.request.id,
        'transfer',
        {
          transferredTo: 'Entidad receptora de prueba',
          reason: 'La entidad receptora tiene competencia.',
          channel: 'EMAIL',
        },
        actorId,
      ),
    );
    expect(transferred.request.status).toBe('TRASLADADA');
    expect(transferred.request.transferredTo).toBe('Entidad receptora de prueba');
    expect(transferred.request.responseChannel).toBe('EMAIL');
    expect(transferred.events.at(-1)).toMatchObject({
      toStatus: 'TRASLADADA',
      reason: 'La entidad receptora tiene competencia.',
    });
    const transferIdentity = (await dataSource.query(
      `SELECT identity_verified_at FROM "${schemaName}".data_subject_requests WHERE id = $1`,
      [transferRequest.request.id],
    )) as Array<{ identity_verified_at: string | null }>;
    expect(transferIdentity).toEqual([{ identity_verified_at: null }]);
  });

  it('rechaza sin identidad solo por falta de legitimación y deja completar protegido', async () => {
    const notLegitimate = await createRequest({
      kind: 'CONSULTA',
      right: 'CONOCER',
      unverified: true,
    });
    const rejected = await inTenant(() =>
      service.transition(
        notLegitimate.request.id,
        'reject',
        {
          responseText: 'No se acreditó legitimación.',
          responseChannel: 'EMAIL',
          legalBasis: 'SOLICITANTE_NO_LEGITIMADO',
        },
        actorId,
      ),
    );
    expect(rejected.request.status).toBe('NO_PROCEDENTE');
    expect(rejected.request.legalBasis).toBe('SOLICITANTE_NO_LEGITIMADO');

    const rejectedRow = (await dataSource.query(
      `SELECT status, legal_basis, identity_verified_at
       FROM "${schemaName}".data_subject_requests WHERE id = $1`,
      [notLegitimate.request.id],
    )) as Array<{ status: string; legal_basis: string; identity_verified_at: string | null }>;
    expect(rejectedRow[0]).toEqual({
      status: 'NO_PROCEDENTE',
      legal_basis: 'SOLICITANTE_NO_LEGITIMADO',
      identity_verified_at: null,
    });

    const otherBasis = await createRequest({
      kind: 'CONSULTA',
      right: 'CONOCER',
      unverified: true,
    });
    await expect(
      inTenant(() =>
        service.transition(
          otherBasis.request.id,
          'reject',
          {
            responseText: 'No procede por otra causa.',
            responseChannel: 'EMAIL',
            legalBasis: 'OTRO',
          },
          actorId,
        ),
      ),
    ).rejects.toMatchObject({
      response: { code: 'PRIVACY_REQUEST_IDENTITY_REQUIRED' },
      status: 422,
    });

    const remainedOpen = (await dataSource.query(
      `SELECT status, identity_verified_at
       FROM "${schemaName}".data_subject_requests WHERE id = $1`,
      [otherBasis.request.id],
    )) as Array<{ status: string; identity_verified_at: string | null }>;
    expect(remainedOpen[0]).toEqual({ status: 'RADICADA', identity_verified_at: null });

    await expect(
      inTenant(() => service.transition(otherBasis.request.id, 'complete', {}, actorId)),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('permite radicar sin identidad y verificarla una vez antes de completar', async () => {
    const request = await createRequest({ kind: 'RECLAMO', right: 'ACTUALIZAR', unverified: true });
    expect(request.request.identityVerifiedAt).toBeNull();
    const verified = await inTenant(() =>
      service.verifyIdentity(
        request.request.id,
        { identityVerificationMethod: 'DOCUMENTO_PRESENCIAL' },
        actorId,
      ),
    );
    expect(verified.events.at(-1)).toMatchObject({
      fromStatus: 'RADICADA',
      toStatus: 'RADICADA',
      reason: 'IDENTIDAD_VERIFICADA',
    });
    const identityRows = (await dataSource.query(
      `SELECT identity_verification_method, identity_verified_by::text
       FROM "${schemaName}".data_subject_requests WHERE id = $1`,
      [request.request.id],
    )) as Array<{ identity_verification_method: string; identity_verified_by: string }>;
    expect(identityRows[0]).toEqual({
      identity_verification_method: 'DOCUMENTO_PRESENCIAL',
      identity_verified_by: actorId,
    });
    await expect(
      inTenant(() =>
        service.verifyIdentity(
          request.request.id,
          { identityVerificationMethod: 'DOCUMENTO_PRESENCIAL' },
          actorId,
        ),
      ),
    ).rejects.toMatchObject({
      response: { code: 'PRIVACY_REQUEST_IDENTITY_ALREADY_VERIFIED' },
    });
  });

  it('firma la evidencia del solicitante bajo demanda y audita la lectura sin PII', async () => {
    const evidenceId = '60000000-0000-4000-8000-000000000004';
    mediaService.findOne.mockResolvedValue({ id: evidenceId, usage: MediaUsage.PRIVACY_EVIDENCE });
    mediaService.getPrivacyEvidenceSignedUrl.mockResolvedValue({
      signedUrl: 'https://storage.invalid/privacy-evidence',
      expiresAt: new Date('2026-10-14T12:05:00.000Z'),
    });
    const request = await createRequest({
      kind: 'CONSULTA',
      right: 'CONOCER',
      requesterEvidenceMediaId: evidenceId,
      identityVerificationMethod: 'COPIA_DOCUMENTO',
    });

    const evidence = await inTenant(() =>
      service.getRequesterEvidence(request.request.id, actorId),
    );

    expect(evidence).toEqual({
      url: 'https://storage.invalid/privacy-evidence',
      expiresAt: '2026-10-14T12:05:00.000Z',
    });
    expect(mediaService.getPrivacyEvidenceSignedUrl).toHaveBeenCalledWith(evidenceId, schemaName);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'RECORD_ACCESS',
        entityId: request.request.id,
        newValue: { operation: 'REQUEST_EVIDENCE_VIEWED', requestId: request.request.id },
      }),
    );
  });

  it('marca desistimientos una sola vez en fechas civiles que cruzan festivos', async () => {
    const easterRequestId = randomUUID();
    const julyHolidayRequestId = randomUUID();
    await dataSource.query(
      `INSERT INTO "${schemaName}".data_subject_requests
        (id, requester_kind, kind, "right", status, received_at, due_at, desist_at)
       VALUES
        ($1, 'TITULAR', 'RECLAMO', 'CONOCER', 'INCOMPLETA', '2026-02-06T17:00:00Z', '2026-03-01', '2026-04-06'),
        ($2, 'TITULAR', 'RECLAMO', 'CONOCER', 'INCOMPLETA', '2026-05-09T17:00:00Z', '2026-06-01', '2026-07-09')`,
      [easterRequestId, julyHolidayRequestId],
    );
    const runMarkDesisted = (today: string) =>
      inTenant(() =>
        dataSource.transaction(async (manager) => {
          await manager.query(`SET LOCAL search_path TO "${schemaName}", public`);
          return service.markDesisted(today, manager);
        }),
      );

    expect(await runMarkDesisted('2026-04-05')).toEqual({ count: 0 });
    expect(await runMarkDesisted('2026-04-06')).toEqual({ count: 1 });
    expect(await runMarkDesisted('2026-04-06')).toEqual({ count: 0 });
    expect(await runMarkDesisted('2026-07-08')).toEqual({ count: 0 });
    expect(await runMarkDesisted('2026-07-09')).toEqual({ count: 1 });

    const rows = (await dataSource.query(
      `SELECT id::text, status FROM "${schemaName}".data_subject_requests
       WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [[easterRequestId, julyHolidayRequestId]],
    )) as Array<{ id: string; status: string }>;
    expect(rows.every((row) => row.status === 'DESISTIDA')).toBe(true);
    const events = (await dataSource.query(
      `SELECT request_id::text, actor_id, reason FROM "${schemaName}".data_subject_request_events
       WHERE request_id = ANY($1::uuid[]) ORDER BY request_id`,
      [[easterRequestId, julyHolidayRequestId]],
    )) as Array<{ request_id: string; actor_id: string | null; reason: string }>;
    expect(events).toHaveLength(2);
    expect(events.every((event) => event.actor_id === null)).toBe(true);
    expect(events.every((event) => event.reason === 'DESISTIMIENTO_AUTOMATICO')).toBe(true);
  });

  it('calcula conteos de alertas con el plazo hábil que cruza el festivo del 9 de julio', async () => {
    const overdueId = randomUUID();
    const dueSoonId = randomUUID();
    const outsideWindowId = randomUUID();
    const taskRequestId = randomUUID();
    await dataSource.query(
      `INSERT INTO "${schemaName}".data_subject_requests
        (id, party_id, requester_kind, kind, "right", status, received_at, due_at,
         identity_verified_at)
       VALUES
        ($1, $5, 'TITULAR', 'CONSULTA', 'CONOCER', 'RADICADA', '2026-07-01T17:00:00Z', '2026-07-07', NULL),
        ($2, $5, 'TITULAR', 'RECLAMO', 'CONOCER', 'EN_TRAMITE', '2026-07-01T17:00:00Z', '2026-07-10', '2026-07-01T17:00:00Z'),
        ($3, $5, 'TITULAR', 'CONSULTA', 'CONOCER', 'RADICADA', '2026-07-01T17:00:00Z', '2026-07-14', NULL),
        ($4, $5, 'TITULAR', 'SUPLANTACION', 'CONOCER', 'RADICADA', '2026-07-01T17:00:00Z', '2026-07-20', NULL)`,
      [overdueId, dueSoonId, outsideWindowId, taskRequestId, partyId],
    );
    await dataSource.query(
      `INSERT INTO "${schemaName}".data_subject_request_tasks (request_id, kind, due_at)
       VALUES ($1, 'SUSPENDER_COBRO_EXTERNO', '2026-07-07')`,
      [taskRequestId],
    );

    const counts = await inTenant(() =>
      new PrivacyRequestsReadAdapter(dataSource).dueCounts('2026-07-08'),
    );

    expect(counts).toEqual({ overdue: 1, dueSoon: 1, overdueTasks: 1 });
  });
});
