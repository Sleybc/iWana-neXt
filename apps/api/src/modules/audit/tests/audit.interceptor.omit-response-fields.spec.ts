import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditAction } from '@iwana/shared';
import { lastValueFrom, of } from 'rxjs';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { AuditOmitResponseFields } from '../decorators/audit-omit-response-fields.decorator';
import { AuditInterceptor } from '../audit.interceptor';
import { AuditService } from '../audit.service';
import { PlatformAuditService } from '../platform-audit.service';
import { NetworkCatalogController } from '../../network/network-catalog.controller';
import { NetworkProvisioningController } from '../../network/network-provisioning.controller';

class AuditOmitTestController {
  @AuditOmitResponseFields('notes')
  create(): void {}

  updateWithoutOmission(): void {}
}

describe('AuditInterceptor — omission de campos de respuesta', () => {
  const user = {
    sub: 'platform-actor-1',
    email: 'hash-ficticio',
    role: 'SYSTEM_ADMIN',
    tenantId: null,
    schemaName: null,
    jti: 'token-id-ficticio',
    type: 'platform',
  } satisfies JwtPayload;

  function makeExecutionContext(
    handler: unknown,
    request: Record<string, unknown>,
    controller: object = AuditOmitTestController,
  ): ExecutionContext {
    return {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handler as () => void,
      getClass: () => controller as typeof AuditOmitTestController,
    } as unknown as ExecutionContext;
  }

  it('omite solo notes recursivamente del newValue y conserva evento, actor, IP y User-Agent', async () => {
    const platformAuditService = { log: jest.fn() };
    const auditService = { log: jest.fn() };
    const interceptor = new AuditInterceptor(
      auditService as unknown as AuditService,
      platformAuditService as unknown as PlatformAuditService,
      new Reflector(),
    );
    const response = {
      data: {
        id: 'address-1',
        status: 'ACTIVE',
        notes: 'nota libre de nivel superior',
        envelope: {
          notes: 'nota libre anidada',
          records: [{ id: 'record-1', notes: 'nota libre en array' }],
        },
      },
    };
    const request = {
      method: 'POST',
      user,
      ip: '198.51.100.23',
      headers: { 'user-agent': 'audit-test-agent' },
      params: {},
      socket: { remoteAddress: '198.51.100.23' },
    };
    const context = makeExecutionContext(AuditOmitTestController.prototype.create, request);

    const result = await lastValueFrom(
      interceptor.intercept(context, { handle: () => of(response) } as CallHandler),
    );

    expect(result).toBe(response);
    expect(response.data.notes).toBe('nota libre de nivel superior');
    expect(response.data.envelope.records[0]?.notes).toBe('nota libre en array');
    expect(platformAuditService.log).toHaveBeenCalledWith({
      action: AuditAction.CREATE,
      entityType: 'AuditOmitTest',
      entityId: 'address-1',
      newValue: {
        id: 'address-1',
        status: 'ACTIVE',
        envelope: { records: [{ id: 'record-1' }] },
      },
      userId: 'platform-actor-1',
      ipAddress: '198.51.100.23',
      userAgent: 'audit-test-agent',
    });
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('limita la recursión para ramas profundas y no filtra notes fuera del límite', async () => {
    const platformAuditService = { log: jest.fn() };
    const interceptor = new AuditInterceptor(
      { log: jest.fn() } as unknown as AuditService,
      platformAuditService as unknown as PlatformAuditService,
      new Reflector(),
    );
    const deepBranch: Record<string, unknown> = {};
    let current = deepBranch;
    for (let index = 0; index < AuditInterceptor.MAX_SANITIZE_DEPTH + 3; index += 1) {
      const child: Record<string, unknown> = {};
      current['nested'] = child;
      current = child;
    }
    current['notes'] = 'nota profunda que no debe persistir';
    const response = { data: { id: 'address-2', deepBranch } };
    const context = makeExecutionContext(AuditOmitTestController.prototype.create, {
      method: 'POST',
      user,
      ip: '198.51.100.23',
      headers: { 'user-agent': 'audit-test-agent' },
      params: {},
      socket: { remoteAddress: '198.51.100.23' },
    });

    await lastValueFrom(
      interceptor.intercept(context, { handle: () => of(response) } as CallHandler),
    );

    const auditEntry = platformAuditService.log.mock.calls[0]?.[0] as {
      newValue: Record<string, unknown>;
      userId: string;
      ipAddress: string;
      userAgent: string;
    };
    expect(JSON.stringify(auditEntry.newValue)).not.toContain(
      'nota profunda que no debe persistir',
    );
    expect(auditEntry.userId).toBe('platform-actor-1');
    expect(auditEntry.ipAddress).toBe('198.51.100.23');
    expect(auditEntry.userAgent).toBe('audit-test-agent');
  });

  it('omite recursivamente los datos IPAM del newValue sin cambiar respuesta ni contexto de auditoría', async () => {
    const platformAuditService = { log: jest.fn() };
    const interceptor = new AuditInterceptor(
      { log: jest.fn() } as unknown as AuditService,
      platformAuditService as unknown as PlatformAuditService,
      new Reflector(),
    );
    const response = {
      data: {
        id: 'address-4',
        status: 'ACTIVE',
        excludedIpCount: 2,
        changedFields: ['status'],
        details: {
          name: 'nombre-sintetico',
          routerName: 'router-sintetico',
          interfaceName: 'interfaz-sintetica',
          managementHost: 'router.fixture.invalid',
          lanInterface: 'bridge-fixture',
          notes: 'nota-sintetica',
          address: '203.0.113.17/24',
          addressWithPrefix: '203.0.113.17/24',
          host: '203.0.113.17',
          hostAddress: '203.0.113.17/32',
          releasedHost: '203.0.113.16',
          cidr: '203.0.113.0/24',
          gateway: '203.0.113.1',
          assignableFrom: '203.0.113.2',
          assignableTo: '203.0.113.254',
          excludedIps: ['203.0.113.9'],
          interfaceAddress: '203.0.113.17/24',
          ip: '203.0.113.17',
          ipAddress: '203.0.113.17',
          ipv4: '203.0.113.17',
          ipv4Address: '203.0.113.17/24',
        },
      },
    };
    const handler = NetworkCatalogController.prototype.correctInterfaceIpv4Address;
    const context = makeExecutionContext(
      handler,
      {
        method: 'POST',
        user,
        ip: '198.51.100.23',
        headers: { 'user-agent': 'audit-test-agent' },
        params: {},
        socket: { remoteAddress: '198.51.100.23' },
      },
      NetworkCatalogController,
    );

    const result = await lastValueFrom(
      interceptor.intercept(context, { handle: () => of(response) } as CallHandler),
    );

    expect(result).toBe(response);
    expect(response.data.details.releasedHost).toBe('203.0.113.16');
    expect(response.data.details.addressWithPrefix).toBe('203.0.113.17/24');
    expect(platformAuditService.log).toHaveBeenCalledWith({
      action: AuditAction.CREATE,
      entityType: 'NetworkCatalog',
      entityId: 'address-4',
      newValue: {
        id: 'address-4',
        status: 'ACTIVE',
        excludedIpCount: 2,
        changedFields: ['status'],
        details: {},
      },
      userId: 'platform-actor-1',
      ipAddress: '198.51.100.23',
      userAgent: 'audit-test-agent',
    });
  });

  it('omite IP y datos vinculados al suscriptor del newValue y conserva la respuesta de provisioning', async () => {
    const platformAuditService = { log: jest.fn() };
    const interceptor = new AuditInterceptor(
      { log: jest.fn() } as unknown as AuditService,
      platformAuditService as unknown as PlatformAuditService,
      new Reflector(),
    );
    const response = {
      data: {
        id: 'provisioning-1',
        status: 'RELEASED',
        subscriberId: 'subscriber-1',
        ip: '192.0.2.10',
        routerInstruction: {
          mode: 'MANUAL',
          steps: ['Asignar 192.0.2.10/32 en el router.'],
        },
        regularizationReason: 'motivo-sintetico',
        releaseReason: 'MANUAL',
        name: 'nombre-sintetico',
        displayLabel: 'suscriptor-sintetico',
        router: { id: 'router-1', name: 'router-sintetico' },
        network: { id: 'network-1', name: 'red-sintetica', cidr: '192.0.2.0/24' },
      },
    };
    const handler = NetworkProvisioningController.prototype.release;
    const context = makeExecutionContext(
      handler,
      {
        method: 'POST',
        user,
        ip: '198.51.100.23',
        headers: { 'user-agent': 'audit-test-agent' },
        params: {},
        socket: { remoteAddress: '198.51.100.23' },
      },
      NetworkProvisioningController,
    );

    const result = await lastValueFrom(
      interceptor.intercept(context, { handle: () => of(response) } as CallHandler),
    );

    expect(result).toBe(response);
    expect(response.data).toMatchObject({
      subscriberId: 'subscriber-1',
      ip: '192.0.2.10',
      routerInstruction: {
        mode: 'MANUAL',
        steps: ['Asignar 192.0.2.10/32 en el router.'],
      },
      regularizationReason: 'motivo-sintetico',
      releaseReason: 'MANUAL',
      router: { name: 'router-sintetico' },
      network: { cidr: '192.0.2.0/24' },
    });
    expect(platformAuditService.log).toHaveBeenCalledWith({
      action: AuditAction.CREATE,
      entityType: 'NetworkProvisioning',
      entityId: 'provisioning-1',
      newValue: {
        id: 'provisioning-1',
        status: 'RELEASED',
        router: { id: 'router-1' },
        network: { id: 'network-1' },
      },
      userId: 'platform-actor-1',
      ipAddress: '198.51.100.23',
      userAgent: 'audit-test-agent',
    });
  });

  it('no aplica omisiones cuando el handler no declara campos', async () => {
    const platformAuditService = { log: jest.fn() };
    const interceptor = new AuditInterceptor(
      { log: jest.fn() } as unknown as AuditService,
      platformAuditService as unknown as PlatformAuditService,
      new Reflector(),
    );
    const response = { data: { id: 'address-3', notes: 'se mantiene sin metadata' } };
    const context = makeExecutionContext(AuditOmitTestController.prototype.updateWithoutOmission, {
      method: 'PATCH',
      user,
      ip: '198.51.100.23',
      headers: { 'user-agent': 'audit-test-agent' },
      params: {},
      socket: { remoteAddress: '198.51.100.23' },
    });

    await lastValueFrom(
      interceptor.intercept(context, { handle: () => of(response) } as CallHandler),
    );

    expect(platformAuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        newValue: { id: 'address-3', notes: 'se mantiene sin metadata' },
        action: AuditAction.UPDATE,
      }),
    );
  });
});
