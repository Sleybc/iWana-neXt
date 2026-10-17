import { QueryRunner } from 'typeorm';

import { SubscriberLegalRepresentativeParty1540000000000 } from './154_subscriber_legal_representative_party';

describe('Migración 154 — representante legal Party', () => {
  it('limita la guarda del enum al schema actual y agrega la referencia NOT VALID', async () => {
    const statements: string[] = [];
    const runner = {
      query: jest.fn(async (sql: string) => {
        statements.push(sql);
        if (sql.includes('legacy_count')) return [{ legacy_count: 1 }];
        return [];
      }),
    } as unknown as QueryRunner;
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);

    try {
      await new SubscriberLegalRepresentativeParty1540000000000().up(runner);
      const executed = statements.join('\n');
      expect(executed).toContain('t.typnamespace = current_schema()::regnamespace');
      expect(executed).toContain("ALTER TYPE party_role_type ADD VALUE 'LEGAL_REPRESENTATIVE'");
      expect(executed).toMatch(
        /legal_representative_party_id uuid NULL\s+REFERENCES party\(id\) ON DELETE RESTRICT/u,
      );
      expect(executed).toContain(
        "CHECK (person_type <> 'JURIDICA' OR legal_representative_party_id IS NOT NULL) NOT VALID",
      );
      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringContaining('conservan legal_representative_id'),
      );
    } finally {
      infoSpy.mockRestore();
    }
  });

  it('revierte columnas y enum cuando el rol nuevo no está en uso', async () => {
    const statements: string[] = [];
    const runner = {
      query: jest.fn(async (sql: string) => {
        statements.push(sql);
        if (sql.includes('role_count')) return [{ role_count: 0 }];
        return [];
      }),
    } as unknown as QueryRunner;

    await new SubscriberLegalRepresentativeParty1540000000000().down(runner);
    expect(statements.join('\n')).toContain('DROP COLUMN IF EXISTS legal_representative_party_id');
    expect(statements.join('\n')).toContain('RENAME TO party_role_type_old');
  });

  it('bloquea perder vínculos con Party sin autorización explícita', async () => {
    const originalFlag = process.env['IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN'];
    delete process.env['IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN'];
    const runner = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('representative_count')) return [{ representative_count: 2 }];
        return [];
      }),
    } as unknown as QueryRunner;

    try {
      await expect(
        new SubscriberLegalRepresentativeParty1540000000000().down(runner),
      ).rejects.toThrow(
        /2 suscriptores.*Party representante legal.*IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true/,
      );
    } finally {
      if (originalFlag === undefined) delete process.env['IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN'];
      else process.env['IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN'] = originalFlag;
    }
  });
});
