import { Module } from '@nestjs/common';
import { InstallationContractReadPort } from '../../billing/ports/installation-contract-read.port';
import { InstallationContractReadAdapter } from './installation-contract-read.adapter';

/** Módulo fino de CRM: contrato de la OT de instalación para MOD14. Expone solo el puerto. */
@Module({
  providers: [
    InstallationContractReadAdapter,
    { provide: InstallationContractReadPort, useExisting: InstallationContractReadAdapter },
  ],
  exports: [InstallationContractReadPort],
})
export class InstallationContractReadModule {}
