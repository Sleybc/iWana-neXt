import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantContext } from '@iwana/db';
import { AccessPermissionKey, AuditAction, DocumentTypeParty } from '@iwana/shared';
import { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { MediaService } from '../../media/media.service';
import { IContractImpersonationPort } from '../ports/contract-impersonation.port';
import * as tenantQuery from '../ports/privacy-tenant-query';
import { IContractStandingReadPort } from './ports/contract-standing-read.port';
import { PrivacyRequestsService } from './requests.service';

const actorId = '60000000-0000-4000-8000-000000000001';
const requestId = '60000000-0000-4000-8000-000000000002';
const partyId = '60000000-0000-4000-8000-000000000003';
const evidenceId = '60000000-0000-4000-8000-000000000004';
const contractId = '60000000-0000-4000-8000-000000000005';
const keyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function requestRow(overrides: Record<string, unknown> = {}) {
  return {
    id: requestId,
    party_id: null,
    requester_kind: 'TITULAR',
    kind: 'CONSULTA',
    right: 'CONOCER',
    purpose: null,
    status: 'RADICADA',
    received_at: '2026-10-14T17:00:00.000Z',
    complete_at: null,
    due_at: '2026-10-28',
    impersonation_complaint_due_at: null,
    suspended_contract_ids: [],
    disputed_contract_ids: [],
    extended_until: null,
    info_required_at: null,
    desist_at: null,
    response_text: null,
    response_channel: null,
    resolved_at: null,
    resolved_by: null,
    transferred_to: null,
    legal_basis: null,
    requester_evidence_media_id: null,
    requester_name_encrypted: 'encrypted-name',
    requester_document_type: DocumentTypeParty.CC,
    requester_document_encrypted: 'encrypted-document',
    requester_contact_encrypted: 'encrypted-contact',
    identity_verification_method: null,
    identity_verified_at: null,
    identity_verified_by: null,
    has_requester_evidence: false,
    ...overrides,
  };
}

function taskRow(overrides: Record<string, unknown> = {}) {
  return {
    id: evidenceId,
    kind: 'ENTREGAR_COPIA_DOCUMENTOS',
    due_at: '2026-10-28',
    done_at: null,
    done_by: null,
    note: null,
    status: 'RADICADA',
    ...overrides,
  };
}

function createInput(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'CONSULTA',
    right: 'CONOCER',
    requesterKind: 'TITULAR',
    requesterName: 'Solicitante sintético',
    requesterDocumentType: DocumentTypeParty.CC,
    requesterDocument: '1234567',
    requesterContact: 'solicitante@example.invalid',
    receivedAt: '2026-10-14',
    ...overrides,
  } as never;
}

