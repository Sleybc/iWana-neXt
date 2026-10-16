import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ContractsController } from '../contracts/contracts.controller';
import { ExpedientesController } from '../expedientes/expedientes.controller';
import { SubscribersController } from '../subscribers/subscribers.controller';

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

describe('CRM blocked titular mutation guards', () => {
  it('marks every mutating handler in the three CRM controllers or matches a closed exception', () => {
    const controllers = [SubscribersController, ContractsController, ExpedientesController];
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
});
