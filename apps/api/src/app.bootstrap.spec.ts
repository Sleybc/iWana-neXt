jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
  genSalt: jest.fn(),
}));

// otplib@13 tira ESM (@scure/base) incompatible con el runner CJS de Jest.
jest.mock('otplib', () => ({
  TOTP: jest.fn().mockImplementation(() => ({
    generate: jest.fn(),
    verify: jest.fn(),
  })),
  NobleCryptoPlugin: jest.fn(),
  ScureBase32Plugin: jest.fn(),
}));

import { Module } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { HealthModule } from './modules/health/health.module';
import { ExecutionOrderSchedulingModule } from './modules/tasks/execution-order-scheduling.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { WfmModule } from './modules/wfm/wfm.module';

type ForwardRefImport = { forwardRef: () => unknown };

function resolveModuleImport(entry: unknown): unknown {
  if (
    entry !== null &&
    typeof entry === 'object' &&
    'forwardRef' in entry &&
    typeof (entry as ForwardRefImport).forwardRef === 'function'
  ) {
    return (entry as ForwardRefImport).forwardRef();
  }
  return entry;
}

function isUndefinedModuleError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /UndefinedModuleException|is of type "undefined"/i.test(message);
}

/**
 * Red de seguridad del bootstrap (PROMPT-SR-FULL-BOOTSTRAP-CICLO-MODULOS).
 *
 * El defecto real es un `undefined` congelado en `WfmModule.imports` cuando el
 * grafo se evalúa en el orden Nest Health → Tasks → Assurance → Wfm y WFM
 * importa `TasksModule` (ciclo). Los unit tests mockean módulos y no lo ven.
 *
 * Si se revierte la Vía B (Wfm vuelve a importar TasksModule), el primer test
 * falla con `imports[n] === undefined` — demostrado en el informe de cierre.
 */
describe('AppModule bootstrap', () => {
  it('no deja módulos undefined al evaluar el grafo en orden de escaneo Nest', () => {
    jest.resetModules();

    // Mismo orden que el Scope del UndefinedModuleException:
    // AppModule -> HealthModule -> TasksModule -> AssuranceModule -> WfmModule
    require('./modules/health/health.module');
    const { WfmModule: ReloadedWfmModule } = require('./modules/wfm/wfm.module') as {
      WfmModule: new () => unknown;
    };
    const { ExecutionOrderSchedulingModule: ReloadedSchedulingModule } =
      require('./modules/tasks/execution-order-scheduling.module') as {
        ExecutionOrderSchedulingModule: new () => unknown;
      };
    const { TasksModule: ReloadedTasksModule } = require('./modules/tasks/tasks.module') as {
      TasksModule: new () => unknown;
    };

    const imports = (
      (Reflect.getMetadata(MODULE_METADATA.IMPORTS, ReloadedWfmModule) as unknown[] | undefined) ??
      []
    ).map(resolveModuleImport);

    for (const imported of imports) {
      expect(imported).toBeDefined();
      expect(imported).not.toBeNull();
    }

    expect(imports).toContain(ReloadedSchedulingModule);
    expect(imports).not.toContain(ReloadedTasksModule);
  });

  it('createTestingModule del grafo Health no lanza UndefinedModuleException', async () => {
    // Sonda del scanner Nest sobre el camino que fallaba en main.ts.
    // No montamos AppModule completo: TestingModule+TypeORM/Redis es deuda
    // distinta (baseline clamp-page 21), ajena al ciclo de módulos.
    @Module({ imports: [HealthModule] })
    class BootstrapCycleProbeModule {}

    try {
      const moduleRef = await Test.createTestingModule({
        imports: [BootstrapCycleProbeModule],
      }).compile();
      await moduleRef.close();
    } catch (error) {
      expect(isUndefinedModuleError(error)).toBe(false);
    }
  }, 60_000);

  it('WfmModule consume el puerto tipado, no TasksModule', () => {
    const imports = (
      (Reflect.getMetadata(MODULE_METADATA.IMPORTS, WfmModule) as unknown[] | undefined) ?? []
    ).map(resolveModuleImport);

    expect(imports).toContain(ExecutionOrderSchedulingModule);
    expect(imports).not.toContain(TasksModule);
  });
});
