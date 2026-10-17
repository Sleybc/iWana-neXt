import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as ts from 'typescript';

const SAFE_ERROR_SUMMARIZERS = new Set([
  'summarizeErrorForLog',
  'safeErrorType',
  'safeInventoryDlqErrorType',
  'safeExecutionErrorType',
  'safeInventoryErrorType',
  'relayErrorType',
  'cleanupErrorType',
  'pipelineErrorCode',
]);

// Wrappers revisados: solo devuelven resúmenes, nombres incluidos en listas cerradas
// o códigos de dominio con formato restringido; nunca serializan el objeto recibido.

function unwrapExpression(node: ts.Expression): ts.Expression {
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isSatisfiesExpression(node)
  ) {
    node = node.expression;
  }
  return node;
}

function isSafeSummaryCall(node: ts.CallExpression): boolean {
  const callee = ts.isIdentifier(node.expression)
    ? node.expression.text
    : ts.isPropertyAccessExpression(node.expression)
      ? node.expression.name.text
      : '';
  return SAFE_ERROR_SUMMARIZERS.has(callee);
}

const errorTypeByChecker = new WeakMap<ts.TypeChecker, ts.Type | null>();

function getGlobalErrorType(node: ts.Node, checker: ts.TypeChecker): ts.Type | undefined {
  if (!errorTypeByChecker.has(checker)) {
    const errorSymbol = checker
      .getSymbolsInScope(node, ts.SymbolFlags.Type)
      .find((symbol) => symbol.getName() === 'Error');
    errorTypeByChecker.set(
      checker,
      errorSymbol ? checker.getDeclaredTypeOfSymbol(errorSymbol) : null,
    );
  }

  return errorTypeByChecker.get(checker) ?? undefined;
}

function isAssignableToError(node: ts.Node, checker: ts.TypeChecker): boolean {
  const errorType = getGlobalErrorType(node, checker);
  if (!errorType) return false;

  try {
    const candidateType = checker.getTypeAtLocation(node);
    if (candidateType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return false;
    return checker.isTypeAssignableTo(candidateType, errorType);
  } catch {
    return false;
  }
}

function unwrapBindingName(node: ts.BindingName): ts.Identifier[] {
  if (ts.isIdentifier(node)) return [node];
  return node.elements.flatMap((element) =>
    ts.isOmittedExpression(element) ? [] : unwrapBindingName(element.name),
  );
}

function addBindingSymbols(
  name: ts.BindingName,
  checker: ts.TypeChecker,
  symbols: Set<ts.Symbol>,
): boolean {
  let changed = false;
  for (const identifier of unwrapBindingName(name)) {
    const symbol = checker.getSymbolAtLocation(identifier);
    if (symbol && !symbols.has(symbol)) {
      symbols.add(symbol);
      changed = true;
    }
  }
  return changed;
}

function referencesErrorBinding(
  node: ts.Node,
  checker: ts.TypeChecker,
  symbols: ReadonlySet<ts.Symbol>,
): boolean {
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return false;
  if (ts.isCallExpression(node) && isSafeSummaryCall(node)) {
    return false;
  }
  if (
    ts.isIdentifier(node) &&
    (() => {
      const symbol = checker.getSymbolAtLocation(node);
      return symbol !== undefined && symbols.has(symbol);
    })()
  ) {
    return true;
  }

  let found = false;
  ts.forEachChild(node, (child) => {
    if (!found && referencesErrorBinding(child, checker, symbols)) found = true;
  });
  return found;
}

function hasUnsafeErrorData(
  node: ts.Node,
  checker: ts.TypeChecker,
  errorBindings: ReadonlySet<ts.Symbol>,
): boolean {
  if (ts.isCallExpression(node) && isSafeSummaryCall(node)) return false;
  if (referencesErrorBinding(node, checker, errorBindings)) return true;
  if (isAssignableToError(node, checker)) return true;
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return false;

  let unsafe = false;
  ts.forEachChild(node, (child) => {
    if (!unsafe && hasUnsafeErrorData(child, checker, errorBindings)) unsafe = true;
  });
  return unsafe;
}

function callbackAt(node: ts.Expression | undefined): ts.FunctionLikeDeclaration | undefined {
  if (!node) return undefined;
  node = unwrapExpression(node);
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node) ? node : undefined;
}

