import * as fs from 'fs';
import * as path from 'path';

/**
 * CRM e Inventory no leen entidades TaxRule ni internals de Commercial.
 * Consumen Taxation vía puertos (ADR-082 D3).
 */
function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(fullPath));
    } else if (entry.name.endsWith('.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

describe('Boundary: CRM e Inventory no importan TaxRule', () => {
  const modulesRoot = path.join(__dirname, '../..');
  const forbidden = [
    /from\s+['"][^'"]*commercial\/entities\/tax-rule/,
    /from\s+['"][^'"]*taxation\/entities\/tax-rule/,
    /from\s+['"][^'"]*tax-rule\.entity['"]/,
    /from\s+['"][^'"]*tax-rule-application\.entity['"]/,
  ];

  it.each(['crm', 'inventory'] as const)('%s no importa entidades TaxRule', (moduleName) => {
    const dir = path.join(modulesRoot, moduleName);
    const files = collectTsFiles(dir);
    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      for (const pattern of forbidden) {
        if (pattern.test(content)) {
          violations.push(`${path.relative(dir, file)}: ${pattern}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
