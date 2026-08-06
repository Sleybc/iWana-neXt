import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * E7 / SEC-P1 §5.8 — red anti-reintroducción.
 *
 * `AuditService.log()` sanitiza en el sink (D-C / §5.5), pero los llamadores
 * directos no deben volver a pasar claves de PII en `oldValue`/`newValue`.
 * Este barrido falla si reaparece `fullName`, `latitude` o `longitude` en el
 * literal pasado a `auditService.log(...)`.
 *
 * Sin PII real: solo analiza código fuente.
 */

const API_SRC_ROOT = resolve(__dirname, '../..');

/** Claves mínimas del criterio §5.5 / §5.8. */
const FORBIDDEN_AUDIT_PAYLOAD_KEYS = ['fullName', 'latitude', 'longitude'] as const;

function collectProductionTsFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') {
        continue;
      }
      files.push(...collectProductionTsFiles(fullPath));
      continue;
    }

    if (!entry.endsWith('.ts') || entry.endsWith('.spec.ts')) {
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

/**
 * Extrae el objeto literal de cada `auditService.log({...})` (incluye
 * `this.auditService.log`) mediante conteo de llaves.
 */
export function extractAuditServiceLogObjectLiterals(source: string): Array<{
  startIndex: number;
  literal: string;
}> {
  const needle = 'auditService.log(';
  const results: Array<{ startIndex: number; literal: string }> = [];
  let idx = 0;

  while (idx < source.length) {
    const callAt = source.indexOf(needle, idx);
    if (callAt < 0) {
      break;
    }

    let i = callAt + needle.length;
    while (i < source.length && /\s/.test(source[i]!)) {
      i += 1;
    }

    if (source[i] !== '{') {
      idx = callAt + needle.length;
      continue;
    }

    let depth = 0;
    const start = i;
    let end = i;
    for (; end < source.length; end += 1) {
      const ch = source[end];
      if (ch === '{') {
        depth += 1;
      } else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          end += 1;
          break;
        }
      }
    }

    results.push({ startIndex: callAt, literal: source.slice(start, end) });
    idx = end;
  }

  return results;
}

export function findForbiddenPiiKeysInAuditLogLiteral(literal: string): string[] {
  return FORBIDDEN_AUDIT_PAYLOAD_KEYS.filter((key) => new RegExp(`\\b${key}\\s*:`).test(literal));
}

describe('E7 SEC-P1 — anti-reintroducción de PII en auditService.log()', () => {
  it('detecta una violación simulada (auto-verificación del guard)', () => {
    const sample = `
      await this.auditService.log({
        action: 'CREATE',
        newValue: { fullName: 'x', latitude: 1, longitude: 2, status: 'OK' },
      });
    `;
    const literals = extractAuditServiceLogObjectLiterals(sample);
    expect(literals).toHaveLength(1);
    expect(findForbiddenPiiKeysInAuditLogLiteral(literals[0]!.literal).sort()).toEqual([
      'fullName',
      'latitude',
      'longitude',
    ]);
  });

  it('ningún servicio de producción pasa fullName, latitude ni longitude a auditService.log()', () => {
    const offenders: string[] = [];

    for (const file of collectProductionTsFiles(API_SRC_ROOT)) {
      // El propio AuditService / política / interceptor no son "servicios" que
      // reintroducen PII en payloads de negocio; el scan cubre callers.
      const rel = relative(API_SRC_ROOT, file).replace(/\\/g, '/');
      if (
        rel === 'modules/audit/audit.service.ts' ||
        rel === 'modules/audit/audit-sanitize.policy.ts' ||
        rel.startsWith('modules/audit/tests/')
      ) {
        continue;
      }

      const source = readFileSync(file, 'utf8');
      if (!source.includes('auditService.log(')) {
        continue;
      }

      for (const { startIndex, literal } of extractAuditServiceLogObjectLiterals(source)) {
        const hits = findForbiddenPiiKeysInAuditLogLiteral(literal);
        if (hits.length === 0) {
          continue;
        }

        const line = source.slice(0, startIndex).split('\n').length;
        offenders.push(`${rel}:${line} → ${hits.join(', ')}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
