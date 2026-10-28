import { CreateRouterInterfacesAndIpv4Addresses1650000000000 } from './165_router_interfaces_and_ipv4_addresses';

describe('CreateRouterInterfacesAndIpv4Addresses165', () => {
  it('creates normalized interface/address tables and nullable legacy associations', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new CreateRouterInterfacesAndIpv4Addresses1650000000000().up({ query } as never);

    const sql = query.mock.calls.map(([statement]) => String(statement)).join('\n');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS network_router_interfaces');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS network_router_interface_ipv4_addresses');
    expect(sql).toContain('GENERATED ALWAYS AS (set_masklen(address, 32)) STORED');
    expect(sql).toMatch(
      /ALTER TABLE network_routers[\s\S]*ADD COLUMN IF NOT EXISTS legacy_lan_interface_id uuid NULL/,
    );
    expect(sql).toMatch(
      /ALTER TABLE ipv4_networks[\s\S]*ADD COLUMN IF NOT EXISTS interface_id uuid NULL/,
    );
    expect(sql).not.toMatch(/UPDATE\s+(network_routers|ipv4_networks)/i);
  });

  it('refuses to drop interface data or legacy references on down', async () => {
    const query = jest.fn(async (statement: string) => {
      if (statement.includes('to_regclass')) return [{ present: true }];
      if (statement.includes('COUNT(*)'))
        return [{ total: statement.includes('network_router_interfaces') ? 1 : 0 }];
      return [];
    });

    await expect(
      new CreateRouterInterfacesAndIpv4Addresses1650000000000().down({ query } as never),
    ).rejects.toThrow('Rollback de MOD13 interfaces bloqueado');
    expect(query.mock.calls.some(([statement]) => String(statement).includes('DROP TABLE'))).toBe(
      false,
    );
  });
});
