import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { TenantContext } from '@iwana/db';
import { DataSource, EntityManager } from 'typeorm';
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
      {
        is_outside_range: true,
        is_gateway: true,
        is_excluded: true,
        is_protected: true,
        is_in_use: true,
      },
      'IP_OUTSIDE_RANGE',
    ],
    [
      'gateway',
      {
        is_outside_range: false,
        is_gateway: true,
        is_excluded: true,
        is_protected: true,
        is_in_use: true,
      },
      'IP_IS_GATEWAY',
    ],
    [
      'excluida',
      {
        is_outside_range: false,
        is_gateway: false,
        is_excluded: true,
        is_protected: true,
        is_in_use: true,
      },
      'IP_EXCLUDED',
    ],
    [
      'ocupada',
      {
        is_outside_range: false,
        is_gateway: false,
        is_excluded: false,
        is_protected: false,
        is_in_use: true,
      },
      'IP_IN_USE',
    ],
  ])('prioriza el código de validación para una IP manual %s', async (_label, validation, code) => {
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: NETWORK_ID, router_id: 'router-001', interface_id: null }])
      .mockResolvedValueOnce([{ status: 'ACTIVE' }])
      .mockResolvedValueOnce([validation]);

    const operation = service.reserveIp(manager, {
      networkId: NETWORK_ID,
      provisioningId: 'b5df7551-8d4b-4db4-a758-808fe6c04789',
      requestedIp: '10.40.0.10',
    });

    await expect(operation).rejects.toBeInstanceOf(ConflictException);
    await expect(operation).rejects.toMatchObject({ response: { code } });
  });

  it('clasifica una IP local protegida distinta de una asignación en uso', async () => {
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: NETWORK_ID, router_id: 'router-001', interface_id: null }])
      .mockResolvedValueOnce([{ status: 'ACTIVE' }])
      .mockResolvedValueOnce([
        {
          is_outside_range: false,
          is_gateway: false,
          is_excluded: false,
          is_protected: true,
          is_in_use: false,
        },
      ]);

    await expect(
      service.reserveIp(manager, {
        networkId: NETWORK_ID,
        provisioningId: 'b5df7551-8d4b-4db4-a758-808fe6c04789',
        requestedIp: '10.40.0.11',
      }),
    ).rejects.toMatchObject({ response: { code: 'IP_PROTECTED_BY_INFRASTRUCTURE' } });
  });

  it('usa la misma relación de host local en el cálculo automático y la ocupación', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('SELECT id, router_id, interface_id'))
        return [{ id: NETWORK_ID, router_id: 'router-001', interface_id: null }];
      if (sql.includes('FROM network_routers')) return [{ status: 'ACTIVE' }];
      if (sql.includes('SELECT host(n.assignable_from')) return [{ ip: '10.40.0.12' }];
      if (sql.includes('INSERT INTO ip_assignments')) return [{ ip: '10.40.0.12' }];
      if (sql.includes('WITH eligible_ips'))
        return [{ total: 180, reserved: 0, active: 0, free: 180, has_protection_conflict: false }];
      return [];
    });

    await service.reserveIp(manager, {
      networkId: NETWORK_ID,
      provisioningId: 'b5df7551-8d4b-4db4-a758-808fe6c04789',
    });
    const automaticSql = query.mock.calls
      .map(([sql]) => String(sql))
      .find((sql) => sql.includes('SELECT host(n.assignable_from'));
    expect(automaticSql).toContain('network_router_interface_ipv4_addresses');
    expect(automaticSql).toContain('host_address');

    await service.getOccupancy(NETWORK_ID, manager);
    const occupancySql = query.mock.calls
      .map(([sql]) => String(sql))
      .find((sql) => sql.includes('WITH eligible_ips'));
    expect(occupancySql).toContain('network_router_interface_ipv4_addresses');
    expect(occupancySql).toContain('host_address');
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
      if (sql.includes('SELECT id, router_id, interface_id'))
        return [{ id: NETWORK_ID, router_id: 'router-001', interface_id: null }];
      if (sql.includes('SELECT status FROM network_routers')) return [{ status: 'ACTIVE' }];
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

  it('rechaza reservar cuando no quedan direcciones asignables', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('SELECT id, router_id, interface_id'))
        return [{ id: NETWORK_ID, router_id: 'router-001', interface_id: null }];
      if (sql.includes('SELECT status FROM network_routers')) return [{ status: 'ACTIVE' }];
      if (sql.includes('SELECT host(n.assignable_from')) return [];
      return [];
    });

    await expect(
      service.reserveIp(manager, {
        networkId: NETWORK_ID,
        provisioningId: 'b5df7551-8d4b-4db4-a758-808fe6c04789',
      }),
    ).rejects.toMatchObject({ response: { code: 'NETWORK_POOL_EXHAUSTED' } });
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO ip_assignments'),
      expect.anything(),
    );
  });

  it('devuelve IP_IN_USE si la misma colisión única persiste tras el reintento', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('SELECT id, router_id, interface_id'))
        return [{ id: NETWORK_ID, router_id: 'router-001', interface_id: null }];
      if (sql.includes('SELECT status FROM network_routers')) return [{ status: 'ACTIVE' }];
      if (sql.includes('SELECT host(n.assignable_from')) return [{ ip: '10.40.0.10' }];
      if (sql.includes('INSERT INTO ip_assignments')) {
        throw { driverError: { code: '23505', constraint: 'uq_ip_assignments_live' } };
      }
      return [];
    });

    await expect(
      service.reserveIp(manager, {
        networkId: NETWORK_ID,
        provisioningId: 'b5df7551-8d4b-4db4-a758-808fe6c04789',
      }),
    ).rejects.toMatchObject({ response: { code: 'IP_IN_USE' } });
    expect(
      query.mock.calls.filter(([sql]) => String(sql) === 'SAVEPOINT ipam_insert_attempt'),
    ).toHaveLength(2);
    expect(
      query.mock.calls.filter(([sql]) => String(sql).includes('ROLLBACK TO SAVEPOINT')),
    ).toHaveLength(2);
  });

  it('propaga un error de índice distinto al de asignaciones vivas', async () => {
    const databaseError = { code: '23505', constraint: 'uq_other_table' };
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('SELECT id, router_id, interface_id'))
        return [{ id: NETWORK_ID, router_id: 'router-001', interface_id: null }];
      if (sql.includes('SELECT status FROM network_routers')) return [{ status: 'ACTIVE' }];
      if (sql.includes('SELECT host(n.assignable_from')) return [{ ip: '10.40.0.10' }];
      if (sql.includes('INSERT INTO ip_assignments')) throw databaseError;
      return [];
    });

    await expect(
      service.reserveIp(manager, {
        networkId: NETWORK_ID,
        provisioningId: 'b5df7551-8d4b-4db4-a758-808fe6c04789',
      }),
    ).rejects.toBe(databaseError);
    expect(query).toHaveBeenCalledWith('ROLLBACK TO SAVEPOINT ipam_insert_attempt');
    expect(query).toHaveBeenCalledWith('RELEASE SAVEPOINT ipam_insert_attempt');
  });

  it('acepta una IP manual válida y usa el candidato cuando INSERT no devuelve filas', async () => {
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: NETWORK_ID, router_id: 'router-001', interface_id: null }])
      .mockResolvedValueOnce([{ status: 'ACTIVE' }])
      .mockResolvedValueOnce([
        {
          is_outside_range: false,
          is_gateway: false,
          is_excluded: false,
          is_protected: false,
          is_in_use: false,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(
      service.reserveIp(manager, {
        networkId: NETWORK_ID,
        provisioningId: 'b5df7551-8d4b-4db4-a758-808fe6c04789',
        requestedIp: '10.40.0.10',
      }),
    ).resolves.toBe('10.40.0.10');
  });

  it.each([
    ['router inactivo', null, [{ status: 'DISABLED' }], [], 'NETWORK_NOT_IN_ROUTER'],
    [
      'interfaz inactiva',
      'interface-001',
      [{ status: 'ACTIVE' }],
      [{ router_id: 'router-001', status: 'DISABLED' }],
      'NETWORK_NOT_IN_ROUTER',
    ],
    [
      'interfaz de otro router',
      'interface-001',
      [{ status: 'ACTIVE' }],
      [{ router_id: 'router-002', status: 'ACTIVE' }],
      'NETWORK_NOT_IN_ROUTER',
    ],
  ])(
    'rechaza una red asociada a un %s',
    async (_label, interfaceId, routerRows, interfaceRows, code) => {
      query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: NETWORK_ID, router_id: 'router-001', interface_id: interfaceId },
        ])
        .mockResolvedValueOnce(routerRows)
        .mockResolvedValueOnce(interfaceRows);

      await expect(
        service.reserveIp(manager, {
          networkId: NETWORK_ID,
          provisioningId: 'b5df7551-8d4b-4db4-a758-808fe6c04789',
        }),
      ).rejects.toMatchObject({ response: { code } });
    },
  );

  it('bloquea la asignación de una IP local protegida dentro del tenant', async () => {
    query
      .mockResolvedValueOnce([{ protected: false }])
      .mockResolvedValueOnce([{ protected: true }]);

    await expect(
      service.assertAssignmentNotLocallyProtected(manager, TENANT_ID, '10.40.0.1'),
    ).resolves.toBeUndefined();
    await expect(
      service.assertAssignmentNotLocallyProtected(manager, TENANT_ID, '10.40.0.2'),
    ).rejects.toMatchObject({ response: { code: 'IP_PROTECTED_BY_INFRASTRUCTURE' } });
  });

  it('falla la lectura de ocupación ante conflicto protegido y normaliza un resultado ausente a cero', async () => {
    query
      .mockResolvedValueOnce([
        { total: 2, reserved: 1, active: 1, free: 0, has_protection_conflict: true },
      ])
      .mockResolvedValueOnce([]);

    await expect(service.getOccupancy(NETWORK_ID, manager)).rejects.toMatchObject({
      response: { code: 'IP_PROTECTED_BY_INFRASTRUCTURE' },
    });
    await expect(service.getOccupancy(NETWORK_ID, manager)).resolves.toEqual({
      total: 0,
      reserved: 0,
      active: 0,
      free: 0,
    });
  });

  it('lee ocupación sin manager dentro de una transacción del schema tenant', async () => {
    const occupancyQuery = jest
      .fn()
      .mockResolvedValue([
        { total: 8, reserved: 2, active: 1, free: 5, has_protection_conflict: false },
      ]);
    const queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      query: jest.fn(),
      manager: { query: occupancyQuery },
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
    };
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    } as unknown as DataSource;
    service = new IpamService(dataSource);

    await expect(service.getOccupancy(NETWORK_ID)).resolves.toEqual({
      total: 8,
      reserved: 2,
      active: 1,
      free: 5,
    });
    expect(queryRunner.query).toHaveBeenCalledWith(
      'SET LOCAL search_path TO "tenant_mod13_ipam_unit"',
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
  });
});
