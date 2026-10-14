import { ConfigService } from '@nestjs/config';
import { AccessPermissionKey, AuditAction, DocumentTypeParty } from '@iwana/shared';
import { DataSource } from 'typeorm';
import { encryptAes256Gcm } from '../../../common/crypto/aes-gcm.util';
import { AuditService } from '../../audit/audit.service';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { MediaService } from '../../media/media.service';
import { IContractImpersonationPort } from '../ports/contract-impersonation.port';
import * as tenantQuery from '../ports/privacy-tenant-query';
import { IContractStandingReadPort } from './ports/contract-standing-read.port';
import { PrivacyRequestsService } from './requests.service';

const actorId = '60000000-0000-4000-8000-000000000001';
const requestId = '60000000-0000-4000-8000-000000000002';
const encryptionKey = Buffer.from(
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  'hex',
);

describe('PrivacyRequestsService — detalle A23', () => {
  const manager = { query: jest.fn() };
  const auditService = { log: jest.fn().mockResolvedValue(undefined) };
  const effectivePermissionsService = {
    getEffectivePermissionsForUser: jest.fn(),
  };
  let service: PrivacyRequestsService;

  const requestRow = () => ({
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
    extended_until: null,
    info_required_at: null,
    desist_at: null,
    response_text: null,
    response_channel: null,
    resolved_at: null,
    resolved_by: null,
    transferred_to: null,
    legal_basis: null,
    requester_name_encrypted: encryptAes256Gcm('Solicitante ficticio', encryptionKey),
    requester_document_type: DocumentTypeParty.CC,
    requester_document_encrypted: encryptAes256Gcm('1234567', encryptionKey),
    requester_contact_encrypted: encryptAes256Gcm('fixture@example.invalid', encryptionKey),
    has_requester_evidence: true,
    identity_verification_method: 'COPIA_DOCUMENTO',
    identity_verified_at: '2026-10-14T18:00:00.000Z',
    identity_verified_by: actorId,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    manager.query
      .mockResolvedValueOnce([requestRow()])
      .mockResolvedValueOnce([
        {
          id: '60000000-0000-4000-8000-000000000004',
          from_status: null,
          to_status: 'RADICADA',
          actor_id: actorId,
          reason: 'RADICACION',
          occurred_at: '2026-10-14T17:00:00.000Z',
        },
      ])
      .mockResolvedValueOnce([]);
    jest
      .spyOn(tenantQuery, 'withPrivacyTenant')
      .mockImplementation(async (_source, operation) => operation(manager as never));
    effectivePermissionsService.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.PRIVACY_READ,
    ]);
    service = new PrivacyRequestsService(
      {} as DataSource,
      {
        getOrThrow: (key: string) => {
          if (key === 'MFA_ENCRYPTION_KEY' || key === 'PII_HASH_KEY') {
            return encryptionKey.toString('hex');
          }
          throw new Error('Clave de prueba no configurada.');
        },
      } as ConfigService,
      auditService as unknown as AuditService,
      {} as IContractImpersonationPort,
      {} as IContractStandingReadPort,
      {} as MediaService,
      effectivePermissionsService as unknown as EffectivePermissionsService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('oculta los datos del solicitante sin privacy.manage y no devuelve ids internos', async () => {
    const detail = await service.get(requestId, actorId);

    expect(effectivePermissionsService.getEffectivePermissionsForUser).toHaveBeenCalledWith(
      actorId,
    );
    expect(detail.request).toMatchObject({
      identityStatus: 'VERIFICADA',
      identityVerificationMethod: 'COPIA_DOCUMENTO',
      identityVerifiedAt: '2026-10-14T18:00:00.000Z',
      hasRequesterEvidence: true,
      requester: null,
    });
    expect(detail.request).not.toHaveProperty('requesterEvidenceMediaId');
    expect(detail.request).not.toHaveProperty('identityVerifiedBy');
    expect(detail.events[0]).not.toHaveProperty('actorId');
    expect(manager.query.mock.calls[0]?.[0]).not.toContain('requester_name_encrypted');
    expect(manager.query.mock.calls[1]?.[0]).not.toContain('actor_id');
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('descifra el solicitante solo con privacy.manage y registra acceso sin PII', async () => {
    effectivePermissionsService.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.PRIVACY_READ,
      AccessPermissionKey.PRIVACY_MANAGE,
    ]);

    const detail = await service.get(requestId, actorId);

    expect(detail.request.requester).toEqual({
      name: 'Solicitante ficticio',
      documentType: DocumentTypeParty.CC,
      document: '1234567',
      contact: 'fixture@example.invalid',
    });
    expect(detail.request).not.toHaveProperty('requesterEvidenceMediaId');
    expect(detail.request).not.toHaveProperty('mediaId');
    expect(detail.request).not.toHaveProperty('identityVerifiedBy');
    expect(detail.events[0]).not.toHaveProperty('actorId');
    expect(manager.query.mock.calls[0]?.[0]).toContain('requester_name_encrypted');
    expect(auditService.log).toHaveBeenCalledWith({
      action: AuditAction.RECORD_ACCESS,
      entityType: 'DataSubjectRequest',
      entityId: requestId,
      userId: actorId,
      newValue: { operation: 'REQUEST_IDENTITY_VIEWED', requestId },
    });
    const auditText = JSON.stringify(auditService.log.mock.calls[0]?.[0]);
    expect(auditText).not.toContain('Solicitante ficticio');
    expect(auditText).not.toContain('1234567');
    expect(auditText).not.toContain('fixture@example.invalid');
  });
});
