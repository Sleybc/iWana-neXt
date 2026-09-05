import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';

/**
 * Guardia de boundary (MOD12 Fase 25 / ADR-029 D4): Inventory consume Taxation
 * solo vía TaxCatalogReadPort. Prohibido entidad TaxDefinition, SQL a
 * tax_definitions e ITaxApplicationReadPort.
 */
const INVENTORY_DIR = resolve(__dirname, '..');

const ENTITY_FORBIDDEN_PATTERNS: RegExp[] = [
  /from\s+['"][^'"]*\/taxation\/entities['"]/,
  /from\s+['"][^'"]*tax-definition\.entity['"]/,
  /tax_definitions/,
  /ITaxApplicationReadPort/,
];

function collectTsFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      if (entry === 'tests') {
        continue;
      }
      files.push(...collectTsFiles(fullPath));
      continue;
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('Boundary Inventory -> Taxation (Fase 25)', () => {
  it('ningún archivo de inventory importa TaxDefinition ni ITaxApplicationReadPort', () => {
    const files = collectTsFiles(INVENTORY_DIR);
    const offenders: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      if (ENTITY_FORBIDDEN_PATTERNS.some((pattern) => pattern.test(content))) {
        offenders.push(file.replace(INVENTORY_DIR, 'modules/inventory'));
      }
    }

    expect(offenders).toEqual([]);
  });

  it('inventory.module importa TaxationModule', () => {
    const moduleSource = readFileSync(join(INVENTORY_DIR, 'inventory.module.ts'), 'utf8');
    expect(moduleSource).toContain("from '../taxation/taxation.module'");
    expect(moduleSource).toContain('TaxationModule');
  });

  it('CA-25-12: POST quotes conserva INVENTORY_PURCHASING_MANAGE y GET detail READ', () => {
    const controller = readFileSync(join(INVENTORY_DIR, 'purchasing.controller.ts'), 'utf8');
    expect(controller).toMatch(
      /@Post\('requests\/:id\/quotes'\)[\s\S]{0,500}INVENTORY_PURCHASING_MANAGE/,
    );
    expect(controller).toMatch(/@Get\('requests\/:id'\)[\s\S]{0,400}INVENTORY_PURCHASING_READ/);
  });

  it('PATCH de cotización exige INVENTORY_PURCHASING_MANAGE', () => {
    const controller = readFileSync(join(INVENTORY_DIR, 'purchasing.controller.ts'), 'utf8');
    expect(controller).toMatch(
      /@Patch\('requests\/:id\/quotes\/:quoteId'\)[\s\S]{0,500}INVENTORY_PURCHASING_MANAGE/,
    );
    expect(controller).not.toMatch(/@Put\(['"]requests\/:id\/quotes/);
  });
});
