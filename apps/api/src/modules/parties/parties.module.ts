import { Module } from '@nestjs/common';
import { PartiesController } from './parties.controller';
import { PartyService } from './services/party.service';
import { PartyRoleService } from './services/party-role.service';
import { PartyContactService } from './services/party-contact.service';
import { PartyReadAdapter } from './adapters/party-read.adapter';
import { IPartyReadPort } from './ports/party-read.port';

/**
 * Módulo Parties (MOD08) — Gestión unificada de terceros por tenant.
 *
 * Exports:
 * - IPartyReadPort: para consumo externo vía puerto (CrmModule, futuros).
 *
 * No exporta Party, PartyRole, PartyContact ni servicios concretos (boundary estricto).
 * Módulos externos NO tocan las tablas parties directamente.
 *
 * Ref: HLD-MOD08-PARTIES-v1.0 §3, §5
 */
@Module({
  controllers: [PartiesController],
  providers: [
    PartyService,
    PartyRoleService,
    PartyContactService,
    PartyReadAdapter,
    {
      provide: IPartyReadPort,
      useExisting: PartyReadAdapter,
    },
  ],
  exports: [IPartyReadPort],
})
export class PartiesModule {}
