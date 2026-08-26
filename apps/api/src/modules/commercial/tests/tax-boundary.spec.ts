import * as path from 'path';
import * as fs from 'fs';

/**
 * Test de boundary: verifica que CommercialModule no importa entidades de TaxationModule
 * directamente (solo puede usar el puerto ITaxCatalogReadPort / TaxCatalogReadPort).
 *
 * Regla: ningún archivo .ts en apps/api/src/modules/commercial/ puede tener imports
 * que referencien 'taxation/entities/' ni 'tax-definition.entity'.
 * Solo se permite importar puertos (`TaxCatalogReadPort`, `ITaxApplicationReadPort`)
 * desde taxation/ports/.
 * El archivo commercial.module.ts puede importar TaxationModule (wiring NestJS).
 *
 * Ref: ADR-029, ADR-031, ADR-082
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

describe('Boundary: Commercial no importa entidades de Taxation directamente', () => {
  const commercialDir = path.join(__dirname, '..'); // apps/api/src/modules/commercial/

  // Patrones que indican violación de boundary (entidades, no módulos ni puertos)
  const ENTITY_FORBIDDEN_PATTERNS = [
    /from\s+['"][^'"]*\/taxation\/entities['"]/,
    /from\s+['"][^'"]*tax-definition\.entity['"]/,
  ];

  const tsFiles = collectTsFiles(commercialDir);

  it('encuentra al menos un archivo .ts en el módulo commercial', () => {
    expect(tsFiles.length).toBeGreaterThan(0);
  });

  it('ningún archivo importa entidades de TaxationModule directamente', () => {
    const violations: string[] = [];

    for (const file of tsFiles) {
      const content = fs.readFileSync(file, 'utf8');
      for (const pattern of ENTITY_FORBIDDEN_PATTERNS) {
        if (pattern.test(content)) {
          violations.push(`${path.relative(commercialDir, file)}: ${pattern}`);
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `Violaciones de boundary detectadas en CommercialModule:\n` +
          violations.map((v) => `  - ${v}`).join('\n') +
          `\n\nSolo se permite importar TaxCatalogReadPort desde taxation/ports/`,
      );
    }
  });

  it('servicios y adaptadores de Commercial solo importan desde taxation/ports/', () => {
    // El commercial.module.ts SÍ puede importar TaxationModule (wiring NestJS)
    // Los services, adapters y controllers NO deben importar de taxation fuera de ports/
    const restrictedFiles = tsFiles.filter((f) => {
      const name = path.basename(f);
      return (
        (name.endsWith('.service.ts') ||
          name.endsWith('.adapter.ts') ||
          name.endsWith('.controller.ts')) &&
        !name.endsWith('.spec.ts')
      );
    });

    const violations: string[] = [];

    for (const file of restrictedFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const taxationImports = content.match(/from\s+['"][^'"]*taxation[^'"]*['"]/g) ?? [];
      for (const imp of taxationImports) {
        // Solo se permite desde taxation/ports/
        if (!imp.includes('taxation/ports')) {
          violations.push(`${path.relative(commercialDir, file)}: ${imp}`);
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `Servicios/adaptadores de Commercial importan Taxation fuera de ports/:\n` +
          violations.map((v) => `  - ${v}`).join('\n'),
      );
    }
  });
});
