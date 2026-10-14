import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { TenantContext } from '@iwana/db';
import { AuditAction, ConsentChannel } from '@iwana/shared';
import { AuditService } from '../../audit/audit.service';
import { MediaService } from '../../media/media.service';
import { DataAuthorizationEntity } from '../entities/data-authorization.entity';
import { LegalTextEntity } from '../entities/legal-text.entity';
import * as tenantQuery from '../ports/privacy-tenant-query';
import { IPrivacyAuthorizationReadPort } from '../ports/privacy-authorization-read.port';
import { IPrivacyAuthorizationWritePort } from '../ports/privacy-authorization-write.port';
import { AuthorizationsService } from './authorizations.service';

const partyId = '73000000-0000-4000-8000-000000000001';
const legalTextId = '73000000-0000-4000-8000-000000000002';
const authorizationId = '73000000-0000-4000-8000-000000000003';
const actorId = '73000000-0000-4000-8000-000000000004';

describe('AuthorizationsService — cobertura de lecturas y escrituras', () => {
  const legalRepository = { findOne: jest.fn() };
  const authorizationRepository = { findOne: jest.fn() };
  const manager = {
    getRepository: jest.fn((entity: unknown) =>
      entity === LegalTextEntity ? legalRepository : authorizationRepository,
    ),
  };
  const writePort = { record: jest.fn() };
  const readPort = { listForParty: jest.fn(), hasActive: jest.fn() };
  const media = { getPrivacyEvidenceSignedUrl: jest.fn() };
  const audit = { log: jest.fn() };
  let service: AuthorizationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    legalRepository.findOne.mockReset();
    authorizationRepository.findOne.mockReset();
    writePort.record.mockReset().mockResolvedValue({ authorizationId, created: true });
    readPort.listForParty.mockReset().mockResolvedValue([]);
    readPort.hasActive.mockReset().mockResolvedValue({ active: false });
    media.getPrivacyEvidenceSignedUrl.mockReset();
    audit.log.mockReset().mockResolvedValue(undefined);
    jest
      .spyOn(tenantQuery, 'withPrivacyTenant')
      .mockImplementation(async (_source, operation) => operation(manager as never));
    jest
      .spyOn(TenantContext, 'getOrThrow')
      .mockReturnValue({ schemaName: 'tenant_privacy_test' } as never);
    service = new AuthorizationsService(
      {} as never,
      writePort as unknown as IPrivacyAuthorizationWritePort,
      readPort as unknown as IPrivacyAuthorizationReadPort,
      media as unknown as MediaService,
      audit as unknown as AuditService,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  const input = {
    partyId,
    purpose: 'TRATAMIENTO_CONTRACTUAL',
    granted: true,
    channel: ConsentChannel.TELEFONO,
    legalTextId,
  };
  const context = { actorId, ip: '192.0.2.30', userAgent: 'e2e-synthetic' };

  it('rechaza un texto inexistente antes de registrar una autorización', async () => {
    legalRepository.findOne.mockResolvedValue(null);
    await expect(service.create(input as never, context)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(writePort.record).not.toHaveBeenCalled();
  });

  it('rechaza textos publicados que no son de autorización', async () => {
    legalRepository.findOne.mockResolvedValue({ id: legalTextId, type: 'AVISO_PRIVACIDAD' });
    await expect(service.create(input as never, context)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(writePort.record).not.toHaveBeenCalled();
  });

  it('registra la autorización y audita solo cuando el puerto crea una fila', async () => {
    legalRepository.findOne.mockResolvedValue({ id: legalTextId, type: 'AUTORIZACION' });
    await expect(
      service.create(
        { ...input, evidenceMediaId: '73000000-0000-4000-8000-000000000005' } as never,
        context,
      ),
    ).resolves.toEqual({ authorizationId });
    expect(writePort.record).toHaveBeenCalledWith(
      expect.objectContaining({ actorId, channel: ConsentChannel.TELEFONO }),
      expect.objectContaining({ ip: context.ip, userAgent: context.userAgent, manager }),
    );
    expect(audit.log).toHaveBeenCalledWith({
      action: AuditAction.CREATE,
      entityType: 'DataAuthorization',
      entityId: authorizationId,
    });

    writePort.record.mockResolvedValueOnce({ authorizationId, created: false });
    await service.create(input as never, context);
    expect(audit.log).toHaveBeenCalledTimes(1);
  });

  it('reexpone las consultas del puerto de lectura', async () => {
    const records = [{ id: authorizationId }];
    readPort.listForParty.mockResolvedValue(records);
    readPort.hasActive.mockResolvedValue({ active: true, authorizationId });
    await expect(service.listForParty(partyId)).resolves.toBe(records);
    await expect(service.hasActive(partyId, 'TRATAMIENTO_CONTRACTUAL' as never)).resolves.toEqual({
      active: true,
      authorizationId,
    });
  });

  it('rechaza la prueba cuando no existe la autorización o su texto versionado', async () => {
    authorizationRepository.findOne.mockResolvedValue(null);
    await expect(service.proof(partyId, authorizationId)).rejects.toBeInstanceOf(NotFoundException);

    authorizationRepository.findOne.mockResolvedValue({ id: authorizationId, legalTextId });
    legalRepository.findOne.mockResolvedValue(null);
    await expect(service.proof(partyId, authorizationId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('responde prueba sin URL temporal si no hay archivo asociado', async () => {
    authorizationRepository.findOne.mockResolvedValue({
      id: authorizationId,
      partyId,
      legalTextId,
      evidenceMediaId: null,
    });
    legalRepository.findOne.mockResolvedValue({ version: '3.0', sha256: 'a'.repeat(64) });

    await expect(service.proof(partyId, authorizationId)).resolves.toEqual({
      legalTextVersion: '3.0',
      sha256: 'a'.repeat(64),
      evidenceUrl: null,
    });
    expect(media.getPrivacyEvidenceSignedUrl).not.toHaveBeenCalled();
  });
});
