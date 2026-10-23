import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { TenantContext } from '@iwana/db';
import { EntityManager } from 'typeorm';
import { IpamService } from '../ipam.service';

const TENANT_ID = 'b57994a2-37da-4b2b-9cdb-fdd7abf49dd0';
const NETWORK_ID = 'c87cb0cf-09b5-4f87-bc76-b305441cddc3';

describe('IpamService', () => {
  let service: IpamService;
  let query: jest.Mock;
  let manager: EntityManager;

  beforeEach(() => {
    service = new IpamService({} as never);
    query = jest.fn();
    manager = { query } as unknown as EntityManager;
    jest.spyOn(TenantContext, 'getOrThrow').mockReturnValue({
      tenantId: TENANT_ID,
      schemaName: 'tenant_mod13_ipam_unit',
      tenantSlug: 'mod13-ipam-unit',
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it.each([
    [
      'fuera del rango',
      { is_outside_range: true, is_gateway: true, is_excluded: true, is_in_use: true },
      'IP_OUTSIDE_RANGE',
    ],
    [
      'gateway',
      { is_outside_range: false, is_gateway: true, is_excluded: true, is_in_use: true },
      'IP_IS_GATEWAY',
    ],
    [
      'excluida',
      { is_outside_range: false, is_gateway: false, is_excluded: true, is_in_use: true },
      'IP_EXCLUDED',
    ],
    [
      'ocupada',
      { is_outside_range: false, is_gateway: false, is_excluded: false, is_in_use: true },
      'IP_IN_USE',
    ],
  ])('prioriza el código de validación para una IP manual %s', async (_label, validation, code) => {
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: NETWORK_ID }])
      .mockResolvedValueOnce([validation]);

    const operation = service.reserveIp(manager, {
      networkId: NETWORK_ID,
      provisioningId: 'b5df7551-8d4b-4db4-a758-808fe6c04789',
      requestedIp: '10.40.0.10',
    });

    await expect(operation).rejects.toBeInstanceOf(ConflictException);
    await expect(operation).rejects.toMatchObject({ response: { code } });
  });

  it('traduce una red inexistente o inactiva al error HTTP cerrado de red', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const operation = service.reserveIp(manager, {
      networkId: NETWORK_ID,
      provisioningId: 'b5df7551-8d4b-4db4-a758-808fe6c04789',
    });

    await expect(operation).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(operation).rejects.toMatchObject({ response: { code: 'NETWORK_NOT_IN_ROUTER' } });
  });

  it('reintenta una colisión del índice parcial una vez y elige la siguiente IP libre', async () => {
    let insertAttempts = 0;
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('SELECT id')) return [{ id: NETWORK_ID }];
      if (sql.includes('SELECT host(n.assignable_from')) {
        return [{ ip: insertAttempts === 0 ? '10.40.0.10' : '10.40.0.11' }];
      }
      if (sql.includes('INSERT INTO ip_assignments')) {
        insertAttempts += 1;
        if (insertAttempts === 1) {
          throw { driverError: { code: '23505', constraint: 'uq_ip_assignments_live' } };
        }
        return [{ ip: '10.40.0.11' }];
      }
      return [];
    });

    await expect(
      service.reserveIp(manager, {
        networkId: NETWORK_ID,
        provisioningId: 'b5df7551-8d4b-4db4-a758-808fe6c04789',
      }),
    ).resolves.toBe('10.40.0.11');
    expect(insertAttempts).toBe(2);
  });
});
