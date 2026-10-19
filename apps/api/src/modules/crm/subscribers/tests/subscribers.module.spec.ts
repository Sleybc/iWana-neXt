import { MODULE_METADATA } from '@nestjs/common/constants';
import { InventoryModule } from '../../../inventory/inventory.module';
import { TasksModule } from '../../../tasks/tasks.module';
import { ExecutionOrderSchedulingModule } from '../../../tasks/execution-order-scheduling.module';
import { SubscribersModule } from '../subscribers.module';
import { SubscriberFiscalCompletenessService } from '../subscriber-fiscal-completeness.service';

jest.mock('../../../inventory/inventory.module', () => ({
  InventoryModule: class InventoryModule {},
}));
jest.mock('../../../tasks/tasks.module', () => ({ TasksModule: class TasksModule {} }));
jest.mock('../../../tasks/execution-order-scheduling.module', () => ({
  ExecutionOrderSchedulingModule: class ExecutionOrderSchedulingModule {},
}));

describe('SubscribersModule', () => {
  it('registra y exporta el servicio de completitud fiscal', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      SubscribersModule,
    ) as unknown[];
    const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, SubscribersModule) as unknown[];

    expect(providers).toContain(SubscriberFiscalCompletenessService);
    expect(exports).toContain(SubscriberFiscalCompletenessService);
  });

  it('consume los puertos propietarios y evita importar TasksModule completo', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, SubscribersModule) as unknown[];
    expect(imports).toContain(InventoryModule);
    expect(imports).toContain(ExecutionOrderSchedulingModule);
    expect(imports).not.toContain(TasksModule);
  });
});
