import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

type HermeticityViolation = {
  pattern: 'INCLUDING ALL' | 'tenant_iwana';
  file: string;
};

function stripComments(source: string): string {
  return source.replace(
    /\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm,
    (_match, prefix: string) => prefix ?? '',
  );
}

function importedDataSourceNames(source: string): string[] {
  const names = new Set<string>();
  const imports = source.matchAll(/\bimport\s*\{([^}]+)\}\s*from\s*['"][^'"]+['"]/gsu);

  for (const importMatch of imports) {
    const importClause = importMatch[1];
    if (!importClause) continue;

    for (const specifier of importClause.split(',')) {
      const binding = /^\s*(?:type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*$/u.exec(
        specifier,
      );
      const importedName = binding?.[1];
      const localName = binding?.[2] ?? importedName;
      if (
        importedName &&
        localName &&
        importedName !== 'DataSource' &&
        /DataSource$/iu.test(importedName)
      ) {
        names.add(localName);
      }
      if (importedName === 'dataSource' && localName) names.add(localName);
    }
  }

  return [...names];
}

function opensRealDatabaseConnection(file: string, source: string): boolean {
  if (file.endsWith('.postgres.integration.spec.ts')) return true;

  const code = stripComments(source);
  const initializesDataSource =
    /\bnew\s+DataSource\s*\(/u.test(code) && /\.initialize\s*\(/u.test(code);
  const initializesImportedDataSource =
    /\b(?:[A-Za-z_$][\w$]*DataSource|dataSource|appDataSource|tenantDataSource|migrationDataSource)\.initialize\s*\(/u.test(
      code,
    ) ||
    importedDataSourceNames(code).some((name) =>
      new RegExp(`\\b${name}\\.(?:initialize|query|createQueryRunner)\\s*\\(`, 'u').test(code),
    );
  const opensTenantDataSource =
    /\bcreateTenantDataSource\s*\(/u.test(code) && /\.initialize\s*\(/u.test(code);
  const connectsPgClient = /\bnew\s+Client\s*\(/u.test(code) && /\.connect\s*\(/u.test(code);
  const queriesPgPool = /\bnew\s+Pool\s*\(/u.test(code) && /\.(?:connect|query)\s*\(/u.test(code);
  const queryRunnerCreation =
    /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*[A-Za-z_$][\w$]*\.createQueryRunner\s*\(/u.exec(
      code,
    );
  const opensQueryRunner = queryRunnerCreation
    ? new RegExp(`\\b${queryRunnerCreation[1]}\\.(?:connect|query)\\s*\\(`, 'u').test(code)
    : false;

  return (
    initializesDataSource ||
    initializesImportedDataSource ||
    opensTenantDataSource ||
    connectsPgClient ||
    queriesPgPool ||
    opensQueryRunner
  );
}

function hasUnguardedSharedTenantName(source: string): boolean {
  const rejectingGuards = [
    ...source.matchAll(/\bif\s*\([^)]*\btenant_iwana\b[^)]*\)\s*\{\s*throw\b[^}]*\}/gsu),
  ].map((match) => ({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length }));

  return [...source.matchAll(/\btenant_iwana\b/giu)].some(
    (match) =>
      !rejectingGuards.some(
        (guard) => (match.index ?? -1) >= guard.start && (match.index ?? -1) < guard.end,
      ),
  );
}

function findViolations(file: string, source: string): HermeticityViolation[] {
  if (!opensRealDatabaseConnection(file, source)) return [];

  const code = stripComments(source);
  const violations: HermeticityViolation[] = [];

  if (/\bINCLUDING\s+ALL\b/iu.test(code)) {
    violations.push({ pattern: 'INCLUDING ALL', file });
  }
  if (hasUnguardedSharedTenantName(code)) {
    violations.push({ pattern: 'tenant_iwana', file });
  }

  return violations;
}

function collectSpecFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return collectSpecFiles(path);
    return entry.isFile() && entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

describe('Hermeticidad de las integraciones PostgreSQL', () => {
  it('detecta un DDL sembrado con INCLUDING ALL', () => {
    expect(
      findViolations(
        'seeded-including-all.postgres.integration.spec.ts',
        "const ddl = 'CREATE TABLE target (LIKE source INCLUDING ALL)';",
      ),
    ).toEqual([
      { pattern: 'INCLUDING ALL', file: 'seeded-including-all.postgres.integration.spec.ts' },
    ]);
  });

  it('detecta una escritura sembrada que nombra tenant_iwana sin guardarla', () => {
    expect(
      findViolations(
        'seeded-tenant-write.postgres.integration.spec.ts',
        "const schema = 'tenant_iwana'; await dataSource.query(`DELETE FROM ${schema}.subscribers`);",
      ),
    ).toEqual([
      { pattern: 'tenant_iwana', file: 'seeded-tenant-write.postgres.integration.spec.ts' },
    ]);
  });

  it('acepta una guarda que rechaza explícitamente tenant_iwana', () => {
    expect(
      findViolations(
        'guarded-tenant.postgres.integration.spec.ts',
        "if (schemaName === 'tenant_iwana') { throw new Error('No usar tenant principal'); } await dataSource.query('SELECT 1');",
      ),
    ).toEqual([]);
  });

  it('no acepta una guarda ajena a una consulta hardcodeada a tenant_iwana', () => {
    expect(
      findViolations(
        'guarded-but-hardcoded-tenant.postgres.integration.spec.ts',
        "if (schemaName === 'tenant_iwana') { throw new Error('No usar tenant principal'); } await dataSource.query('DELETE FROM tenant_iwana.subscribers');",
      ),
    ).toEqual([
      {
        pattern: 'tenant_iwana',
        file: 'guarded-but-hardcoded-tenant.postgres.integration.spec.ts',
      },
    ]);
  });

  it('no acepta una referencia antes del throw dentro de la guarda', () => {
    expect(
      findViolations(
        'tenant-use-before-guard.postgres.integration.spec.ts',
        "if (schemaName === 'tenant_iwana') { await dataSource.query('DELETE FROM subscribers'); throw new Error('No usar tenant principal'); }",
      ),
    ).toEqual([
      { pattern: 'tenant_iwana', file: 'tenant-use-before-guard.postgres.integration.spec.ts' },
    ]);
  });

  it('ignora tenant_iwana como texto en una spec con dependencias mockeadas', () => {
    expect(
      findViolations(
        'subscriber-pipeline-listeners.spec.ts',
        "const event = { schemaName: 'tenant_iwana' }; const dataSource = { query: jest.fn() };",
      ),
    ).toEqual([]);
  });

  it('incluye una spec sin sufijo que abre un QueryRunner real', () => {
    expect(
      findViolations(
        'tenant-query-runner.spec.ts',
        "import { dataSource as db } from '../database/data-source'; await db.initialize(); const queryRunner = db.createQueryRunner(); await queryRunner.connect(); await queryRunner.query('SELECT * FROM tenant_iwana.subscribers');",
      ),
    ).toEqual([{ pattern: 'tenant_iwana', file: 'tenant-query-runner.spec.ts' }]);
  });

  it('no encuentra patrones compartidos en las specs del API', () => {
    const sourceRoot = resolve(__dirname, '../../..');
    const currentFile = resolve(__filename);
    const violations = collectSpecFiles(sourceRoot)
      .filter((file) => resolve(file) !== currentFile)
      .flatMap((file) => findViolations(relative(sourceRoot, file), readFileSync(file, 'utf8')));

    expect(violations).toEqual([]);
  });
});
