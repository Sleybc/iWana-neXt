import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import * as ts from 'typescript';

/**
 * CA-6 — ninguna lectura de marcas, autorizaciones, catálogo comercial ni
 * media dentro de una transacción de `crm/contracts` (ni en la proyección que
 * usa la ficha 360°) queda sin el manager del llamante.
 *
 * Extiende el patrón de `crm-blocked-mutations.arch.spec.ts`: el árbol de
 * producción se lee y se afirma con AST, no con grep, para no depender del
 * formato de las líneas. B1-R añade catálogo (`getPlanById`, `createSnapshot`)
 * y media (`mediaService.findOne`, vía `_hasVerifiedStratumEvidence` y
 * `_resolveVatSnapshot`) a los métodos ya cubiertos en B1.
 */
function workspaceRoot(start: string): string {
  let current = resolve(start);
  while (!existsSync(join(current, 'AGENTS.md'))) {
    const parent = dirname(current);
    if (parent === current) throw new Error('No se encontró la raíz del workspace.');
    current = parent;
  }
  return current;
}

const root = workspaceRoot(process.cwd());
const contractsServicePath = join(root, 'apps/api/src/modules/crm/contracts/contracts.service.ts');
const contractReadProjectionPath = join(
  root,
  'apps/api/src/modules/crm/contracts/contract-read-projection.ts',
);
const subscribersServicePath = join(
  root,
  'apps/api/src/modules/crm/subscribers/subscribers.service.ts',
);

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  );
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

/** Nombre de la llamada: propiedad (`this.port.activeMarks`) o identificador. */
function callName(node: ts.CallExpression, source: ts.SourceFile): string {
  const expression = node.expression;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.getText(source);
  return expression.getText(source);
}

function argumentText(
  node: ts.CallExpression,
  index: number,
  source: ts.SourceFile,
): string | null {
  const argument = node.arguments[index];
  return argument ? argument.getText(source) : null;
}

/** Texto completo del callee (`this.commercialCatalogPort.getPlanById`). */
function callTargetText(node: ts.CallExpression, source: ts.SourceFile): string {
  return node.expression.getText(source);
}

function describeSite(node: ts.Node, source: ts.SourceFile): string {
  const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
  return `${source.fileName}:${line + 1}`;
}

interface Rule {
  /** Nombre exacto del callee, tal como aparece en el fuente. */
  callee: string;
  /** Índice del argumento que debe llevar el manager. */
  managerArgument: number;
}

const TRANSACTIONAL_RULES: readonly Rule[] = [
  { callee: 'activeMarks', managerArgument: 1 },
  { callee: 'hasActive', managerArgument: 2 },
  { callee: 'assertSubscriberNotBlocked', managerArgument: 2 },
  { callee: 'requireContractualAuthorization', managerArgument: 1 },
  // D3 (B1-R): catálogo comercial y ayuda de IVA en la misma ruta.
  { callee: 'getPlanById', managerArgument: 3 },
  { callee: 'createSnapshot', managerArgument: 4 },
  { callee: '_resolveVatSnapshot', managerArgument: 2 },
];

