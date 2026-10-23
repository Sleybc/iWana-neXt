import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import * as ts from 'typescript';
import { NETWORK_ERROR_CODES } from '@iwana/shared';

function readTypeScriptSources(directory: string): Array<{ path: string; source: string }> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return readTypeScriptSources(path);
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.spec.ts')) return [];
    return [{ path, source: readFileSync(path, 'utf8') }];
  });
}

type ParsedSource = { path: string; sourceFile: ts.SourceFile };

function parsedSource(path: string): ParsedSource {
  const source = readFileSync(path, 'utf8');
  return {
    path,
    sourceFile: ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true),
  };
}

function databaseImportBindings(sourceFile: ts.SourceFile): Map<string, string> {
  const bindings = new Map<string, string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    if (statement.moduleSpecifier.text !== '@iwana/db') continue;
    const namedBindings = statement.importClause?.namedBindings;
    if (!namedBindings || !ts.isNamedImports(namedBindings)) continue;
    for (const element of namedBindings.elements) {
      bindings.set(element.name.text, element.propertyName?.text ?? element.name.text);
    }
  }
  return bindings;
}

function referencedDatabaseEntities(sources: Array<{ path: string; source: string }>): Set<string> {
  const methods = new Set([
    'find',
    'findOne',
    'findOneBy',
    'findAndCount',
    'findAndCountBy',
    'save',
    'update',
    'insert',
    'delete',
    'remove',
    'upsert',
    'softRemove',
    'getRepository',
    'getTreeRepository',
  ]);
  const entities = new Set<string>();

  for (const { path, source } of sources) {
    const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
    const bindings = databaseImportBindings(sourceFile);
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const expression = node.expression;
        const method = ts.isPropertyAccessExpression(expression) ? expression.name.text : '';
        const entityArgument = node.arguments[0];
        if (methods.has(method) && entityArgument && ts.isIdentifier(entityArgument)) {
          const entity = bindings.get(entityArgument.text);
          if (entity) entities.add(entity);
        }
        if (
          ts.isIdentifier(expression) &&
          expression.text === 'InjectRepository' &&
          entityArgument &&
          ts.isIdentifier(entityArgument)
        ) {
          const entity = bindings.get(entityArgument.text);
          if (entity) entities.add(entity);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return entities;
}

function resolveModuleImport(importer: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(importer), specifier);
  const candidates = [base.endsWith('.ts') ? base : `${base}.ts`, join(base, 'index.ts')];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function reachableModuleSources(entryPath: string): ParsedSource[] {
  const visited = new Set<string>();
  const sources: ParsedSource[] = [];
  const visit = (path: string): void => {
    if (visited.has(path)) return;
    visited.add(path);
    const parsed = parsedSource(path);
    sources.push(parsed);
    for (const statement of parsed.sourceFile.statements) {
      if (
        !ts.isImportDeclaration(statement) ||
        !ts.isStringLiteral(statement.moduleSpecifier) ||
        !statement.moduleSpecifier.text.endsWith('.module')
      ) {
        continue;
      }
      const importedModule = resolveModuleImport(path, statement.moduleSpecifier.text);
      if (importedModule) visit(importedModule);
    }
  };
  visit(entryPath);
  return sources;
}

function registeredDatabaseEntities(moduleSources: ParsedSource[]): Set<string> {
  const entities = new Set<string>();
  for (const { sourceFile } of moduleSources) {
    const bindings = databaseImportBindings(sourceFile);
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'forFeature' &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'TypeOrmModule' &&
        node.arguments[0] &&
        ts.isArrayLiteralExpression(node.arguments[0])
      ) {
        for (const element of node.arguments[0].elements) {
          if (!ts.isIdentifier(element)) continue;
          const entity = bindings.get(element.text);
          if (entity) entities.add(entity);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return entities;
}

describe('MOD13 — errores HTTP y frontera CRM', () => {
  it('solo emite códigos HTTP del contrato cerrado fuera del consumidor del inbox', () => {
    const sources = readTypeScriptSources(join(__dirname, '..')).filter(
      ({ path }) => !path.endsWith('network-execution-event.processor.ts'),
    );
    const emittedCodes = new Set(
      sources.flatMap(({ source }) =>
        [...source.matchAll(/\bcode\s*:\s*['"]([A-Z][A-Z0-9_]*)['"]/gu)].map(
          (match) => match[1] as string,
        ),
      ),
    );
    const allowedCodes = new Set<string>([...NETWORK_ERROR_CODES, 'FORBIDDEN', 'VALIDATION_ERROR']);

    expect(emittedCodes.has('NETWORK_POOL_EXHAUSTED')).toBe(true);
    expect(emittedCodes.has('NETWORK_NOT_IN_ROUTER')).toBe(true);
    expect([...emittedCodes].filter((code) => !allowedCodes.has(code))).toEqual([]);
  });

  it('CRM importa el módulo estrecho que solo publica el puerto comercial de MOD13', () => {
    const crmModuleSource = readFileSync(join(__dirname, '../../crm/crm.module.ts'), 'utf8');
    const commercialStatusModuleSource = readFileSync(
      join(__dirname, '../network-commercial-status.module.ts'),
      'utf8',
    );
    const exportsBlock = commercialStatusModuleSource.match(/exports:\s*\[([^\]]*)\]/)?.[1] ?? '';

    expect(crmModuleSource).toContain('NetworkCommercialStatusModule');
    expect(crmModuleSource).not.toMatch(/from ['"][^'"]*network\.module['"]/u);
    expect(exportsBlock.trim()).toBe('SERVICE_PROVISIONING_COMMERCIAL_STATUS_PORT');
    expect(commercialStatusModuleSource).toContain('ServiceProvisioningCommercialStatusAdapter');
  });

  it('registra en forFeature toda entidad de @iwana/db usada por network', () => {
    const networkSources = readTypeScriptSources(join(__dirname, '..'));
    const entryModule = join(__dirname, '..', 'network.module.ts');
    const registered = registeredDatabaseEntities(reachableModuleSources(entryModule));
    const referenced = referencedDatabaseEntities(networkSources);
    const missing = [...referenced].filter((entity) => !registered.has(entity)).sort();

    expect([...referenced].sort()).toEqual(
      expect.arrayContaining(['IpAssignment', 'NetworkInboxEvent', 'ServiceProvisioning']),
    );
    expect(missing).toEqual([]);
  });
});