function collectErrorBindings(source: ts.SourceFile, checker: ts.TypeChecker): Set<ts.Symbol> {
  const errorBindings = new Set<ts.Symbol>();

  const seedBindings = (node: ts.Node): void => {
    if (ts.isCatchClause(node) && node.variableDeclaration) {
      addBindingSymbols(node.variableDeclaration.name, checker, errorBindings);
    }

    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const methodName = node.expression.name.text;
      if (methodName === 'catch') {
        const callback = callbackAt(node.arguments[0]);
        const rejectionParameter = callback?.parameters[0];
        if (rejectionParameter) addBindingSymbols(rejectionParameter.name, checker, errorBindings);
      }

      const eventNode = node.arguments[0];
      if (
        ['on', 'once', 'addListener', 'prependListener'].includes(methodName) &&
        eventNode &&
        (ts.isStringLiteral(eventNode) || ts.isNoSubstitutionTemplateLiteral(eventNode))
      ) {
        const eventName = eventNode.text;
        const callback = callbackAt(node.arguments[1]);
        const parameterIndex = eventName === 'failed' ? 1 : eventName === 'error' ? 0 : -1;
        const errorParameter =
          parameterIndex >= 0 ? callback?.parameters[parameterIndex] : undefined;
        if (errorParameter) addBindingSymbols(errorParameter.name, checker, errorBindings);
      }
    }

    if (ts.isMethodDeclaration(node) && ts.canHaveDecorators(node)) {
      const onWorkerEvent = ts.getDecorators(node)?.find((decorator) => {
        const expression = unwrapExpression(decorator.expression);
        if (!ts.isCallExpression(expression)) return false;
        const decoratorName = ts.isIdentifier(expression.expression)
          ? expression.expression.text
          : ts.isPropertyAccessExpression(expression.expression)
            ? expression.expression.name.text
            : '';
        return decoratorName === 'OnWorkerEvent';
      });
      const decoratorExpression = onWorkerEvent && unwrapExpression(onWorkerEvent.expression);
      const eventName =
        decoratorExpression && ts.isCallExpression(decoratorExpression)
          ? decoratorExpression.arguments[0]
          : undefined;
      if (
        eventName &&
        (ts.isStringLiteral(eventName) || ts.isNoSubstitutionTemplateLiteral(eventName))
      ) {
        const parameterIndex =
          eventName.text === 'failed' ? 1 : eventName.text === 'error' ? 0 : -1;
        const errorParameter = parameterIndex >= 0 ? node.parameters[parameterIndex] : undefined;
        if (errorParameter) addBindingSymbols(errorParameter.name, checker, errorBindings);
      }
    }

    ts.forEachChild(node, seedBindings);
  };
  seedBindings(source);

  let changed = true;
  while (changed) {
    changed = false;
    const visitAliases = (node: ts.Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        node.initializer &&
        hasUnsafeErrorData(node.initializer, checker, errorBindings)
      ) {
        changed = addBindingSymbols(node.name, checker, errorBindings) || changed;
      }

      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(node.left) &&
        hasUnsafeErrorData(node.right, checker, errorBindings)
      ) {
        changed = addBindingSymbols(node.left, checker, errorBindings) || changed;
      }

      ts.forEachChild(node, visitAliases);
    };
    visitAliases(source);
  }

  return errorBindings;
}

function isErrorLoggerCall(node: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) return false;
  if (!['error', 'warn'].includes(node.expression.name.text)) return false;

  const receiver = node.expression.expression.getText();
  return /(?:^|\.)(?:logger|Logger|console)$/u.test(receiver);
}

