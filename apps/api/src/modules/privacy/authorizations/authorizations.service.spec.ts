import { TenantContext } from '@iwana/db';
import { ConsentChannel } from '@iwana/shared';
import { DataAuthorizationEntity } from '../entities/data-authorization.entity';
import { LegalTextEntity } from '../entities/legal-text.entity';
import * as tenantQuery from '../ports/privacy-tenant-query';
import { AuthorizationsService } from './authorizations.service';

describe('AuthorizationsService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('firma la evidencia de autorización solo mediante el método dedicado de privacy', async () => {
    const authorization = {
      id: 'f192dd1e-d4ad-4e42-8697-7821c91110e0',
      partyId: '1d5bdbd1-02a8-4815-8df0-0f0bf0a22038',
      legalTextId: 'dd9af52a-01fc-4f3b-82fb-30a7afc5afaf',
      evidenceMediaId: '4b8852b2-3944-4644-88e9-1d13740f6717',
    };
    const legalText = { version: '2.0', sha256: 'a'.repeat(64) };
    const repository = {
      findOne: jest.fn(async ({ where }: { where: Record<string, string> }) =>
        where.id === authorization.id ? authorization : legalText,
      ),
    };
    const manager = { getRepository: jest.fn(() => repository) };
    const dataSource = {} as never;
    const mediaService = {
      getPrivacyEvidenceSignedUrl: jest.fn().mockResolvedValue({
        signedUrl: 'https://storage.invalid/privacy-proof',
        expiresAt: new Date('2026-10-14T12:05:00.000Z'),
      }),
      getSignedUrl: jest.fn(),
    };

    jest
      .spyOn(tenantQuery, 'withPrivacyTenant')
      .mockImplementation(async (_source, operation) => operation(manager as never));
    jest
      .spyOn(TenantContext, 'getOrThrow')
      .mockReturnValue({ tenantId: 'tenant-id', schemaName: 'tenant_test_isp' } as never);

    const service = new AuthorizationsService(
      dataSource,
      {} as never,
      {} as never,
      mediaService as never,
      {} as never,
    );

    await expect(service.proof(authorization.partyId, authorization.id)).resolves.toEqual({
      legalTextVersion: legalText.version,
      sha256: legalText.sha256,
      evidenceUrl: 'https://storage.invalid/privacy-proof',
    });
    expect(mediaService.getPrivacyEvidenceSignedUrl).toHaveBeenCalledWith(
      authorization.evidenceMediaId,
      'tenant_test_isp',
    );
    expect(mediaService.getSignedUrl).not.toHaveBeenCalled();
    expect(manager.getRepository).toHaveBeenNthCalledWith(1, DataAuthorizationEntity);
    expect(manager.getRepository).toHaveBeenNthCalledWith(2, LegalTextEntity);
  });

  it('rechaza como 422 los textos que no sean de tipo AUTORIZACION', async () => {
    const repository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'dd9af52a-01fc-4f3b-82fb-30a7afc5afaf',
        type: 'POLITICA_TRATAMIENTO',
      }),
    };
    const manager = { getRepository: jest.fn(() => repository) };
    const writePort = { record: jest.fn() };
    jest
      .spyOn(tenantQuery, 'withPrivacyTenant')
      .mockImplementation(async (_source, operation) => operation(manager as never));
    jest
      .spyOn(TenantContext, 'getOrThrow')
      .mockReturnValue({ tenantId: 'tenant-id', schemaName: 'tenant_test_isp' } as never);
    const service = new AuthorizationsService(
      {} as never,
      writePort as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.create(
        {
          partyId: '1d5bdbd1-02a8-4815-8df0-0f0bf0a22038',
          purpose: 'TRATAMIENTO_CONTRACTUAL',
          granted: true,
          channel: ConsentChannel.TELEFONO,
          legalTextId: 'dd9af52a-01fc-4f3b-82fb-30a7afc5afaf',
        },
        { actorId: '60000000-0000-4000-8000-000000000001', ip: null, userAgent: null },
      ),
    ).rejects.toMatchObject({
      response: { code: 'PRIVACY_LEGAL_TEXT_TYPE_INVALID' },
      status: 422,
    });
    expect(writePort.record).not.toHaveBeenCalled();
  });
});
