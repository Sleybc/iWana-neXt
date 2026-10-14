import { AuditAction } from '@iwana/shared';
import { AuditService } from '../../audit/audit.service';
import { AuthorizationsService } from './authorizations.service';
import { AuthorizationsController } from './authorizations.controller';

const partyId = '72000000-0000-4000-8000-000000000001';
const authorizationId = '72000000-0000-4000-8000-000000000002';
const actorId = '72000000-0000-4000-8000-000000000003';

describe('AuthorizationsController', () => {
  const service = {
    create: jest.fn(),
    listForParty: jest.fn(),
    proof: jest.fn(),
  };
  const audit = { log: jest.fn() };
  let controller: AuthorizationsController;

  beforeEach(() => {
    jest.clearAllMocks();
    service.create.mockResolvedValue({ authorizationId });
    service.listForParty.mockResolvedValue([]);
    service.proof.mockResolvedValue({
      legalTextVersion: '3.0',
      sha256: 'a'.repeat(64),
      evidenceUrl: null,
    });
    audit.log.mockResolvedValue(undefined);
    controller = new AuthorizationsController(
      service as unknown as AuthorizationsService,
      audit as unknown as AuditService,
    );
  });

  it('toma la IP de Express y el user agent de una cabecera de texto', async () => {
    const dto = { partyId, purpose: 'TRATAMIENTO_CONTRACTUAL' } as never;
    await expect(
      controller.create(dto, {
        user: { sub: actorId },
        ip: '192.0.2.10',
        socket: { remoteAddress: '192.0.2.11' },
        headers: { 'user-agent': 'portal-test/1.0' },
      } as never),
    ).resolves.toEqual({ data: { authorizationId } });
    expect(service.create).toHaveBeenCalledWith(dto, {
      actorId,
      ip: '192.0.2.10',
      userAgent: 'portal-test/1.0',
    });
  });

  it('usa remoteAddress y omite un user agent con formato no textual', async () => {
    await controller.create(
      {} as never,
      {
        user: { sub: actorId },
        socket: { remoteAddress: '192.0.2.22' },
        headers: { 'user-agent': ['invalid-header-shape'] },
      } as never,
    );
    expect(service.create).toHaveBeenCalledWith({}, { actorId, ip: '192.0.2.22', userAgent: null });

    await controller.create(
      {} as never,
      { user: { sub: actorId }, socket: {}, headers: {} } as never,
    );
    expect(service.create).toHaveBeenLastCalledWith({}, { actorId, ip: null, userAgent: null });
  });

  it('valida la proyección del listado y envuelve la respuesta', async () => {
    const record = {
      id: authorizationId,
      partyId,
      purpose: 'TRATAMIENTO_CONTRACTUAL',
      kind: 'GRANT',
      granted: true,
      channel: 'TELEFONO',
      legalTextId: '72000000-0000-4000-8000-000000000004',
      capturedAt: '2026-10-14T15:00:00.000Z',
    };
    service.listForParty.mockResolvedValue([record]);
    await expect(controller.listForParty(partyId)).resolves.toEqual({ data: [record] });
  });

  it('audita la consulta de prueba sin añadir PII a la auditoría', async () => {
    const result = await controller.proof(partyId, authorizationId, {
      user: { sub: actorId },
    } as never);

    expect(result.data).toEqual({
      legalTextVersion: '3.0',
      sha256: 'a'.repeat(64),
      evidenceUrl: null,
    });
    expect(audit.log).toHaveBeenCalledWith({
      action: AuditAction.RECORD_ACCESS,
      entityType: 'DataAuthorization',
      entityId: authorizationId,
      userId: actorId,
      newValue: { operation: 'AUTHORIZATION_PROOF_VIEWED', authorizationId },
    });
    expect(JSON.stringify(audit.log.mock.calls)).not.toContain('Solicitante');
  });
});
