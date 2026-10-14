import { UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { MediaService } from '../../media/media.service';
import { IContractImpersonationPort } from '../ports/contract-impersonation.port';
import * as tenantQuery from '../ports/privacy-tenant-query';
import { IContractStandingReadPort } from './ports/contract-standing-read.port';
import { PrivacyRequestsService } from './requests.service';

const actorId = '60000000-0000-4000-8000-000000000001';
const requestId = '60000000-0000-4000-8000-000000000002';
const keyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('PrivacyRequestsService — A22', () => {
  const manager = { query: jest.fn() };
  const auditService = { log: jest.fn().mockResolvedValue(undefined) };
  let service: PrivacyRequestsService;

  beforeEach(() => {
    jest.clearAllMocks();
    manager.query.mockResolvedValue([]);
    jest
      .spyOn(tenantQuery, 'withPrivacyTenant')
      .mockImplementation(async (_source, operation) => operation(manager as never));
    service = new PrivacyRequestsService(
      {} as DataSource,
      {
        getOrThrow: (key: string) => {
          if (key === 'MFA_ENCRYPTION_KEY' || key === 'PII_HASH_KEY') return keyHex;
          throw new Error('Clave de prueba no configurada.');
        },
      } as ConfigService,
      auditService as unknown as AuditService,
      {} as IContractImpersonationPort,
      {} as IContractStandingReadPort,
      {} as MediaService,
    );
    jest
      .spyOn(service, 'get')
      .mockResolvedValue({} as Awaited<ReturnType<PrivacyRequestsService['get']>>);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function unverifiedRequest() {
    return {
      id: requestId,
      status: 'RADICADA',
      requester_kind: 'TITULAR',
      kind: 'CONSULTA',
      right: 'CONOCER',
      party_id: null,
      received_at: '2026-10-14T17:00:00.000Z',
      identity_verified_at: null,
      identity_verified_by: null,
      due_at: '2026-10-28',
      purpose: null,
      suspended_contract_ids: [],
    };
  }

  it('permite rechazar sin identidad cuando el fundamento es falta de legitimación', async () => {
    manager.query.mockResolvedValueOnce([unverifiedRequest()]);

    await expect(
      service.transition(
        requestId,
        'reject',
        {
          responseText: 'No se acreditó legitimación.',
          responseChannel: 'EMAIL',
          legalBasis: 'SOLICITANTE_NO_LEGITIMADO',
        },
        actorId,
      ),
    ).resolves.toBeDefined();

    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('legal_basis = $5'),
      expect.arrayContaining(['SOLICITANTE_NO_LEGITIMADO']),
    );
  });

  it('prioriza la falta de legitimación sobre la conservación si la identidad no se verificó', async () => {
    manager.query.mockResolvedValueOnce([
      {
        ...unverifiedRequest(),
        party_id: '60000000-0000-4000-8000-000000000003',
        right: 'SUPRIMIR',
      },
    ]);

    await expect(
      service.transition(
        requestId,
        'reject',
        {
          responseText: 'No se acreditó legitimación.',
          responseChannel: 'EMAIL',
          legalBasis: 'SOLICITANTE_NO_LEGITIMADO',
        },
        actorId,
      ),
    ).resolves.toBeDefined();

    expect(manager.query).toHaveBeenCalledTimes(3);
  });

  it('exige identidad para rechazar sin legitimación', async () => {
    manager.query.mockResolvedValueOnce([unverifiedRequest()]);

    await expect(
      service.transition(
        requestId,
        'reject',
        {
          responseText: 'No procede por otra causa.',
          responseChannel: 'EMAIL',
          legalBasis: 'OTRO',
        },
        actorId,
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'PRIVACY_REQUEST_IDENTITY_REQUIRED',
      },
      status: 422,
    });

    expect(manager.query).toHaveBeenCalledTimes(1);
  });

  it('permite trasladar una solicitud sin identidad verificada', async () => {
    manager.query.mockResolvedValueOnce([unverifiedRequest()]);

    await expect(
      service.transition(
        requestId,
        'transfer',
        {
          transferredTo: 'Entidad competente',
          reason: 'La entidad receptora tiene competencia.',
          channel: 'EMAIL',
        },
        actorId,
      ),
    ).resolves.toBeDefined();

    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('transferred_to = $3'), [
      requestId,
      'TRASLADADA',
      'Entidad competente',
      'EMAIL',
    ]);
  });

  it('conserva la verificación obligatoria para completar', async () => {
    manager.query.mockResolvedValueOnce([unverifiedRequest()]);

    await expect(service.transition(requestId, 'complete', {}, actorId)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );

    expect(manager.query).toHaveBeenCalledTimes(1);
  });
});
