import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import * as ts from 'typescript';

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && path.endsWith('.ts') && !/\.(?:spec|test)\.ts$/u.test(path)
      ? [path]
      : [];
  });
}

function decoratorsOf(node: ts.Node): readonly ts.Decorator[] {
  return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
}

function decoratorName(decorator: ts.Decorator): string | null {
  const expression = decorator.expression;
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression)) {
    return expression.expression.text;
  }
  return null;
}

function hasAllowDecorator(property: ts.PropertyDeclaration): boolean {
  return decoratorsOf(property).some((decorator) => decoratorName(decorator) === 'Allow');
}

function hasTypeDecorator(property: ts.PropertyDeclaration): boolean {
  return decoratorsOf(property).some((decorator) => decoratorName(decorator) === 'Type');
}

function isObjectElementType(type: ts.Type, checker: ts.TypeChecker): boolean {
  if (type.isUnion()) return type.types.some((member) => isObjectElementType(member, checker));
  const primitiveFlags =
    ts.TypeFlags.StringLike |
    ts.TypeFlags.NumberLike |
    ts.TypeFlags.BooleanLike |
    ts.TypeFlags.BigIntLike |
    ts.TypeFlags.ESSymbolLike |
    ts.TypeFlags.Null |
    ts.TypeFlags.Undefined |
    ts.TypeFlags.Void |
    ts.TypeFlags.Never;
  return (type.flags & primitiveFlags) === 0;
}

function arrayTypes(type: ts.Type, checker: ts.TypeChecker): ts.Type[] {
  if (type.isUnionOrIntersection()) {
    return type.types.flatMap((member) => arrayTypes(member, checker));
  }
  return checker.isArrayType(type) || checker.isTupleType(type) ? [type] : [];
}

function missingElementTypeProperties(
  source: ts.SourceFile,
  checker: ts.TypeChecker,
): ts.PropertyDeclaration[] {
  const missing: ts.PropertyDeclaration[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyDeclaration(node) && hasAllowDecorator(node) && !hasTypeDecorator(node)) {
      const propertyType = node.type ? checker.getTypeAtLocation(node.type) : undefined;
      if (propertyType) {
        const containsObjectArray = arrayTypes(propertyType, checker).some((arrayType) =>
          checker
            .getTypeArguments(arrayType as ts.TypeReference)
            .some((elementType) => isObjectElementType(elementType, checker)),
        );
        if (containsObjectArray) missing.push(node);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return missing;
}

function missingElementTypeCount(sourceText: string): number {
  const fileName = resolve(__dirname, 'synthetic-dto.ts');
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.Latest,
    experimentalDecorators: true,
    strict: true,
  };
  const host = ts.createCompilerHost(options);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  const originalFileExists = host.fileExists.bind(host);
  const originalReadFile = host.readFile.bind(host);
  host.getSourceFile = (path, languageVersionOrOptions, onError, shouldCreateNewSourceFile) =>
    resolve(path).toLowerCase() === fileName.toLowerCase()
      ? ts.createSourceFile(path, sourceText, languageVersionOrOptions as ts.ScriptTarget, true)
      : originalGetSourceFile(path, languageVersionOrOptions, onError, shouldCreateNewSourceFile);
  host.fileExists = (path) =>
    resolve(path).toLowerCase() === fileName.toLowerCase() || originalFileExists(path);
  host.readFile = (path) =>
    resolve(path).toLowerCase() === fileName.toLowerCase() ? sourceText : originalReadFile(path);

  const program = ts.createProgram([fileName], options, host);
  const source = program.getSourceFile(fileName);
  if (!source) throw new Error('No se pudo crear el DTO sintético de la guardia.');
  return missingElementTypeProperties(source, program.getTypeChecker()).length;
}

describe('@Allow array DTO architecture guard', () => {
  it('falla ante arrays de objetos sin @Type, incluso en uniones nullable', () => {
    expect(
      missingElementTypeCount(`class SyntheticDto { @Allow() items!: Array<{ value: string }>; }`),
    ).toBe(1);
    expect(
      missingElementTypeCount(
        `class ElementDto { value!: string; } class SyntheticDto { @Allow() items!: ElementDto[] | null; }`,
      ),
    ).toBe(1);
    expect(
      missingElementTypeCount(
        `class ElementDto { value!: string; } class SyntheticDto { @Allow() @Type(() => ElementDto) items!: ElementDto[]; }`,
      ),
    ).toBe(0);
    expect(missingElementTypeCount(`class SyntheticDto { @Allow() items!: string[]; }`)).toBe(0);
    expect(
      missingElementTypeCount(`class SyntheticDto { @Allow() items!: string[] | null; }`),
    ).toBe(0);
  });

  it('requires @Type(() => ElementDto) for every @Allow array whose element type is an object', () => {
    const repoRoot = resolve(__dirname, '../../../../');
    const apiRoot = join(repoRoot, 'apps/api');
    const configPath = join(apiRoot, 'tsconfig.typecheck.json');
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    if (config.error)
      throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(configPath));
    const program = ts.createProgram(parsed.fileNames, parsed.options);
    const checker = program.getTypeChecker();
    const sourceByPath = new Map(
      program.getSourceFiles().map((source) => [resolve(source.fileName).toLowerCase(), source]),
    );
    const violations: string[] = [];

    const boundaryDtoRoots = [
      join(apiRoot, 'src/modules/crm/subscribers/dto'),
      join(apiRoot, 'src/modules/crm/expedientes/dto'),
      join(apiRoot, 'src/modules/tasks/dto'),
    ];
    for (const root of boundaryDtoRoots) {
      for (const filePath of sourceFiles(root)) {
        const source = sourceByPath.get(resolve(filePath).toLowerCase());
        if (!source) continue;
        for (const property of missingElementTypeProperties(source, checker)) {
          const { line } = source.getLineAndCharacterOfPosition(property.getStart(source));
          violations.push(`${filePath}:${line + 1}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
