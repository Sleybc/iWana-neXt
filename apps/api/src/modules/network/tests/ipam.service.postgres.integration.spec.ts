import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { dataSourceOptions, runInTenantSchema, TenantContext } from '@iwana/db';
import { IpamService } from '../ipam.service';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;

describeWithDb('IpamService — PostgreSQL real', () => {
  let dataSource: DataSource;
  let service: IpamService;
  const tenantId = randomUUID();
  const schemaName = `tenant_mod13_ipam_${randomUUID().replaceAll('-', '')}`;
  const networkId = randomUUID();
  const context = { tenantId, schemaName, tenantSlug: 'mod13-ipam-it' };

  const run = <T>(operation: () => Promise<T>) => TenantContext.run(context, operation);

  async function createNetwork(
    input: {
      id?: string;
      cidr?: string;
      gateway?: string;
      assignableFrom?: string;
      assignableTo?: string;
      excludedIps?: string[];
    } = {},
  ): Promise<string> {
    const id = input.id ?? randomUUID();
    await run(() =>
      runInTenantSchema(dataSource, schemaName, async (qr) => {
        await qr.query(
          `INSERT INTO ipv4_networks
            (id, tenant_id, cidr, gateway, assignable_from, assignable_to, excluded_ips, status)
           VALUES ($1, $2, $3::cidr, $4::inet, $5::inet, $6::inet, $7::inet[], 'ACTIVE')`,
          [
            id,
            tenantId,
            input.cidr ?? '10.31.0.0/24',
            input.gateway ?? '10.31.0.1',
            input.assignableFrom ?? '10.31.0.10',
            input.assignableTo ?? '10.31.0.250',
            input.excludedIps ?? [],
          ],
        );
      }),
    );
    return id;
  }

  async function reserve(
    targetNetworkId: string,
    provisioningId = randomUUID(),
    requestedIp?: string,
  ): Promise<string> {
    return run(() =>
      runInTenantSchema(dataSource, schemaName, (qr) =>
        service.reserveIp(qr.manager, {
          networkId: targetNetworkId,
          provisioningId,
          ...(requestedIp ? { requestedIp } : {}),
        }),
      ),
    );
  }

  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [],
      migrations: [],
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 24, min: 1 },
    });
    await dataSource.initialize();
    await dataSource.query(`CREATE SCHEMA "${schemaName}"`);
    await dataSource.query(`
      CREATE TABLE "${schemaName}".ipv4_networks (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        cidr cidr NOT NULL,
        gateway inet NOT NULL,
        assignable_from inet NOT NULL,
        assignable_to inet NOT NULL,
        excluded_ips inet[] NOT NULL DEFAULT '{}',
        status varchar(16) NOT NULL
      )
    `);
    await dataSource.query(`
      CREATE TABLE "${schemaName}".ip_assignments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        ipv4_network_id uuid NOT NULL,
        ip inet NOT NULL,
        service_provisioning_id uuid NOT NULL,
        status varchar(16) NOT NULL,
        released_at timestamptz NULL,
        release_reason varchar(32) NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await dataSource.query(`
      CREATE UNIQUE INDEX uq_ip_assignments_live ON "${schemaName}".ip_assignments (tenant_id, ip)
      WHERE status IN ('RESERVED', 'ACTIVE')
    `);
    await createNetwork({ id: networkId });
    service = new IpamService(dataSource);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await dataSource.destroy();
    }
  });

  it('asigna desde el inicio del rango y omite gateway, red, broadcast y exclusiones', async () => {
    const id = await createNetwork({
      cidr: '10.32.0.0/24',
      gateway: '10.32.0.1',
      assignableFrom: '10.32.0.0',
      assignableTo: '10.32.0.255',
      excludedIps: ['10.32.0.2'],
    });

    await expect(reserve(id)).resolves.toBe('10.32.0.3');
  });

  it('responde NETWORK_POOL_EXHAUSTED cuando no quedan direcciones asignables', async () => {
    const id = await createNetwork({
      cidr: '10.33.0.0/24',
      gateway: '10.33.0.1',
      assignableFrom: '10.33.0.10',
      assignableTo: '10.33.0.10',
    });

    await expect(reserve(id)).resolves.toBe('10.33.0.10');
    await expect(reserve(id)).rejects.toMatchObject({
      response: { code: 'NETWORK_POOL_EXHAUSTED' },
    });
  });

  it('calcula la ocupación sobre direcciones asignables, sin red, gateway, broadcast ni exclusiones', async () => {
    const id = await createNetwork({
      cidr: '10.38.0.0/24',
      gateway: '10.38.0.1',
      assignableFrom: '10.38.0.0',
      assignableTo: '10.38.0.255',
      excludedIps: ['10.38.0.2'],
    });
    const readOccupancy = () =>
      run(() =>
        runInTenantSchema(dataSource, schemaName, (qr) => service.getOccupancy(id, qr.manager)),
      );

    await expect(readOccupancy()).resolves.toEqual({
      total: 252,
      reserved: 0,
      active: 0,
      free: 252,
    });

    await reserve(id, randomUUID(), '10.38.0.3');

    await expect(readOccupancy()).resolves.toEqual({
      total: 252,
      reserved: 1,
      active: 0,
      free: 251,
    });
  });

  it.each([
    ['fuera del rango', '10.34.0.9', 'IP_OUTSIDE_RANGE'],
    ['gateway', '10.34.0.10', 'IP_IS_GATEWAY'],
    ['excluida', '10.34.0.11', 'IP_EXCLUDED'],
  ])('rechaza la IP manual %s con su código específico', async (_label, ip, code) => {
    const id = await createNetwork({
      cidr: '10.34.0.0/24',
      gateway: '10.34.0.10',
      assignableFrom: '10.34.0.10',
      assignableTo: '10.34.0.20',
      excludedIps: ['10.34.0.11'],
    });

    await expect(reserve(id, randomUUID(), ip)).rejects.toMatchObject({
      response: { code },
    });
  });

  it.each([
    ['dirección de red', '10.37.0.0'],
    ['broadcast', '10.37.0.255'],
  ])('rechaza la IP manual %s con IP_OUTSIDE_RANGE', async (_label, ip) => {
    const id = await createNetwork({
      cidr: '10.37.0.0/24',
      gateway: '10.37.0.1',
      assignableFrom: '10.37.0.0',
      assignableTo: '10.37.0.255',
    });

    await expect(reserve(id, randomUUID(), ip)).rejects.toMatchObject({
      response: { code: 'IP_OUTSIDE_RANGE' },
    });
  });

  it('rechaza una IP manual ocupada con IP_IN_USE', async () => {
    const id = await createNetwork({
      cidr: '10.35.0.0/24',
      gateway: '10.35.0.1',
      assignableFrom: '10.35.0.10',
      assignableTo: '10.35.0.20',
    });
    await reserve(id, randomUUID(), '10.35.0.12');

    await expect(reserve(id, randomUUID(), '10.35.0.12')).rejects.toMatchObject({
      response: { code: 'IP_IN_USE' },
    });
  });

  it('asigna 20 IP distintas ante 20 reservas concurrentes en la misma red', async () => {
    const id = await createNetwork({
      cidr: '10.36.0.0/24',
      gateway: '10.36.0.1',
      assignableFrom: '10.36.0.10',
      assignableTo: '10.36.0.250',
    });

    const assigned = await Promise.all(Array.from({ length: 20 }, () => reserve(id, randomUUID())));

    expect(assigned).toHaveLength(20);
    expect(new Set(assigned).size).toBe(20);
    expect(assigned.sort((left, right) => left.localeCompare(right))).toEqual(
      Array.from({ length: 20 }, (_, index) => `10.36.0.${index + 10}`),
    );
  });
});