describe('CRM · lecturas de Privacy dentro de la transacción (CA-6)', () => {
  it('toda lectura de marcas o autorizaciones dentro de runInTenantSchema lleva el manager', () => {
    const source = parse(contractsServicePath);
    const violations: string[] = [];
    const checked = new Map<string, number>();

    walk(source, (node) => {
      if (!ts.isCallExpression(node) || callName(node, source) !== 'runInTenantSchema') return;
      walk(node, (child) => {
        if (!ts.isCallExpression(child)) return;
        const name = callName(child, source);
        const rule = TRANSACTIONAL_RULES.find((candidate) => candidate.callee === name);
        if (!rule) return;
        checked.set(name, (checked.get(name) ?? 0) + 1);
        const argument = argumentText(child, rule.managerArgument, source);
        if (argument === null || !/manager\b/u.test(argument)) {
          violations.push(`${describeSite(child, source)} · ${name} sin manager`);
        }
      });
    });

    expect(violations).toEqual([]);
    // Sin este mínimo el caso pasaría por vacuidad si el AST dejara de encontrar nada.
    expect(checked.get('activeMarks') ?? 0).toBeGreaterThanOrEqual(1);
    expect(checked.get('assertSubscriberNotBlocked') ?? 0).toBeGreaterThanOrEqual(10);
    expect(checked.get('requireContractualAuthorization') ?? 0).toBeGreaterThanOrEqual(2);
    // D3: catálogo y ayuda de IVA dentro de la transacción.
    expect(checked.get('getPlanById') ?? 0).toBeGreaterThanOrEqual(2);
    expect(checked.get('createSnapshot') ?? 0).toBeGreaterThanOrEqual(1);
    expect(checked.get('_resolveVatSnapshot') ?? 0).toBeGreaterThanOrEqual(5);
  });

  it('toda lectura de catálogo y media en contratos lleva el manager cuando corre en transacción (D3)', () => {
    const source = parse(contractsServicePath);
    const violations: string[] = [];
    const checked = new Map<string, number>();

    const checkManager = (node: ts.CallExpression, name: string, managerArgument: number) => {
      checked.set(name, (checked.get(name) ?? 0) + 1);
      const argument = argumentText(node, managerArgument, source);
      if (argument === null || !/manager\b/u.test(argument)) {
        violations.push(`${describeSite(node, source)} · ${name} sin manager`);
      }
    };

    // Dentro de `runInTenantSchema`: lecturas directas del catálogo y la ayuda
    // de IVA. `findOne` genérico se filtra a `mediaService`, para no contar
    // `qr.manager.findOne` de la propia transacción.
    walk(source, (node) => {
      if (!ts.isCallExpression(node) || callName(node, source) !== 'runInTenantSchema') return;
      walk(node, (child) => {
        if (!ts.isCallExpression(child)) return;
        const name = callName(child, source);
        if (name === 'getPlanById') checkManager(child, name, 3);
        else if (name === 'createSnapshot') checkManager(child, name, 4);
        else if (name === '_resolveVatSnapshot') checkManager(child, name, 2);
        else if (name === 'findOne' && callTargetText(child, source).includes('mediaService')) {
          checkManager(child, name, 2);
        }
      });
    });

    expect(violations).toEqual([]);
    expect(checked.get('getPlanById') ?? 0).toBeGreaterThanOrEqual(2);
    expect(checked.get('createSnapshot') ?? 0).toBeGreaterThanOrEqual(1);
    expect(checked.get('_resolveVatSnapshot') ?? 0).toBeGreaterThanOrEqual(5);
  });

  it('las ayudas de IVA y estrato pasan el manager a catálogo y media (D3)', () => {
    const source = parse(contractsServicePath);
    const violations: string[] = [];
    const checked = new Map<string, number>();

    // `_resolveVatSnapshot` y `_hasVerifiedStratumEvidence` se definen fuera de
    // una `runInTenantSchema` textual: su `manager` es el parámetro opcional de
    // la ayuda y debe reenviarse a las lecturas que ellos hacen.
    walk(source, (node) => {
      if (!ts.isCallExpression(node)) return;
      const name = callName(node, source);
      const target = callTargetText(node, source);
      if (name === 'getPlanById' && target.includes('commercialCatalogPort')) {
        checked.set(name, (checked.get(name) ?? 0) + 1);
        const argument = argumentText(node, 3, source);
        if (argument === null || !/manager\b/u.test(argument)) {
          violations.push(`${describeSite(node, source)} · getPlanById sin manager`);
        }
      } else if (name === 'findOne' && target.includes('mediaService')) {
        checked.set(name, (checked.get(name) ?? 0) + 1);
        const argument = argumentText(node, 2, source);
        if (argument === null || !/manager\b/u.test(argument)) {
          violations.push(`${describeSite(node, source)} · mediaService.findOne sin manager`);
        }
      } else if (
        name === '_hasVerifiedStratumEvidence' &&
        target.includes('_hasVerifiedStratumEvidence')
      ) {
        // La llamada dentro de `_resolveVatSnapshot` pasa el manager; la de
        // `getStratumEvidenceSignedUrl` (fuera de transacción) no lo pasa y
        // conserva la conexión propia, así que solo se exige si hay argumento.
        const argument = argumentText(node, 2, source);
        if (argument !== null && !/manager\b/u.test(argument)) {
          violations.push(
            `${describeSite(node, source)} · _hasVerifiedStratumEvidence sin manager`,
          );
        }
      }
    });

    expect(violations).toEqual([]);
    expect(checked.get('getPlanById') ?? 0).toBeGreaterThanOrEqual(3);
    expect(checked.get('findOne') ?? 0).toBeGreaterThanOrEqual(1);
  });

  it('la proyección de lectura pasa su manager a activeMarks (listado, detalle y ficha 360°)', () => {
    const source = parse(contractReadProjectionPath);
    const sites: string[] = [];
    const violations: string[] = [];

    walk(source, (node) => {
      if (!ts.isCallExpression(node) || callName(node, source) !== 'activeMarks') return;
      sites.push(describeSite(node, source));
      const argument = argumentText(node, 1, source);
      if (argument === null || !/manager\b/u.test(argument)) {
        violations.push(`${describeSite(node, source)} · activeMarks sin manager`);
      }
    });

    expect(violations).toEqual([]);
    expect(sites.length).toBeGreaterThanOrEqual(1);
  });

  it('la ficha 360° proyecta contratos con el manager de su transacción', () => {
    const source = parse(subscribersServicePath);
    const violations: string[] = [];
    let sites = 0;

    walk(source, (node) => {
      if (!ts.isCallExpression(node) || callName(node, source) !== 'projectContractsForRead')
        return;
      sites += 1;
      const argument = argumentText(node, 0, source);
      if (argument === null || !/manager\b/u.test(argument)) {
        violations.push(`${describeSite(node, source)} · projectContractsForRead sin manager`);
      }
    });

    expect(violations).toEqual([]);
    expect(sites).toBeGreaterThanOrEqual(1);
  });
});
