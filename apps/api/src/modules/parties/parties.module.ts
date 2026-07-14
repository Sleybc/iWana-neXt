import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PartiesController } from './parties.controller';
import { PartyService } from './services/party.service';
import { PartyRoleService } from './services/party-role.service';
import { PartyContactService } from './services/party-contact.service';
import { PartyReadAdapter } from './adapters/party-read.adapter';
import { PartyWriteAdapter } from './adapters/party-write.adapter';
import { IPartyReadPort } from './ports/party-read.port';
import { IPartyWritePort } from './ports/party-write.port';
import { Party } from './entities/party.entity';
import { PartyRole } from './entities/party-role.entity';
import { PartyContact } from './entities/party-contact.entity';

/**
 * Módulo Parties (MOD08) — Gestión unificada de terceros por tenant.
 *
 * Exports:
 * - IPartyReadPort: para consumo externo vía puerto (CrmModule, Compras).
 * - IPartyWritePort: puerto de comando para asegurar Party + rol (Compras — ADR-052).
 * - PartyService: para creación de parties desde módulos habilitados (CRM — ADR-030 F4/F5).
 * - PartyRoleService: para asignación de roles desde módulos habilitados (CRM — ADR-030 F4/F5).
 *
 * No exporta Party, PartyRole, PartyContact directamente (boundary estricto).
 * Módulos externos NO tocan las tablas parties directamente.
 *
 * Ref: HLD-MOD08-PARTIES-v1.0 §3, §5
 */
@Module({
  imports: [TypeOrmModule.forFeature([Party, PartyRole, PartyContact])],
  controllers: [PartiesController],
  providers: [
    PartyService,
    PartyRoleService,
    PartyContactService,
    PartyReadAdapter,
    PartyWriteAdapter,
    {
      provide: IPartyReadPort,
      useExisting: PartyReadAdapter,
    },
    {
      provide: IPartyWritePort,
      useExisting: PartyWriteAdapter,
    },
  ],
  exports: [IPartyReadPort, IPartyWritePort, PartyService, PartyRoleService],
})
export class PartiesModule {}
