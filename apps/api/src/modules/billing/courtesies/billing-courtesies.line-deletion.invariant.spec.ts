import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * `billing_courtesies.line_id` y `source_line_id` usan ON DELETE SET NULL (migración 203). Es
 * seguro solo si ningún flujo borra líneas sueltas de un borrador: si lo hiciera, una cortesía
 * `ACTIVA` perdería su línea negativa sin anularse. Hoy el único borrado de líneas es el de la
 * propia anulación (solo `kind = 'CORTESIA'`, por id); borrar el documento entero arrastra la
 * cortesía por ON DELETE CASCADE. Un flujo nuevo que borre líneas debe anular antes la cortesía o
 * cambiar el ON DELETE: esta prueba lo obliga a pasar por aquí.
 */
describe('invariante: ningún flujo borra líneas sueltas de un documento de cobro', () => {
  const repoRoot = join(__dirname, '../../../../../..');
  const roots = ['apps/api/src', 'apps/worker/src'].map((root) => join(repoRoot, root));
  const allowed = ['apps/api/src/modules/billing/courtesies/billing-courtesies.service.ts'];
  const deletesLines =
    /DELETE\s+FROM\s+billing_document_lines|delete\(\)[\s\S]{0,80}billing_document_lines|BillingDocumentLine[A-Za-z]*\)?\.(delete|remove)\(/u;

  function sources(dir: string): string[] {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return [];
    }
    return entries.flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sources(path);
      return name.endsWith('.ts') && !/\.(spec|test)\.ts$/u.test(name) ? [path] : [];
    });
  }

  it('solo la anulación de cortesías borra líneas, y solo la línea CORTESIA por id', () => {
    const offenders = roots
      .flatMap(sources)
      .filter((path) => deletesLines.test(readFileSync(path, 'utf8')))
      .map((path) => relative(repoRoot, path).split(sep).join('/'));
    expect(offenders).toEqual(allowed);

    const service = readFileSync(join(repoRoot, allowed[0]!), 'utf8');
    const statements = service.match(/DELETE\s+FROM\s+billing_document_lines[^`]*/gu) ?? [];
    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatch(/id = \$2::uuid AND kind = 'CORTESIA'/u);
  });

  it('la 203 mantiene SET NULL en las líneas y CASCADE con el documento', () => {
    const migration = readFileSync(
      join(repoRoot, 'packages/database/src/migrations/tenant/203_billing_courtesies.ts'),
      'utf8',
    ).replace(/\s+/gu, ' ');
    expect(migration).toContain(
      'document_id uuid NOT NULL REFERENCES billing_documents(id) ON DELETE CASCADE',
    );
    expect(migration).toContain(
      'line_id uuid NULL REFERENCES billing_document_lines(id) ON DELETE SET NULL',
    );
    expect(migration).toContain(
      'source_line_id uuid NULL REFERENCES billing_document_lines(id) ON DELETE SET NULL',
    );
  });
});