function hasUnsafeLogCall(text: string): boolean {
  const filePath = resolve(__dirname, 'synthetic-log-fixture.ts');
  const sourceText = [
    'declare const logger: { error(...args: unknown[]): void; warn(...args: unknown[]): void };',
    'declare const console: { error(...args: unknown[]): void; warn(...args: unknown[]): void };',
    'declare const worker: { on(event: string, callback: (...args: unknown[]) => void): void };',
    'declare function OnWorkerEvent(event: string): (...args: unknown[]) => void;',
    'declare const work: () => void;',
    'declare const requestId: string;',
    'declare const domainCode: string;',
    'declare const x: unknown;',
    'declare function summarizeErrorForLog(error: unknown): string;',
    'declare function pipelineErrorCode(error: unknown): string;',
    text,
  ].join('\n');
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.Latest,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
  };
  const host = ts.createCompilerHost(options);
  const originalFileExists = host.fileExists.bind(host);
  const originalReadFile = host.readFile.bind(host);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  const normalizedFixturePath = resolve(filePath).toLowerCase();
  host.fileExists = (path) =>
    resolve(path).toLowerCase() === normalizedFixturePath || originalFileExists(path);
  host.readFile = (path) =>
    resolve(path).toLowerCase() === normalizedFixturePath ? sourceText : originalReadFile(path);
  host.getSourceFile = (path, languageVersion, onError, shouldCreateNewSourceFile) =>
    resolve(path).toLowerCase() === normalizedFixturePath
      ? ts.createSourceFile(path, sourceText, languageVersion, true)
      : originalGetSourceFile(path, languageVersion, onError, shouldCreateNewSourceFile);

  const program = ts.createProgram([filePath], options, host);
  const source = program.getSourceFile(filePath);
  if (!source) throw new Error('No se pudo analizar el fixture sintético de logs');
  return findUnsafeLogArguments(source, program.getTypeChecker()).length > 0;
}

function findUnsafeLogArguments(source: ts.SourceFile, checker: ts.TypeChecker): ts.Expression[] {
  const violations: ts.Expression[] = [];
  const errorBindings = collectErrorBindings(source, checker);
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isErrorLoggerCall(node)) {
      const unsafeArgument = node.arguments.find((argument) =>
        hasUnsafeErrorData(argument, checker, errorBindings),
      );
      if (unsafeArgument) violations.push(unsafeArgument);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return violations;
}

function createProgramFromConfig(configPath: string): ts.Program {
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) throw new Error(`No se pudo leer el tsconfig: ${configPath}`);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, resolve(configPath, '..'));
  const rootNames = parsed.fileNames.filter((filePath) => !/\.(?:spec|test)\.ts$/u.test(filePath));
  return ts.createProgram({ rootNames, options: parsed.options });
}

const SYNTHETIC_UNSAFE_LOGS = [
  [
    'catch binding with a driver-specific name',
    'try { work(); } catch (driverError) { logger.error(driverError); }',
  ],
  [
    'catch binding with a short arbitrary name',
    'try { work(); } catch (x) { logger.warn(String(x)); }',
  ],
  [
    'alias of a catch binding in a template',
    'try { work(); } catch (e) { const problem = e; logger.error(`${problem}`); }',
  ],
  ['destructured catch message', 'try { work(); } catch ({ message }) { logger.error(message); }'],
  [
    'destructured driver detail',
    'try { work(); } catch (x) { const { detail } = x; logger.error(detail); }',
  ],
  ['derived error message', 'try { work(); } catch (e) { logger.error(e.message); }'],
  ['derived driver detail', 'try { work(); } catch (e) { logger.warn(e.detail); }'],
  ['nested driver error', 'try { work(); } catch (e) { logger.error(e.driverError); }'],
  ['promise catch rejection binding', 'Promise.reject(0).catch((boom) => logger.error(boom));'],
  [
    'BullMQ failed handler rejection binding',
    "worker.on('failed', (job, failure) => logger.error(failure));",
  ],
  [
    'BullMQ failed handler with an arbitrary binding',
    "worker.on('failed', (job, fault) => logger.error(fault));",
  ],
  [
    'BullMQ error event with an arbitrary binding',
    "worker.on('error', (fault) => logger.error(fault));",
  ],
  [
    'Nest BullMQ failed decorator handler',
    "class WorkerListener { @OnWorkerEvent('failed') failed(job: unknown, failure: unknown) { logger.error(failure); } }",
  ],
  [
    'Nest BullMQ error decorator handler',
    "class WorkerListener { @OnWorkerEvent('error') failed(fault: unknown) { logger.warn(fault); } }",
  ],
  [
    'JSON serialization of a caught error',
    'try { work(); } catch (err) { logger.error(JSON.stringify(err)); }',
  ],
  ['raw Error by type', "logger.error(new Error('synthetic'));"],
] as const;