describe('PrivacyRequestsService — cobertura de operaciones', () => {
  const manager = { query: jest.fn() };
  const auditService = { log: jest.fn() };
  const mediaService = {
    findOne: jest.fn(),
    getPrivacyEvidenceSignedUrl: jest.fn(),
  };
  const impersonationPort = { suspendForImpersonation: jest.fn() };
  const standingPort = { standing: jest.fn() };
  const effectivePermissionsService = { getEffectivePermissionsForUser: jest.fn() };
  const erasurePort = {
    plan: jest.fn(),
    anonymize: jest.fn(),
  };
  let service: PrivacyRequestsService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-14T16:00:00.000Z'));
    jest.clearAllMocks();
    manager.query.mockReset().mockResolvedValue([]);
    auditService.log.mockReset().mockResolvedValue(undefined);
    mediaService.findOne.mockReset();
    mediaService.getPrivacyEvidenceSignedUrl.mockReset();
    impersonationPort.suspendForImpersonation.mockReset().mockResolvedValue({
      suspendedContractIds: [contractId],
    });
    standingPort.standing.mockReset().mockResolvedValue({
      openContractIds: [],
      lastTerminatedAt: null,
    });
    effectivePermissionsService.getEffectivePermissionsForUser
      .mockReset()
      .mockResolvedValue([AccessPermissionKey.PRIVACY_READ]);
    erasurePort.plan.mockReset().mockResolvedValue({
      candidateExpedienteIds: [],
      blockers: [],
      counts: {},
    });
    erasurePort.anonymize.mockReset().mockResolvedValue({ categories: [], changedRows: 0 });
    jest
      .spyOn(tenantQuery, 'withPrivacyTenant')
      .mockImplementation(async (_source, operation) => operation(manager as never));
    jest
      .spyOn(TenantContext, 'getOrThrow')
      .mockReturnValue({ schemaName: 'tenant_privacy_test' } as never);

    service = new PrivacyRequestsService(
      {} as DataSource,
      {
        getOrThrow: (key: string) => {
          if (key === 'MFA_ENCRYPTION_KEY' || key === 'PII_HASH_KEY') return keyHex;
          throw new Error('Clave de prueba no configurada.');
        },
      } as ConfigService,
      auditService as unknown as AuditService,
      impersonationPort as unknown as IContractImpersonationPort,
      standingPort as unknown as IContractStandingReadPort,
      mediaService as unknown as MediaService,
      effectivePermissionsService as unknown as EffectivePermissionsService,
      erasurePort as never,
    );
    jest.spyOn(service, 'get').mockResolvedValue({} as never);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('rechaza documentos que quedan vacíos al normalizarlos', async () => {
    await expect(
      service.create(createInput({ requesterDocument: '---' }), actorId),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.query).not.toHaveBeenCalled();
  });

  it('rechaza campos de identidad que exceden el límite cifrable', async () => {
    await expect(
      service.create(createInput({ requesterName: 'x'.repeat(222) }), actorId),
    ).rejects.toThrow('excede el máximo que admite el cifrado');
    expect(manager.query).not.toHaveBeenCalled();
  });

  it.each([
    { kind: 'SUPLANTACION' },
    { kind: 'SUPLANTACION', partyId, identityVerificationMethod: 'DOCUMENTO_PRESENCIAL' },
    { kind: 'SUPLANTACION', disputedContractIds: [contractId] },
  ])('rechaza una radicación de suplantación incompleta %#', async (overrides) => {
    await expect(service.create(createInput(overrides), actorId)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(impersonationPort.suspendForImpersonation).not.toHaveBeenCalled();
  });

  it('rechaza contratos impugnados en una solicitud que no es suplantación', async () => {
    await expect(
      service.create(createInput({ disputedContractIds: [contractId] }), actorId),
    ).rejects.toThrow('solo aplican a una solicitud de suplantación');
  });

  it('rechaza una evidencia que no tiene uso de privacidad', async () => {
    mediaService.findOne.mockResolvedValue({ usage: 'STRATUM_EVIDENCE' });
    await expect(
      service.create(createInput({ requesterEvidenceMediaId: evidenceId }), actorId),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mediaService.findOne).toHaveBeenCalledWith(evidenceId, 'tenant_privacy_test');
  });

  it('radica consulta y conserva que la identidad quedó pendiente', async () => {
    manager.query.mockResolvedValueOnce([requestRow()]);

    const result = await service.create(createInput(), actorId);

    expect(result.request.identityVerificationMethod).toBeNull();
    expect(result.request.identityVerifiedAt).toBeNull();
    expect(result.request.identityVerifiedBy).toBeNull();
    expect(result.request.requesterDocument).toBe('1234567');
    expect(result.suspendedContractIds).toEqual([]);
    expect(result.tasks).toEqual([]);
    expect(manager.query).toHaveBeenCalledTimes(2);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.CREATE,
        newValue: { operation: 'REQUEST_FILED', kind: 'CONSULTA', status: 'RADICADA' },
      }),
    );
    expect(JSON.stringify(auditService.log.mock.calls)).not.toContain('Solicitante sintético');
  });

  it('radica suplantación con contratos suspendidos, marca y tareas cuando una tarea no retorna fila', async () => {
    const row = requestRow({
      kind: 'SUPLANTACION',
      party_id: partyId,
      impersonation_complaint_due_at: '2026-11-11',
      suspended_contract_ids: [contractId],
    });
    manager.query
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([taskRow({ kind: 'SUSPENDER_COBRO_EXTERNO', due_at: '2026-10-14' })])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([row]);

    const result = await service.create(
      createInput({
        kind: 'SUPLANTACION',
        partyId,
        identityVerificationMethod: 'DOCUMENTO_PRESENCIAL',
        disputedContractIds: [contractId],
      }),
      actorId,
    );

    expect(impersonationPort.suspendForImpersonation).toHaveBeenCalledWith(
      expect.objectContaining({ partyId, contractIds: [contractId], actorId }),
      { manager },
    );
    expect(result.suspendedContractIds).toEqual([contractId]);
    expect(result.tasks).toHaveLength(1);
    expect(result.request.impersonationComplaintDueAt).toBe('2026-11-11');
    expect(
      manager.query.mock.calls.some(([sql]) => String(sql).includes('VICTIMA_FALSEDAD_PERSONAL')),
    ).toBe(true);
    expect(
      manager.query.mock.calls.some(([sql]) => String(sql).includes('suspended_contract_ids =')),
    ).toBe(true);
  });

  it('falla si la inserción de la solicitud no devuelve una fila', async () => {
    manager.query.mockResolvedValueOnce([]);
    await expect(service.create(createInput(), actorId)).rejects.toThrow(
      'No se pudo crear la solicitud.',
    );
  });

  it('lista con filtros, cursor, prórroga y siguiente página', async () => {
    const lastItem = requestRow({
      id: requestId,
      status: 'RADICADA',
      due_at: '2026-10-13',
      extended_until: '2026-10-20',
    });
    manager.query
      .mockResolvedValueOnce([{ total: '2' }])
      .mockResolvedValueOnce([{ due_at: '2026-10-10' }])
      .mockResolvedValueOnce([lastItem, requestRow({ id: evidenceId })]);

    const result = await service.list({
      status: 'RADICADA',
      kind: 'CONSULTA',
      dueWithinDays: 5,
      cursor: evidenceId,
      limit: 1,
    } as never);

    expect(result.meta).toEqual({ nextCursor: requestId, total: 2, limit: 1 });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.isOverdue).toBe(false);
    expect(manager.query.mock.calls[0]?.[0]).toContain('status = $1 AND kind = $2');
    expect(manager.query.mock.calls[2]?.[0]).toContain(' AND (due_at, id) >');
  });

  it('rechaza un cursor inexistente y compone el cursor sin otros filtros', async () => {
    manager.query.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);
    await expect(service.list({ cursor: evidenceId, limit: 10 } as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    manager.query
      .mockReset()
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([{ due_at: '2026-10-10' }])
      .mockResolvedValueOnce([]);
    const result = await service.list({ cursor: evidenceId, limit: 10 } as never);
    expect(result.meta.nextCursor).toBeNull();
    expect(manager.query.mock.calls[2]?.[0]).toContain(' WHERE (due_at, id) >');
  });

  it('calcula vencimiento por estado y deja nextCursor nulo cuando no hay más filas', async () => {
    manager.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        requestRow({ status: 'RADICADA', due_at: '2026-10-13' }),
        requestRow({ id: evidenceId, status: 'RESUELTA', due_at: '2026-10-13' }),
      ]);

    const result = await service.list({ limit: 5 } as never);

    expect(result.meta).toEqual({ nextCursor: null, total: 0, limit: 5 });
    expect(result.data.map((item) => item.isOverdue)).toEqual([true, false]);
  });

  it('responde no encontrado para el detalle y para una solicitud sin evidencia', async () => {
    jest.spyOn(service, 'get').mockRestore();
    manager.query.mockResolvedValueOnce([]);
    await expect(service.get(requestId, actorId)).rejects.toBeInstanceOf(NotFoundException);

    manager.query
      .mockReset()
      .mockResolvedValueOnce([requestRow({ requester_evidence_media_id: null })]);
    await expect(service.getRequesterEvidence(requestId, actorId)).rejects.toMatchObject({
      response: { code: 'PRIVACY_REQUEST_EVIDENCE_NOT_FOUND' },
    });
  });

  it('firma evidencia y audita el acceso usando un identificador opaco', async () => {
    manager.query.mockResolvedValueOnce([requestRow({ requester_evidence_media_id: evidenceId })]);
    mediaService.getPrivacyEvidenceSignedUrl.mockResolvedValue({
      signedUrl: 'https://storage.invalid/privacy-evidence',
      expiresAt: new Date('2026-10-14T17:00:00.000Z'),
    });

    await expect(service.getRequesterEvidence(requestId, actorId)).resolves.toEqual({
      url: 'https://storage.invalid/privacy-evidence',
      expiresAt: '2026-10-14T17:00:00.000Z',
    });
    expect(mediaService.getPrivacyEvidenceSignedUrl).toHaveBeenCalledWith(
      evidenceId,
      'tenant_privacy_test',
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.RECORD_ACCESS,
        newValue: { operation: 'REQUEST_EVIDENCE_VIEWED', requestId },
      }),
    );
    expect(JSON.stringify(auditService.log.mock.calls)).not.toContain(evidenceId);
  });

  it('traduce evidencia desaparecida a 404 y propaga errores de almacenamiento ajenos', async () => {
    manager.query.mockResolvedValueOnce([requestRow({ requester_evidence_media_id: evidenceId })]);
    mediaService.getPrivacyEvidenceSignedUrl.mockRejectedValueOnce(new NotFoundException());
    await expect(service.getRequesterEvidence(requestId, actorId)).rejects.toMatchObject({
      response: { code: 'PRIVACY_REQUEST_EVIDENCE_NOT_FOUND' },
    });

    manager.query
      .mockReset()
      .mockResolvedValueOnce([requestRow({ requester_evidence_media_id: evidenceId })]);
    const storageError = new Error('fallo de almacenamiento');
    mediaService.getPrivacyEvidenceSignedUrl.mockRejectedValueOnce(storageError);
    await expect(service.getRequesterEvidence(requestId, actorId)).rejects.toBe(storageError);
  });

  it('valida evidencia y estado antes de verificar identidad', async () => {
    await expect(
      service.verifyIdentity(
        requestId,
        { identityVerificationMethod: 'COPIA_DOCUMENTO' } as never,
        actorId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    mediaService.findOne.mockResolvedValue({ usage: 'STRATUM_EVIDENCE' });
    await expect(
      service.verifyIdentity(
        requestId,
        {
          identityVerificationMethod: 'COPIA_DOCUMENTO',
          requesterEvidenceMediaId: evidenceId,
        } as never,
        actorId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    mediaService.findOne.mockReset();
    manager.query.mockResolvedValueOnce([]);
    await expect(
      service.verifyIdentity(
        requestId,
        { identityVerificationMethod: 'DOCUMENTO_PRESENCIAL' } as never,
        actorId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('impide verificar una identidad repetida o una solicitud en estado no admitido', async () => {
    manager.query.mockResolvedValueOnce([
      requestRow({ identity_verified_at: new Date('2026-10-14T15:00:00.000Z') }),
    ]);
    await expect(
      service.verifyIdentity(
        requestId,
        { identityVerificationMethod: 'DOCUMENTO_PRESENCIAL' } as never,
        actorId,
      ),
    ).rejects.toMatchObject({ response: { code: 'PRIVACY_REQUEST_IDENTITY_ALREADY_VERIFIED' } });

    manager.query.mockReset().mockResolvedValueOnce([requestRow({ status: 'RESUELTA' })]);
    await expect(
      service.verifyIdentity(
        requestId,
        { identityVerificationMethod: 'DOCUMENTO_PRESENCIAL' } as never,
        actorId,
      ),
    ).rejects.toMatchObject({ response: { code: 'PRIVACY_REQUEST_INVALID_TRANSITION' } });
  });

  it.each([
    ['REPRESENTANTE', 'DOCUMENTO_PRESENCIAL'],
    ['APODERADO', 'COPIA_DOCUMENTO'],
    ['CAUSAHABIENTE', 'DOCUMENTO_PRESENCIAL'],
  ])('exige el método probatorio apropiado para %s', async (requesterKind, method) => {
    manager.query.mockResolvedValueOnce([requestRow({ requester_kind: requesterKind })]);
    await expect(
      service.verifyIdentity(requestId, { identityVerificationMethod: method } as never, actorId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('registra la verificación presencial y el evento, sin exigir archivo', async () => {
    manager.query.mockResolvedValueOnce([requestRow()]).mockResolvedValue([]);

    await service.verifyIdentity(
      requestId,
      { identityVerificationMethod: 'DOCUMENTO_PRESENCIAL' } as never,
      actorId,
    );

    expect(
      manager.query.mock.calls.some(([sql]) => String(sql).includes('IDENTIDAD_VERIFICADA')),
    ).toBe(true);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.UPDATE,
        newValue: { operation: 'REQUEST_IDENTITY_VERIFIED', requestId },
      }),
    );
  });

  it('marca desistimientos vencidos y no audita cuando no hay filas', async () => {
    await expect(
      service.markDesisted('2026-10-14', manager as unknown as EntityManager),
    ).resolves.toEqual({
      count: 0,
    });
    expect(auditService.log).not.toHaveBeenCalled();

    manager.query.mockResolvedValueOnce([{ id: requestId }, { id: evidenceId }]);
    await expect(
      service.markDesisted('2026-10-14', manager as unknown as EntityManager),
    ).resolves.toEqual({
      count: 2,
    });
    expect(auditService.log).toHaveBeenCalledTimes(2);
    expect(auditService.log).toHaveBeenLastCalledWith(
      expect.objectContaining({
        entityId: evidenceId,
        userId: null,
        newValue: { operation: 'REQUEST_AUTO_DESISTED', requestId: evidenceId },
      }),
    );
  });

  it('rechaza acciones para una solicitud ausente y fechas inválidas de requerimiento', async () => {
    manager.query.mockResolvedValueOnce([]);
    await expect(service.transition(requestId, 'transfer', {}, actorId)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    manager.query
      .mockReset()
      .mockResolvedValueOnce([requestRow({ received_at: '2026-09-30T17:00:00.000Z' })]);
    await expect(
      service.transition(
        requestId,
        'require-info',
        { missingItems: 'Dato faltante', channel: 'EMAIL' },
        actorId,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('requiere identidad para completar y limita la fecha de completitud', async () => {
    manager.query.mockResolvedValueOnce([requestRow({ status: 'RADICADA' })]);
    await expect(service.transition(requestId, 'complete', {}, actorId)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );

    manager.query.mockReset().mockResolvedValueOnce([
      requestRow({
        identity_verified_at: '2026-10-14T15:00:00.000Z',
        identity_verified_by: actorId,
      }),
    ]);
    await expect(
      service.transition(requestId, 'complete', { completedAt: '2026-10-13' }, actorId),
    ).rejects.toBeInstanceOf(ConflictException);

    manager.query.mockReset().mockResolvedValueOnce([
      requestRow({
        identity_verified_at: '2026-10-14T15:00:00.000Z',
        identity_verified_by: actorId,
      }),
    ]);
    await expect(
      service.transition(requestId, 'complete', { completedAt: '2026-10-15' }, actorId),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('completa reclamo, calcula el plazo desde completitud y abre la marca del titular', async () => {
    manager.query
      .mockResolvedValueOnce([
        requestRow({
          kind: 'RECLAMO',
          right: 'ACTUALIZAR',
          party_id: partyId,
          identity_verified_at: '2026-10-14T15:00:00.000Z',
          identity_verified_by: actorId,
        }),
      ])
      .mockResolvedValue([]);

    await service.transition(requestId, 'complete', { completedAt: '2026-10-14' }, actorId);

    expect(
      manager.query.mock.calls.some(([sql]) =>
        String(sql).includes("'RECLAMO_EN_TRAMITE', 'OPEN'"),
      ),
    ).toBe(true);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        newValue: { operation: 'REQUEST_TRANSITION', action: 'complete', toStatus: 'EN_TRAMITE' },
      }),
    );
  });

  it('requiere información dentro del plazo y fija desistimiento a dos meses', async () => {
    manager.query.mockResolvedValueOnce([requestRow()]).mockResolvedValue([]);

    await service.transition(
      requestId,
      'require-info',
      { missingItems: 'Copia del documento', channel: 'EMAIL' },
      actorId,
    );

    const updateCall = manager.query.mock.calls.find(([sql]) =>
      String(sql).includes('info_required_at ='),
    );
    expect(updateCall?.[1]).toEqual([
      requestId,
      'INCOMPLETA',
      expect.any(Date),
      '2026-12-14',
      'Copia del documento',
      'EMAIL',
    ]);
  });

  it('extiende consulta o reclamo una sola vez y rechaza suplantación', async () => {
    manager.query
      .mockResolvedValueOnce([requestRow({ status: 'EN_TRAMITE' })])
      .mockResolvedValue([]);
    await service.transition(requestId, 'extend', { reason: 'Complejidad del caso' }, actorId);
    expect(manager.query.mock.calls.some(([sql]) => String(sql).includes('extended_until ='))).toBe(
      true,
    );

    manager.query
      .mockReset()
      .mockResolvedValueOnce([requestRow({ status: 'EN_TRAMITE', extended_until: '2026-11-04' })]);
    await expect(
      service.transition(requestId, 'extend', { reason: 'Otra prórroga' }, actorId),
    ).rejects.toBeInstanceOf(ConflictException);

    manager.query
      .mockReset()
      .mockResolvedValueOnce([requestRow({ status: 'EN_TRAMITE', kind: 'SUPLANTACION' })]);
    await expect(
      service.transition(requestId, 'extend', { reason: 'Prórroga' }, actorId),
    ).rejects.toThrow('no admite prórroga');
  });

  it('exige confirmación de supresión y mantiene el deber de conservación con titular', async () => {
    manager.query.mockResolvedValueOnce([requestRow({ status: 'EN_TRAMITE', right: 'SUPRIMIR' })]);
    await expect(
      service.transition(
        requestId,
        'resolve',
        { responseText: 'Resuelta', responseChannel: 'EMAIL' },
        actorId,
      ),
    ).rejects.toMatchObject({
      response: { code: 'PRIVACY_ERASURE_CONFIRMATION_REQUIRED' },
    });

    const erasureBody = {
      responseText: 'Resuelta',
      responseChannel: 'EMAIL',
      erasure: {
        confirm: true,
        expedienteIds: ['60000000-0000-4000-8000-000000000010'],
      },
    };
    manager.query
      .mockReset()
      .mockResolvedValueOnce([
        requestRow({ status: 'EN_TRAMITE', right: 'SUPRIMIR', party_id: partyId }),
      ]);
    await expect(
      service.transition(requestId, 'resolve', erasureBody, actorId),
    ).rejects.toMatchObject({
      response: { code: 'PRIVACY_ERASURE_IDENTITY_REQUIRED' },
    });

    manager.query.mockReset().mockResolvedValueOnce([
      requestRow({
        status: 'EN_TRAMITE',
        right: 'SUPRIMIR',
        party_id: partyId,
        identity_verified_at: '2026-10-14T15:00:00.000Z',
      }),
    ]);
    standingPort.standing.mockResolvedValueOnce({
      openContractIds: [contractId],
      lastTerminatedAt: null,
    });
    await expect(service.transition(requestId, 'resolve', erasureBody, actorId)).rejects.toThrow(
      'no procedencia por deber de conservación',
    );
  });

  it('registra el evento RESOLVE y la auditoría al completar una supresión', async () => {
    manager.query
      .mockResolvedValueOnce([
        requestRow({
          kind: 'CONSULTA',
          right: 'SUPRIMIR',
          status: 'EN_TRAMITE',
          identity_verified_at: '2026-10-14T15:00:00.000Z',
        }),
      ])
      .mockResolvedValue([]);
    erasurePort.plan.mockResolvedValue({
      candidateExpedienteIds: [],
      blockers: [],
      counts: {},
    });
    erasurePort.anonymize.mockResolvedValue({
      categories: ['IDENTIFICACION'],
      changedRows: 2,
    });

    await service.transition(
      requestId,
      'resolve',
      {
        responseText: 'Se anonimizó la solicitud.',
        responseChannel: 'EMAIL',
        erasure: { confirm: true, expedienteIds: [] },
      },
      actorId,
    );

    expect(
      manager.query.mock.calls.some(
        ([sql, values]) =>
          String(sql).includes('INSERT INTO data_subject_request_events') &&
          String(sql).includes("'RESOLVE'") &&
          (values as unknown[])[1] === 'EN_TRAMITE' &&
          (values as unknown[])[2] === 'RESUELTA',
      ),
    ).toBe(true);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.UPDATE,
        newValue: expect.objectContaining({
          operation: 'REQUEST_TRANSITION',
          erasure: { categories: ['IDENTIFICACION'], changedRows: 2 },
        }),
      }),
    );
  });

  it('resuelve revocación y agrega una fila REVOCATION con finalidad y referencia de cambio', async () => {
    manager.query
      .mockResolvedValueOnce([
        requestRow({
          status: 'EN_TRAMITE',
          kind: 'RECLAMO',
          right: 'REVOCAR',
          purpose: 'CONTACTO_COMERCIAL',
          party_id: partyId,
        }),
      ])
      .mockResolvedValue([]);

    await service.transition(
      requestId,
      'resolve',
      {
        responseText: 'Se actualizó la preferencia.',
        responseChannel: 'EMAIL',
        dataChangeReference: 'CAMBIO-42',
      },
      actorId,
    );

    const revocationCall = manager.query.mock.calls.find(([sql]) =>
      String(sql).includes("'REVOCATION', false"),
    );
    expect(revocationCall?.[1]).toEqual([
      partyId,
      'CONTACTO_COMERCIAL',
      'EMAIL',
      actorId,
      expect.any(Date),
      `privacy-request:${requestId}:REVOCATION`,
    ]);
    const updateCall = manager.query.mock.calls.find(([sql]) =>
      String(sql).includes('resolved_at ='),
    );
    expect(updateCall?.[1]?.[2]).toBe(
      'Se actualizó la preferencia.\n\nReferencia de cambio: CAMBIO-42',
    );
    expect(
      manager.query.mock.calls.some(
        ([sql, values]) =>
          String(sql).includes('INSERT INTO party_privacy_marks') &&
          (values as unknown[])[1] === 'RECLAMO_EN_TRAMITE' &&
          (values as unknown[])[2] === 'CLOSE',
      ),
    ).toBe(true);
  });

  it('resuelve solicitudes ordinarias sin añadir referencia vacía', async () => {
    manager.query
      .mockResolvedValueOnce([requestRow({ status: 'EN_TRAMITE' })])
      .mockResolvedValue([]);

    await service.transition(
      requestId,
      'resolve',
      { responseText: 'Atendida.', responseChannel: 'EMAIL', dataChangeReference: '' },
      actorId,
    );

    const updateCall = manager.query.mock.calls.find(([sql]) =>
      String(sql).includes('resolved_at ='),
    );
    expect(updateCall?.[1]?.[2]).toBe('Atendida.');
  });

  it('declara no procedente por falta de legitimación sin consultar retención', async () => {
    manager.query.mockResolvedValueOnce([requestRow()]).mockResolvedValue([]);

    await service.transition(
      requestId,
      'reject',
      {
        responseText: 'No se acreditó legitimación.',
        responseChannel: 'EMAIL',
        legalBasis: 'SOLICITANTE_NO_LEGITIMADO',
      },
      actorId,
    );

    expect(standingPort.standing).not.toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ newValue: expect.objectContaining({ action: 'reject' }) }),
    );
  });

  it('exige el fundamento contractual con contrato abierto y solo bloquea con deber legal', async () => {
    const suppression = requestRow({
      status: 'EN_TRAMITE',
      right: 'SUPRIMIR',
      party_id: partyId,
      identity_verified_at: '2026-10-14T15:00:00.000Z',
    });
    manager.query.mockResolvedValueOnce([suppression]);
    standingPort.standing.mockResolvedValueOnce({
      openContractIds: [contractId],
      lastTerminatedAt: null,
    });

    await expect(
      service.transition(
        requestId,
        'reject',
        {
          responseText: 'No procede.',
          responseChannel: 'EMAIL',
          legalBasis: 'DEBER_LEGAL_CONSERVACION',
        },
        actorId,
      ),
    ).rejects.toThrow('debe corresponder');

    manager.query.mockReset().mockResolvedValueOnce([suppression]).mockResolvedValue([]);
    standingPort.standing.mockResolvedValueOnce({
      openContractIds: [contractId],
      lastTerminatedAt: null,
    });
    await service.transition(
      requestId,
      'reject',
      { responseText: 'No procede.', responseChannel: 'EMAIL', legalBasis: 'DEBER_CONTRACTUAL' },
      actorId,
    );
    expect(
      manager.query.mock.calls.some(
        ([sql, values]) =>
          String(sql).includes('INSERT INTO party_privacy_marks') &&
          (values as unknown[])[1] === 'DATOS_BLOQUEADOS' &&
          (values as unknown[])[2] === 'OPEN',
      ),
    ).toBe(false);
  });

  it('aplica retención legal cuando el último contrato terminó dentro del periodo', async () => {
    const suppression = requestRow({
      status: 'EN_TRAMITE',
      right: 'SUPRIMIR',
      party_id: partyId,
      identity_verified_at: '2026-10-14T15:00:00.000Z',
    });
    manager.query
      .mockResolvedValueOnce([suppression])
      .mockResolvedValueOnce([{ years: 2 }])
      .mockResolvedValue([]);
    standingPort.standing.mockResolvedValueOnce({
      openContractIds: [],
      lastTerminatedAt: '2025-01-01',
    });

    await service.transition(
      requestId,
      'reject',
      {
        responseText: 'No procede.',
        responseChannel: 'EMAIL',
        legalBasis: 'DEBER_LEGAL_CONSERVACION',
      },
      actorId,
    );

    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT years FROM retention_policies'),
      ['IDENTIFICACION_DIRECCION_CONTRATO_SUSCRIPTOR'],
    );
    expect(
      manager.query.mock.calls.some(
        ([sql, values]) =>
          String(sql).includes('INSERT INTO party_privacy_marks') &&
          (values as unknown[])[1] === 'DATOS_BLOQUEADOS' &&
          (values as unknown[])[2] === 'OPEN',
      ),
    ).toBe(true);
  });

  it('rechaza un fundamento de conservación cuando no hay deber vigente', async () => {
    manager.query
      .mockResolvedValueOnce([
        requestRow({
          status: 'EN_TRAMITE',
          right: 'REVOCAR',
          purpose: 'TRATAMIENTO_CONTRACTUAL',
          party_id: partyId,
          identity_verified_at: '2026-10-14T15:00:00.000Z',
        }),
      ])
      .mockResolvedValueOnce([{ years: 2 }]);
    standingPort.standing.mockResolvedValueOnce({
      openContractIds: [],
      lastTerminatedAt: '2020-01-01',
    });

    await expect(
      service.transition(
        requestId,
        'reject',
        { responseText: 'No procede.', responseChannel: 'EMAIL', legalBasis: 'DEBER_CONTRACTUAL' },
        actorId,
      ),
    ).rejects.toThrow('No se encontró un deber vigente');
  });

  it('traslada sin identidad y guarda el motivo en el evento', async () => {
    manager.query.mockResolvedValueOnce([requestRow()]).mockResolvedValue([]);

    await service.transition(
      requestId,
      'transfer',
      {
        transferredTo: 'Entidad competente',
        reason: 'Corresponde a otra entidad',
        channel: 'EMAIL',
      },
      actorId,
    );

    expect(manager.query.mock.calls.some(([sql]) => String(sql).includes('transferred_to ='))).toBe(
      true,
    );
    expect(manager.query.mock.calls.at(-1)?.[1]).toEqual([
      requestId,
      'RADICADA',
      'TRASLADADA',
      actorId,
      'Corresponde a otra entidad',
    ]);
  });

  it('valida tareas pendientes, registra su cierre y rechaza una doble finalización', async () => {
    manager.query.mockResolvedValueOnce([]);
    await expect(
      service.completeTask(requestId, evidenceId, 'Cerrada', actorId),
    ).rejects.toBeInstanceOf(NotFoundException);

    manager.query.mockReset().mockResolvedValueOnce([taskRow({ done_at: new Date() })]);
    await expect(
      service.completeTask(requestId, evidenceId, 'Cerrada', actorId),
    ).rejects.toBeInstanceOf(ConflictException);

    manager.query.mockReset().mockResolvedValueOnce([taskRow()]).mockResolvedValueOnce([]);
    await expect(
      service.completeTask(requestId, evidenceId, 'Cerrada', actorId),
    ).rejects.toBeInstanceOf(ConflictException);

    manager.query
      .mockReset()
      .mockResolvedValueOnce([taskRow()])
      .mockResolvedValueOnce([{ id: evidenceId }])
      .mockResolvedValue([]);
    await expect(
      service.completeTask(requestId, evidenceId, 'Cerrada', actorId),
    ).resolves.toMatchObject({
      id: evidenceId,
      doneBy: actorId,
      note: 'Cerrada',
    });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.UPDATE,
        entityId: evidenceId,
        newValue: { operation: 'REQUEST_TASK_COMPLETED', requestId },
      }),
    );
  });
});
