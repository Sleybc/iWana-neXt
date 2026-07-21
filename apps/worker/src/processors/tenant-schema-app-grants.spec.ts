import {
  assertPgRoleName,
  buildTenantSchemaAppGrantsSql,
  grantTenantSchemaAppPrivileges,
  resolveAppDbRole,
} from '../../../../packages/database/src/tenant-schema-app-grants';

describe('tenant-schema-app-grants', () => {
  const envKeys = ['DB_USER', 'DB_APP_USER', 'DB_MIGRATOR_USER', 'DB_MIGRATOR_PASSWORD'] as const;
  const envSnapshot: Partial<Record<(typeof envKeys)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const key of envKeys) {
      envSnapshot[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      const previous = envSnapshot[key];
      if (previous === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous;
      }
    }
  });

  describe('resolveAppDbRole', () => {
    it('prefieres DB_APP_USER sobre DB_USER', () => {
      process.env['DB_APP_USER'] = 'iwana_app';
      process.env['DB_USER'] = 'other';
      expect(resolveAppDbRole()).toBe('iwana_app');
    });

    it('usa DB_USER cuando DB_APP_USER no está definido', () => {
      delete process.env['DB_APP_USER'];
      process.env['DB_USER'] = 'iwana_app';
      expect(resolveAppDbRole()).toBe('iwana_app');
    });
  });

  describe('assertPgRoleName', () => {
    it('rechaza identificadores inseguros', () => {
      expect(() => assertPgRoleName('iwana;drop')).toThrow(/inválido/);
      expect(() => assertPgRoleName('')).toThrow(/inválido/);
    });
  });

  describe('buildTenantSchemaAppGrantsSql', () => {
    it('genera GRANT USAGE sin CREATE para app y endurece audit_logs', () => {
      const sql = buildTenantSchemaAppGrantsSql('tenant_isp_test', 'iwana_app', 'iwana_migrator');

      expect(sql).toContain("sch text := 'tenant_isp_test'");
      expect(sql).toContain("app text := 'iwana_app'");
      expect(sql).toContain("migrator text := 'iwana_migrator'");
      expect(sql).toContain('GRANT USAGE ON SCHEMA %I TO %I');
      expect(sql).toContain('GRANT USAGE, CREATE ON SCHEMA %I TO %I');
      expect(sql).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES');
      expect(sql).toContain('GRANT USAGE, SELECT ON ALL SEQUENCES');
      expect(sql).toContain('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I');
      expect(sql).toContain('REVOKE ALL ON TABLE %I.audit_logs FROM %I');
      expect(sql).toContain('GRANT SELECT, INSERT ON TABLE %I.audit_logs TO %I');
      expect(sql).not.toMatch(/GRANT ALL\b/);
      expect(sql).not.toMatch(/GRANT USAGE, CREATE ON SCHEMA %I TO %I',\s*sch,\s*app/);
    });

    it('rechaza schemaName inválido', () => {
      expect(() => buildTenantSchemaAppGrantsSql('public', 'iwana_app', 'iwana_migrator')).toThrow(
        /Schema name inválido/,
      );
    });
  });

  describe('grantTenantSchemaAppPrivileges', () => {
    it('ejecuta el SQL construido contra el queryable', async () => {
      const query = jest.fn().mockResolvedValue(undefined);
      await grantTenantSchemaAppPrivileges({ query }, 'tenant_acme', {
        appRole: 'iwana_app',
        migratorRole: 'iwana_migrator',
      });

      expect(query).toHaveBeenCalledTimes(1);
      const sql = query.mock.calls[0][0] as string;
      expect(sql).toContain("sch text := 'tenant_acme'");
      expect(sql).toContain('GRANT USAGE ON SCHEMA %I TO %I');
    });
  });
});