const SYNTHETIC_SAFE_LOGS = [
  'logger.error(summarizeErrorForLog(x));',
  'logger.error({ summary: summarizeErrorForLog(x), requestId, code: domainCode });',
  "logger.error('failure=' + summarizeErrorForLog(x));",
  'logger.warn({ code: pipelineErrorCode(x) });',
  "logger.warn('Operation failed');",
  'logger.error({ requestId, code: domainCode });',
] as const;

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && path.endsWith('.ts') && !/\.(?:spec|test)\.ts$/u.test(path)
      ? [path]
      : [];
  });
}

describe('log error safety architecture guard', () => {
  it.each(SYNTHETIC_UNSAFE_LOGS)('rejects synthetic raw-error fixture: %s', (_name, text) => {
    expect(hasUnsafeLogCall(text)).toBe(true);
  });

  it.each(SYNTHETIC_SAFE_LOGS)('accepts safe synthetic log fixture: %s', (text) => {
    expect(hasUnsafeLogCall(text)).toBe(false);
  });

  it('rejects raw errors, messages, driver details, SQL and parameters in API/worker error logs', () => {
    const repoRoot = resolve(__dirname, '../../../../');
    const sourceRoots = [join(repoRoot, 'apps/api/src'), join(repoRoot, 'apps/worker/src')];
    const violations: string[] = [];

    for (const root of sourceRoots) {
      const appRoot = root.includes(`${join('apps', 'worker')}`)
        ? join(repoRoot, 'apps/worker')
        : join(repoRoot, 'apps/api');
      const program = createProgramFromConfig(join(appRoot, 'tsconfig.typecheck.json'));
      const checker = program.getTypeChecker();
      const sourceByPath = new Map(
        program
          .getSourceFiles()
          .map((source) => [resolve(source.fileName).toLowerCase(), source] as const),
      );

      for (const filePath of sourceFiles(root)) {
        const source = sourceByPath.get(resolve(filePath).toLowerCase());
        if (!source) continue;
        for (const unsafeArgument of findUnsafeLogArguments(source, checker)) {
          const { line } = source.getLineAndCharacterOfPosition(unsafeArgument.getStart(source));
          violations.push(`${filePath}:${line + 1}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('requires every API/worker WorkerHost processor to sanitize BullMQ failedReason', () => {
    const repoRoot = resolve(__dirname, '../../../../');
    const sourceRoots = [join(repoRoot, 'apps/api/src'), join(repoRoot, 'apps/worker/src')];
    const violations: string[] = [];

    for (const root of sourceRoots) {
      for (const filePath of sourceFiles(root)) {
        const text = readFileSync(filePath, 'utf8');
        const source = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);
        const visit = (node: ts.Node): void => {
          if (ts.isClassDeclaration(node)) {
            const isWorkerHost = node.heritageClauses?.some(
              (clause) =>
                clause.token === ts.SyntaxKind.ExtendsKeyword &&
                clause.types.some((type) => type.expression.getText(source).endsWith('WorkerHost')),
            );
            const processMethod = node.members.find(
              (member): member is ts.MethodDeclaration =>
                ts.isMethodDeclaration(member) &&
                ts.isIdentifier(member.name) &&
                member.name.text === 'process',
            );
            const decorators =
              processMethod && ts.canHaveDecorators(processMethod)
                ? ts.getDecorators(processMethod)
                : undefined;
            const isSanitized = decorators?.some((decorator) =>
              decorator.expression.getText(source).includes('SanitizeFailedReason'),
            );
            if (isWorkerHost && processMethod && !isSanitized) {
              const { line } = source.getLineAndCharacterOfPosition(processMethod.getStart(source));
              violations.push(`${filePath}:${line + 1}`);
            }
          }
          ts.forEachChild(node, visit);
        };
        visit(source);
      }
    }

    expect(violations).toEqual([]);
  });
});
