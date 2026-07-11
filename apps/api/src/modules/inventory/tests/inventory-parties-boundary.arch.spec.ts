import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';

/**
 * Guardia de arquitectura (remediacion M3, ADR-052 regla de boundary #3): Compras (modules/inventory)
 * NO debe importar entidades TypeORM de Parties (`party*`). La escritura de identidad va por
 * `IPartyWritePort` y la lectura por `IPartyReadPort` / `SupplierPartyPort`. Importar puertos/tipos
 * de `parties/ports` esta permitido; importar `parties/entities/*` o las clases de entidad NO.
 */

const INVENTORY_DIR = resolve(__dirname, '..');

const FORBIDDEN_IMPORT_PATTERNS: RegExp[] = [
  // Rutas relativas a entidades de Parties.
  /from\s+['"][^'"]*parties\/entities[^'"]*['"]/,
  // Import de clases de entidad de Parties desde el barrel @iwana/db.
  /import\s+\{[^}]*\b(Party|PartyRole|PartyContact)\b[^}]*\}\s+from\s+['"]@iwana\/db['"]/,
];

function collectTsFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      // El guard protege el codigo de produccion; se excluye la carpeta de pruebas
      // (que legitimamente referencia adapters de Parties y contiene ejemplos negativos).
      if (entry === 'tests') {
        continue;
      }
      files.push(...collectTsFiles(fullPath));
      continue;
    }
    if (entry.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('Boundary Compras -> Parties (arquitectura)', () => {
  it('ningun archivo de modules/inventory importa entidades party*', () => {
    const files = collectTsFiles(INVENTORY_DIR);
    const offenders: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      if (FORBIDDEN_IMPORT_PATTERNS.some((pattern) => pattern.test(content))) {
        offenders.push(file.replace(INVENTORY_DIR, 'modules/inventory'));
      }
    }

    expect(offenders).toEqual([]);
  });

  it('detecta correctamente una violacion simulada (auto-verificacion del guard)', () => {
    const sample = `import { Party } from '@iwana/db';`;
    const relativeSample = `import { PartyRole } from '../../parties/entities/party-role.entity';`;
    expect(FORBIDDEN_IMPORT_PATTERNS.some((pattern) => pattern.test(sample))).toBe(true);
    expect(FORBIDDEN_IMPORT_PATTERNS.some((pattern) => pattern.test(relativeSample))).toBe(true);
  });
});
