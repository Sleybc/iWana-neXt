import assert from 'node:assert/strict';
import { globSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const testsDir = fileURLToPath(new URL('../e2e/tests/', import.meta.url));
const evidenceHelper = resolve(testsDir, 'helpers/evidence.ts');
const writeMethods = new Set(['mkdir', 'mkdirSync', 'writeFile', 'writeFileSync']);
const docsSegment = /(?:^|[/\\])docs(?:[/\\]|$)/i;

function callName(callee, checker) {
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  if (!ts.isIdentifier(callee)) return undefined;
  const declaration = checker.getSymbolAtLocation(callee)?.declarations?.[0];
  return declaration && ts.isImportSpecifier(declaration)
    ? (declaration.propertyName ?? declaration.name).text
    : callee.text;
}

function screenshotPath(options, checker) {
  const property = checker.getTypeAtLocation(options).getProperty('path')?.valueDeclaration;
  if (property && ts.isPropertyAssignment(property)) return property.initializer;
  if (property && ts.isShorthandPropertyAssignment(property)) return property.name;
  return undefined;
}

function hasDocsPath(node, checker, seen = new Set()) {
  if (!node || seen.has(node)) return false;
  seen.add(node);
  const hasDocs = (part) => hasDocsPath(part, checker, seen);

  if (ts.isStringLiteralLike(node)) return docsSegment.test(node.text);
  if (ts.isIdentifier(node)) {
    const symbol = ts.isShorthandPropertyAssignment(node.parent)
      ? checker.getShorthandAssignmentValueSymbol(node.parent)
      : checker.getSymbolAtLocation(node);
    const declaration = symbol?.valueDeclaration;
    return declaration && ts.isVariableDeclaration(declaration) && hasDocs(declaration.initializer);
  }
  if (ts.isCallExpression(node)) {
    const name = callName(node.expression, checker);
    return (name === 'join' || name === 'resolve') && node.arguments.some(hasDocs);
  }
  if (ts.isTemplateExpression(node)) {
    return (
      docsSegment.test(node.head.text) ||
      node.templateSpans.some(
        (span) => hasDocs(span.expression) || docsSegment.test(span.literal.text),
      )
    );
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return hasDocs(node.left) || hasDocs(node.right);
  }
  if (ts.isConditionalExpression(node)) return hasDocs(node.whenTrue) || hasDocs(node.whenFalse);
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node))
    return hasDocs(node.expression);
  return false;
}

function violations(files, fixture) {
  const options = { noResolve: true, noLib: true, types: [] };
  const host = ts.createCompilerHost(options);
  if (fixture !== undefined) {
    host.getSourceFile = (file, target) => ts.createSourceFile(file, fixture, target, true);
  }
  const program = ts.createProgram(files, options, host);
  const checker = program.getTypeChecker();
  const matches = [];

  for (const source of program.getSourceFiles()) {
    if (resolve(source.fileName) === evidenceHelper) continue;
    function visit(node) {
      if (ts.isCallExpression(node) && node.arguments.length > 0) {
        const method = callName(node.expression, checker);
        const argument = node.arguments[0];
        const destination =
          method === 'screenshot'
            ? screenshotPath(argument, checker)
            : writeMethods.has(method)
              ? argument
              : undefined;
        if (hasDocsPath(destination, checker)) {
          const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
          matches.push(`${source.fileName}:${line + 1} (${method})`);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return matches;
}

test('la guarda bloquea escrituras directas e indirectas en docs/', () => {
  const source = [
    "import { writeFile as save } from 'node:fs/promises';",
    "const dir = join(process.cwd(), 'docs', 'quality');",
    'const path = `${dir}/capture.png`;',
    'const options = { path };',
    'await page.screenshot(options);',
    "await save(resolve('docs/quality/result.json'), '{}');",
    "mkdirSync('docs/quality', { recursive: true });",
    "await page.screenshot({ path: 'docs/quality/direct.png' });",
  ].join('\n');
  assert.deepEqual(violations(['bloqueado.ts'], source), [
    'bloqueado.ts:5 (screenshot)',
    'bloqueado.ts:6 (writeFile)',
    'bloqueado.ts:7 (mkdirSync)',
    'bloqueado.ts:8 (screenshot)',
  ]);
});

test('la guarda acepta referencias de lectura y capturas mediante el helper', () => {
  const source = [
    "const input = 'docs/quality/source.png';",
    'const data = readFileSync(input);',
    "writeFileSync('test-results/copy.png', data);",
    "await page.screenshot({ path: evidencePath('quality', 'capture.png') });",
    '// Ejemplo anterior: mkdir("docs/quality").',
  ].join('\n');
  assert.deepEqual(violations(['permitido.ts'], source), []);
});

test('las pruebas E2E escriben evidencia en docs/ solo mediante el helper', () => {
  const files = globSync('**/*.ts', { cwd: testsDir }).map((file) => resolve(testsDir, file));
  assert.ok(files.length > 0, 'La guarda debe encontrar archivos E2E');
  assert.deepEqual(violations(files), [], 'Usa helpers/evidence.ts para escribir evidencia');
});
