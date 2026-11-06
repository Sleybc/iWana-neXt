import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : [];
  });
}

/** BR-3.3: ningún archivo de billing/ conserva doble codificación ni caracteres de reemplazo. */
describe('billing: texto sin codificación dañada', () => {
  const doubleEncoded = Buffer.from([0xc3, 0x83]); // U+00C3 como UTF-8 (inicio de mojibake)
  const doubleEncodedB = Buffer.from([0xc3, 0x82]); // U+00C2 como UTF-8
  const replacement = Buffer.from([0xef, 0xbf, 0xbd]); // U+FFFD como UTF-8

  // BR-4.10: el adaptador de CRM que lee para Billing también debe estar limpio.
  const crmReadFiles = ['billing-contract-read.adapter.ts', 'billing-contract-read.module.ts'].map(
    (name) => join(__dirname, '..', 'crm', 'contracts', name),
  );

  it.each(
    [...sourceFiles(__dirname), ...crmReadFiles].map((path) => [
      path.startsWith(__dirname)
        ? path.slice(__dirname.length + 1)
        : path.slice(join(__dirname, '..').length + 1),
      path,
    ]),
  )('%s', (_name, path) => {
    const bytes = readFileSync(path as string);
    expect(bytes.includes(doubleEncoded)).toBe(false);
    expect(bytes.includes(doubleEncodedB)).toBe(false);
    expect(bytes.includes(replacement)).toBe(false);
  });
});
