import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ContractsController } from '../contracts/contracts.controller';
import { ExpedientesController } from '../expedientes/expedientes.controller';
import { SubscribersController } from '../subscribers/subscribers.controller';
import { SubscriberTaxController } from '../subscribers/subscriber-tax.controller';

const BLOCKED_TITULAR_METADATA = 'privacy:blocked-titular-guard';
const MUTATION_METHODS = new Set([
  RequestMethod.POST,
  RequestMethod.PATCH,
  RequestMethod.PUT,
  RequestMethod.DELETE,
]);
const CLOSED_EXCEPTIONS = new Set([
  'POST /crm/subscribers',
  'POST /crm/subscribers/search',
  'POST /crm/expedientes',
]);

function workspaceRoot(start: string): string {
  let current = resolve(start);
  while (!existsSync(join(current, 'AGENTS.md'))) {
    const parent = dirname(current);
    if (parent === current) throw new Error('No se encontró la raíz del workspace.');
    current = parent;
  }
  return current;
}

function productionTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (
      entry.isDirectory() &&
      !['.next', 'coverage', 'dist', 'node_modules'].includes(entry.name)
    ) {
      return productionTypeScriptFiles(join(directory, entry.name));
    }
    if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.d.ts') &&
      !entry.name.endsWith('.spec.ts')
    ) {
      return [join(directory, entry.name)];
    }
    return [];
  });
}

describe('CRM blocked titular mutation guards', () => {
  it('marks every mutating handler in the three CRM controllers or matches a closed exception', () => {
    const controllers = [
      SubscribersController,
      SubscriberTaxController,
      ContractsController,
      ExpedientesController,
    ];
    const missing: string[] = [];

    for (const controller of controllers) {
      const controllerPath = Reflect.getMetadata(PATH_METADATA, controller) as string | string[];
      const prefix = (Array.isArray(controllerPath) ? controllerPath : [controllerPath])
        .filter(Boolean)
        .join('/');

      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        if (name === 'constructor') continue;
        const handler = (controller.prototype as unknown as Record<string, unknown>)[name];
        if (typeof handler !== 'function') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        if (method === undefined || !MUTATION_METHODS.has(method)) continue;

        const routeMetadata = Reflect.getMetadata(PATH_METADATA, handler) as string | string[];
        const suffix = (Array.isArray(routeMetadata) ? routeMetadata : [routeMetadata])
          .filter(Boolean)
          .join('/');
        const route = `/${[prefix, suffix].filter(Boolean).join('/')}`
          .replace(/\/{2,}/g, '/')
          .replace(/\/$/, '');
        const signature = `${RequestMethod[method]} ${route}`;
        if (CLOSED_EXCEPTIONS.has(signature)) continue;

        const guardMetadata = Reflect.getMetadata(BLOCKED_TITULAR_METADATA, handler);
        const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[] | undefined;
        if (!guardMetadata || !guards?.length) missing.push(signature);
      }
    }

    expect(missing).toEqual([]);
  });

  it('allows anonymized titulares only on the contract archive route', () => {
    const controllerPath = Reflect.getMetadata(PATH_METADATA, ContractsController) as
      | string
      | string[];
    const prefix = (Array.isArray(controllerPath) ? controllerPath : [controllerPath])
      .filter(Boolean)
      .join('/');
    const allowedRoutes: string[] = [];

    for (const name of Object.getOwnPropertyNames(ContractsController.prototype)) {
      if (name === 'constructor') continue;
      const handler = (ContractsController.prototype as unknown as Record<string, unknown>)[name];
      if (typeof handler !== 'function') continue;
      if (Reflect.getMetadata('privacy:allow-anonymized-titular', handler) !== true) continue;

      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      const routeMetadata = Reflect.getMetadata(PATH_METADATA, handler) as string | string[];
      const suffix = (Array.isArray(routeMetadata) ? routeMetadata : [routeMetadata])
        .filter(Boolean)
        .join('/');
      const route = `/${[prefix, suffix].filter(Boolean).join('/')}`
        .replace(/\/{2,}/g, '/')
        .replace(/\/$/, '');
      allowedRoutes.push(`${RequestMethod[method ?? RequestMethod.GET]} ${route}`);
    }

    expect(allowedRoutes).toEqual(['POST /crm/contracts/:id/archive']);
  });

  it('allows the erasure bypass only in the API adapter and emergency CLI', () => {
    const root = workspaceRoot(process.cwd());
    const allowed = [
      'apps/api/src/cli/anonymize-titular.ts',
      'apps/api/src/modules/crm/privacy-adapters/crm-personal-data-erasure.adapter.ts',
    ].sort();
    const bypassPattern = /set_config\s*\(\s*['"]iwana\.titular_erasure['"]/u;
    const found = ['apps', 'packages']
      .flatMap((directory) => productionTypeScriptFiles(join(root, directory)))
      .filter((file) => bypassPattern.test(readFileSync(file, 'utf8')))
      .map((file) => relative(root, file).replaceAll('\\', '/'))
      .sort();

    expect(found).toEqual(allowed);
  });
});
