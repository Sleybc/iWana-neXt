import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';

/**
 * Guardia CA-25-11: el formulario de cotización embebe purchaseTaxPresets del
 * GET de purchasing. El comprador no llama HTTP de Taxation.
 */
const INVENTORY_DIR = resolve(__dirname);

function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (entry.endsWith('.spec.ts') || entry.endsWith('.spec.tsx')) {
      continue;
    }
    if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('Boundary portal inventory cotización (Fase 25)', () => {
  it('CA-25-11: componentes de inventario no llaman HTTP de Taxation', () => {
    const files = collectSourceFiles(INVENTORY_DIR);
    const offenders: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      if (/\/taxation\//.test(content) || /\btaxationApi\b/.test(content)) {
        offenders.push(file.replace(INVENTORY_DIR, 'components/inventory'));
      }
    }

    expect(offenders).toEqual([]);
  });
});
