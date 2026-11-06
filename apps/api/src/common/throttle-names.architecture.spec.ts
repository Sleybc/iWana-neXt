import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import * as ts from 'typescript';

/**
 * CA-5 — Una regla de arquitectura falla si `@Throttle` o `@SkipThrottle`
 * usan un nombre distinto de los definidos en `ThrottlerModule`.
 *
 * La causa raíz (spec §1): `app.module.ts` declara el throttler como
 * `global`, pero 11 rutas usan `{ default: ... }`. Como `@nestjs/throttler`
 * resuelve los metadatos por `THROTTLER_LIMIT + <name>`, el nombre
 * `default` nunca lo consulta el guard y el limite queda inactivo.
 * Este test lee los nombres reales de `app.module.ts` y los cruza con
 * todos los decoradores de `src/`; cualquier nombre no definido rompe
 * el build.
 */

const SRC_DIR = resolve(__dirname, '..');
const APP_MODULE_PATH = join(SRC_DIR, 'app.module.ts');

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && path.endsWith('.ts') && !/\.(?:spec|test)\.ts$/u.test(path)
      ? [path]
      : [];
  });
}

function definedThrottlerNames(): string[] {
  const text = readFileSync(APP_MODULE_PATH, 'utf8');
  const forRootIndex = text.indexOf('ThrottlerModule.forRoot');
  if (forRootIndex === -1) {
    throw new Error('No se encontro ThrottlerModule.forRoot en app.module.ts');
  }
  const segment = text.slice(forRootIndex);
  const names = [...segment.matchAll(/name:\s*'([^']+)'/gu)].map((m) => m[1] as string);
  if (names.length === 0) {
    throw new Error('No se encontraron nombres de throttler en app.module.ts');
  }
  return names;
}

interface Violation {
  file: string;
  line: number;
  decorator: string;
  names: string[];
}

function decoratorName(decorator: ts.Decorator): string | null {
  const expression = decorator.expression;
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression)) {
    return expression.expression.text;
  }
  return null;
}

function objectKeys(node: ts.ObjectLiteralExpression): string[] {
  return node.properties
    .map((prop) => {
      if (ts.isPropertyAssignment(prop)) {
        const name = prop.name;
        return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;
      }
      if (ts.isShorthandPropertyAssignment(prop)) return prop.name.text;
      return null;
    })
    .filter((key): key is string => key !== null);
}

function collectViolations(allowed: Set<string>): Violation[] {
  const violations: Violation[] = [];
  for (const file of sourceFiles(SRC_DIR)) {
    const text = readFileSync(file, 'utf8');
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const visit = (node: ts.Node): void => {
      const decorators = ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
      for (const decorator of decorators) {
        const name = decoratorName(decorator);
        if (name !== 'Throttle' && name !== 'SkipThrottle') continue;
        const { line, character } = source.getLineAndCharacterOfPosition(
          decorator.getStart(source),
        );
        const call = decorator.expression;
        // `@SkipThrottle()` sin argumentos marca `default` en @nestjs/throttler.
        if (!ts.isCallExpression(call) || call.arguments.length === 0) {
          violations.push({
            file: join(dirname(file), file.split(dirname(file)).pop() ?? file),
            line: line + 1,
            decorator: name,
            names: ['default (implicito)'],
          });
          continue;
        }
        const first = call.arguments[0];
        if (!first || !ts.isObjectLiteralExpression(first)) continue;
        const keys = objectKeys(first);
        for (const key of keys) {
          if (!allowed.has(key)) {
            violations.push({
              file,
              line: line + 1,
              decorator: name,
              names: [key],
            });
            break;
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return violations;
}

describe('CA-5 — @Throttle/@SkipThrottle solo usan nombres definidos en ThrottlerModule', () => {
  it('no hay nombres fuera de los definidos en app.module.ts', () => {
    const defined = definedThrottlerNames();
    expect(defined).toContain('global');
    const violations = collectViolations(new Set(defined));
    const summary = violations.map(
      (v) =>
        `${v.file}:${v.line} @${v.decorator}({ ${v.names.join(', ')} }) — definidos: [${defined.join(', ')}]`,
    );
    expect(summary).toEqual([]);
  });
});
