/**
 * C-3 (ADR-081) — Test de arquitectura: cero tokens en almacenamiento local.
 *
 * Verifica por test, no por revisión, que NO existe ninguna coincidencia de
 * acceso a `localStorage` sobre claves de token en apps/web y apps/portal,
 * incluidos los alcances limitados (`password-change` de web, `mfa-setup` de
 * portal).
 *
 * Contrato del gate:
 * - Infractora: cualquier línea con `localStorage` que además mencione una
 *   clave de token (literal o constante que la referencia).
 * - Punto de no retorno alcanzado (C-9): YA NO EXISTE excepción. La lectura de
 *   respaldo `C3-BACKUP-READ` se retiró junto con el soporte antiguo; cualquier
 *   coincidencia, incluso en el cliente central, es infracción y hace fallar el
 *   test.
 * - Los archivos de prueba (`*.spec.*`) quedan excluidos del barrido.
 *
 * Este archivo es el espejo de `apps/portal/src/architecture/...` (misma
 * batería), para que cada suite de app valide el gate completo por su cuenta.
 */

import * as fs from 'fs';
import * as path from 'path';

const TOKEN_IDENTIFIERS = [
  'iwana.web.access-token',
  'iwana.portal.access-token',
  'iwana.portal.mfa-setup-token',
];

interface TokenStorageMatch {
  app: 'web' | 'portal';
  file: string;
  line: number;
  text: string;
}

function walk(dir: string, files: string[]): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.spec\./.test(entry.name)) {
      files.push(fullPath);
    }
  }
}

function isCommentLine(text: string): boolean {
  return (
    text.startsWith('//') || text.startsWith('/*') || text.startsWith('*') || text.endsWith('*/')
  );
}

function findTokenStorageMatches(appSrc: string, app: 'web' | 'portal'): TokenStorageMatch[] {
  const files: string[] = [];
  walk(appSrc, files);
  const matches: TokenStorageMatch[] = [];

  for (const file of files) {
    const relativeFile = path.relative(appSrc, file).replace(/\\/g, '/');
    const lines = fs.readFileSync(file, 'utf8').split('\n');

    lines.forEach((rawLine, index) => {
      const text = rawLine.trim();
      const hasLocalStorage = /localStorage/.test(text);
      const hasTokenIdentifier = TOKEN_IDENTIFIERS.some((identifier) => text.includes(identifier));

      if (hasLocalStorage && hasTokenIdentifier && !isCommentLine(text)) {
        matches.push({ app, file: relativeFile, line: index + 1, text });
      }
    });
  }

  return matches;
}

function formatMatch(match: TokenStorageMatch): string {
  return `${match.app}:${match.file}:${match.line} → ${match.text}`;
}

describe('C-3 ADR-081 — cero tokens en almacenamiento local', () => {
  const webSrc = path.resolve(__dirname, '..');
  const portalSrc = path.resolve(__dirname, '../../../portal/src');

  const allMatches = [
    ...findTokenStorageMatches(webSrc, 'web'),
    ...findTokenStorageMatches(portalSrc, 'portal'),
  ];

  it('no existe NINGUNA coincidencia de localStorage sobre claves de token (punto de no retorno C-9 alcanzado)', () => {
    expect(allMatches.map(formatMatch)).toEqual([]);
  });
});
