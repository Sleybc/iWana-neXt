import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as ts from 'typescript';

const SRC = join(__dirname, '..');
const sources = (readdirSync(SRC, { recursive: true }) as string[]).filter(
  (file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'),
);

/** Métodos que llaman a `name`, filtrando las llamadas con `keep`. */
function callers(name: string, keep: (call: ts.CallExpression) => boolean): string[] {
  const found: string[] = [];
  for (const file of sources) {
    const text = readFileSync(join(SRC, file), 'utf8');
    if (!text.includes(name)) continue;
    const root = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node, method: string): void => {
      const current = ts.isMethodDeclaration(node) ? node.name.getText() : method;
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.getText().endsWith(name) &&
        keep(node)
      ) {
        found.push(current);
      }
      ts.forEachChild(node, (child) => visit(child, current));
    };
    visit(root, '');
  }
  return found.sort();
}

it('solo el login con código y el refresh firman un token de plataforma sin alcance', () => {
  expect(
    callers('signPlatformAccessToken', (call) => {
      const scope = call.arguments[1];
      return !scope || !ts.isStringLiteral(scope);
    }),
  ).toEqual(['loginPlatform', 'refreshPlatformTokens']);
});

it('solo los dos firmantes llaman a jwtService.sign', () => {
  expect(callers('jwtService.sign', () => true)).toEqual([
    'signAccessToken',
    'signPlatformAccessToken',
  ]);
});

it('solo matchTotpStep verifica códigos TOTP', () => {
  expect(callers('totp.verify', () => true)).toEqual(['matchTotpStep']);
});

it('todo ingreso de plataforma pasa por el freno', () => {
  expect(callers('loginPlatform', () => true)).toEqual(['platformLogin']);
  expect(callers('loginPlatform', (call) => call.arguments[3]?.getText() !== 'attempt')).toEqual(
    [],
  );
  expect(callers('platformLoginThrottle.reserve', () => true)).toEqual(['platformLogin']);
});
