import { Module } from '@nestjs/common';
import { AssuranceAssigneeNamesPort } from '../../assurance/ports/assurance-assignee-names.port';
import { AssuranceAssigneeNamesAdapter } from './assurance-assignee-names.adapter';

/**
 * Usuarios consumido por Assurance (spec MOD05 pestaña Soporte §16 B-1). Expone solo el puerto:
 * Assurance no importa UsersModule (controladores, colas) ni la clase del adaptador.
 */
@Module({
  providers: [
    AssuranceAssigneeNamesAdapter,
    { provide: AssuranceAssigneeNamesPort, useExisting: AssuranceAssigneeNamesAdapter },
  ],
  exports: [AssuranceAssigneeNamesPort],
})
export class AssuranceAssigneeNamesModule {}
